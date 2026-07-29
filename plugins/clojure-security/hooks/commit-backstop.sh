#!/usr/bin/env bash
# PreToolUse hook: backstop scan before a `git commit` is allowed to run.
#
# This is the third line of defense. If the PostToolUse and Stop hooks
# were bypassed (skipped tool, --no-verify equivalent, hook disabled, or
# Claude is explicitly told to commit without normal review), this hook
# still runs immediately before `git commit` and refuses to let secrets
# or known-bad Clojure security patterns enter history.
#
# Contract (Claude Code PreToolUse protocol):
#   stdin  — JSON with .tool_input.command (the bash command about to run)
#   exit 0 — allow the tool call
#   exit 2 — block the tool call (stderr surfaced to Claude as the reason)
#
# Scope:
#   The staged diff. Staged Clojure files are scanned with semgrep against
#   their staged content (via `git show :path`, not the working tree) so a
#   partially-staged file is scanned faithfully. gitleaks runs in its native
#   `protect --staged` mode against the index.

set -e

# --- read input -------------------------------------------------------------

INPUT="$(cat 2>/dev/null || true)"
command -v jq >/dev/null 2>&1 || exit 0

TOOL_NAME="$(printf '%s' "$INPUT" | jq -r '.tool_name // empty')"
[ "$TOOL_NAME" = "Bash" ] || exit 0

COMMAND="$(printf '%s' "$INPUT" | jq -r '.tool_input.command // empty')"
[ -z "$COMMAND" ] && exit 0

# --- match `git commit` (allow flags; ignore `git commit-tree`, etc.) -------

# Trim leading whitespace.
TRIMMED="$(printf '%s' "$COMMAND" | sed -E 's/^[[:space:]]+//')"

# Allow common safe forms to fall through (e.g. `git commit --help`).
case "$TRIMMED" in
  "git commit --help"*|"git commit -h"*) exit 0 ;;
esac

# Match `git commit` and `git commit <flag/arg>`, but NOT `git commit-tree`.
if ! printf '%s' "$TRIMMED" | grep -Eq '^git[[:space:]]+commit($|[[:space:]])'; then
  exit 0
fi

# --- locate the repo -------------------------------------------------------

CWD="$(printf '%s' "$INPUT" | jq -r '.cwd // empty')"
[ -z "$CWD" ] && CWD="${CLAUDE_PROJECT_DIR:-$PWD}"
cd "$CWD" 2>/dev/null || exit 0
git rev-parse --git-dir >/dev/null 2>&1 || exit 0

# --- skip outside a Clojure project ----------------------------------------
# This plugin only scans Clojure repos. Without this gate the backstop would
# run gitleaks on every `git commit` in any repo the session touches.

is_clojure_project() {
  [ -f "$CWD/deps.edn" ] || [ -f "$CWD/project.clj" ] || \
    [ -f "$CWD/shadow-cljs.edn" ] || [ -f "$CWD/build.boot" ] || \
    [ -f "$CWD/bb.edn" ]
}

is_clojure_project || exit 0

# --- enumerate staged files ------------------------------------------------

STAGED="$(git diff --cached --name-only --diff-filter=ACMR 2>/dev/null || true)"
if [ -z "$STAGED" ]; then
  # Nothing staged → either `git commit` with -a or with nothing, no harm.
  exit 0
fi

CLJ_STAGED=""
while IFS= read -r f; do
  [ -z "$f" ] && continue
  case "$f" in
    *.clj|*.cljs|*.cljc|*.edn|*.bb) CLJ_STAGED="${CLJ_STAGED}${f}"$'\n' ;;
  esac
done <<<"$STAGED"

# --- tool availability ----------------------------------------------------

HAVE_SEMGREP=0
HAVE_GITLEAKS=0
command -v semgrep  >/dev/null 2>&1 && HAVE_SEMGREP=1
command -v gitleaks >/dev/null 2>&1 && HAVE_GITLEAKS=1
if [ "$HAVE_SEMGREP" -eq 0 ] && [ "$HAVE_GITLEAKS" -eq 0 ]; then
  exit 0
fi

# shellcheck source=lib/semgrep-rules.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib/semgrep-rules.sh"

# --- gitleaks against the staged index ------------------------------------

GITLEAKS_REPORT=""
GITLEAKS_COUNT=0
if [ "$HAVE_GITLEAKS" -eq 1 ]; then
  TMP_LEAKS="$(mktemp -d 2>/dev/null || true)"
  if [ -n "$TMP_LEAKS" ]; then
    REPORT_FILE="${TMP_LEAKS}/leaks.json"
    # `gitleaks protect --staged` is designed for pre-commit; scans the
    # index regardless of working-tree state.
    gitleaks protect --staged \
      --no-banner --redact \
      --report-format json \
      --report-path "$REPORT_FILE" >/dev/null 2>&1 || true

    if [ -f "$REPORT_FILE" ]; then
      GITLEAKS_COUNT="$(jq 'length' "$REPORT_FILE" 2>/dev/null || echo 0)"
      if [ "$GITLEAKS_COUNT" != "0" ] && [ -n "$GITLEAKS_COUNT" ]; then
        GITLEAKS_REPORT="$(
          jq -r '.[] | "\(.File):\(.StartLine)  SECRET  [\(.RuleID)]  \(.Description) — \(.Match)"' \
             "$REPORT_FILE" 2>/dev/null
        )"
      fi
    fi
    rm -rf "$TMP_LEAKS"
  fi
fi

# --- semgrep against staged content of staged Clojure files ----------------

SEMGREP_ERRORS=""
SEMGREP_WARNINGS=""
SEMGREP_ERROR_COUNT=0
SEMGREP_WARN_COUNT=0

if [ "$HAVE_SEMGREP" -eq 1 ] && [ -n "$CLJ_STAGED" ]; then
  RULES_DIR="$(resolve_semgrep_rules)"
  if [ -n "$RULES_DIR" ]; then
    TMP_SG="$(mktemp -d 2>/dev/null || true)"
    if [ -n "$TMP_SG" ]; then
      # The tmp-tree mirror stays, unlike in the Stop hook: this must scan
      # STAGED content (`git show :path`), which by definition is not what is
      # on disk when a file is partially staged.
      SG_FILES=""
      while IFS= read -r f; do
        [ -z "$f" ] && continue
        mkdir -p "${TMP_SG}/$(dirname "$f")"
        if ! git show ":$f" > "${TMP_SG}/$f" 2>/dev/null; then
          cp "$f" "${TMP_SG}/$f" 2>/dev/null || true
        fi
        SG_FILES="${SG_FILES}${TMP_SG}/${f}"$'\n'
      done <<<"$CLJ_STAGED"

      SG_OUT="${TMP_SG}/__semgrep.json"

      # A bash array, not `xargs` — see the Stop hook for why: xargs splits on
      # whitespace and would silently drop a path containing a space.
      SG_ARGS=()
      while IFS= read -r f; do
        [ -n "$f" ] && SG_ARGS+=("$f")
      done <<<"$SG_FILES"

      semgrep scan --json --quiet --config "$RULES_DIR" "${SG_ARGS[@]}" \
        > "$SG_OUT" 2>/dev/null || true

      # Strip the tmp-tree prefix so reported paths are repo-relative, and the
      # config-path prefix off check_id so the rule name is the bare id.
      #
      # `|| true` on both, and the `-s` guard: jq exits 5 on the truncated JSON a
      # semgrep killed mid-write leaves behind, and a bare `X="$(cmd)"` is not
      # exempt from `set -e`. Unguarded, this blocks a commit with an
      # uncontracted exit 5 and no message.
      if [ -s "$SG_OUT" ]; then
        SEMGREP_ERRORS="$(jq -r --arg prefix "${TMP_SG}/" '
          .results[]? | select(.extra.severity == "ERROR")
          | "\(.path | sub($prefix; "")):\(.start.line):\(.start.col)  ERROR  [\(.check_id | split(".") | last)]  \(.extra.message | gsub("\\s+"; " "))"
        ' "$SG_OUT" 2>/dev/null || true)"

        SEMGREP_WARNINGS="$(jq -r --arg prefix "${TMP_SG}/" '
          .results[]? | select(.extra.severity == "WARNING")
          | "\(.path | sub($prefix; "")):\(.start.line):\(.start.col)  WARNING  [\(.check_id | split(".") | last)]  \(.extra.message | gsub("\\s+"; " "))"
        ' "$SG_OUT" 2>/dev/null || true)"
      fi

      if [ -n "$SEMGREP_ERRORS" ]; then
        SEMGREP_ERROR_COUNT="$(printf '%s\n' "$SEMGREP_ERRORS" | wc -l | tr -d ' ')"
      fi
      if [ -n "$SEMGREP_WARNINGS" ]; then
        SEMGREP_WARN_COUNT="$(printf '%s\n' "$SEMGREP_WARNINGS" | wc -l | tr -d ' ')"
      fi

      rm -rf "$TMP_SG"
    fi
  fi
fi

# --- decide -----------------------------------------------------------------

if [ "$SEMGREP_ERROR_COUNT" -eq 0 ] && [ "$SEMGREP_WARN_COUNT" -eq 0 ] \
   && [ "$GITLEAKS_COUNT" = "0" ]; then
  exit 0
fi

{
  if [ "$SEMGREP_ERROR_COUNT" -gt 0 ] || [ "$GITLEAKS_COUNT" != "0" ]; then
    echo "Commit blocked by clojure-security backstop. Staged diff has findings:"
  else
    echo "clojure-security backstop — advisory findings in the staged diff."
    echo "Not blocking: these rules do not gate CI either."
  fi
  echo
  if [ -n "$GITLEAKS_REPORT" ]; then
    echo "## Secrets (gitleaks --staged) — ${GITLEAKS_COUNT}"
    printf '%s\n' "$GITLEAKS_REPORT"
    echo
  fi
  if [ -n "$SEMGREP_ERRORS" ]; then
    echo "## Clojure security patterns (semgrep, blocking) — ${SEMGREP_ERROR_COUNT}"
    printf '%s\n' "$SEMGREP_ERRORS"
    echo
  fi
  if [ -n "$SEMGREP_WARNINGS" ]; then
    echo "## Clojure security patterns (semgrep, advisory) — ${SEMGREP_WARN_COUNT}"
    printf '%s\n' "$SEMGREP_WARNINGS"
    echo
  fi
  if [ "$SEMGREP_ERROR_COUNT" -gt 0 ] || [ "$GITLEAKS_COUNT" != "0" ]; then
    echo "Fix the findings (or unstage the offending files) and re-attempt"
    echo "the commit. To override, the human can run the commit themselves"
    echo "after acknowledging the finding — this backstop is for Claude,"
    echo "not for humans with full context."
  fi
} >&2

# A PreToolUse hook has no advisory exit code — 1 does not block any more than
# 0 does — so advisory findings print and the commit proceeds.
if [ "$SEMGREP_ERROR_COUNT" -gt 0 ] || [ "$GITLEAKS_COUNT" != "0" ]; then
  exit 2
fi
exit 0
