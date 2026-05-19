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
#   The staged diff. Working-tree copies of staged Clojure files are
#   scanned by clj-holmes (a small fidelity gap when only part of a file
#   is staged; acceptable for a backstop). gitleaks runs in its native
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

HAVE_HOLMES=0
HAVE_GITLEAKS=0
command -v clj-holmes >/dev/null 2>&1 && HAVE_HOLMES=1
command -v gitleaks   >/dev/null 2>&1 && HAVE_GITLEAKS=1
if [ "$HAVE_HOLMES" -eq 0 ] && [ "$HAVE_GITLEAKS" -eq 0 ]; then
  exit 0
fi

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

# --- clj-holmes against working-tree copies of staged Clojure files -------

HOLMES_REPORT=""
HOLMES_COUNT=0
HOLMES_RULES_DIR="${CLJ_HOLMES_RULES_DIR:-/tmp/clj-holmes-rules}"
if [ "$HAVE_HOLMES" -eq 1 ] && [ -n "$CLJ_STAGED" ] && [ -d "$HOLMES_RULES_DIR" ]; then
  TMP_HOLMES="$(mktemp -d 2>/dev/null || true)"
  if [ -n "$TMP_HOLMES" ]; then
    while IFS= read -r f; do
      [ -z "$f" ] && continue
      mkdir -p "${TMP_HOLMES}/$(dirname "$f")"
      # Use staged content via `git show :path` so partial-stage findings
      # are caught even if the working tree was cleaned up. Fall back to
      # the working-tree copy on error.
      if ! git show ":$f" > "${TMP_HOLMES}/$f" 2>/dev/null; then
        cp "$f" "${TMP_HOLMES}/$f" 2>/dev/null || true
      fi
    done <<<"$CLJ_STAGED"

    HOLMES_OUT="${TMP_HOLMES}/__holmes.json"
    clj-holmes scan -p "$TMP_HOLMES" -d "$HOLMES_RULES_DIR" \
      -t json -o "$HOLMES_OUT" >/dev/null 2>&1 || true

    if [ -f "$HOLMES_OUT" ]; then
      HOLMES_REPORT="$(
        jq -r --arg prefix "${TMP_HOLMES}/" '
          .[] as $rule
          | $rule.findings[]
          | "\($rule.filename | sub($prefix; "")):\(.row):\(.col)  RISK  [\($rule.name)]  \($rule.message) — \(.code)"
        ' "$HOLMES_OUT" 2>/dev/null
      )"
      if [ -n "$HOLMES_REPORT" ]; then
        HOLMES_COUNT="$(printf '%s\n' "$HOLMES_REPORT" | wc -l | tr -d ' ')"
      fi
    fi
    rm -rf "$TMP_HOLMES"
  fi
fi

# --- decide -------------------------------------------------------------

if [ "$HOLMES_COUNT" -eq 0 ] && [ "$GITLEAKS_COUNT" = "0" ]; then
  exit 0
fi

{
  echo "Commit blocked by clojure-security backstop. Staged diff has findings:"
  echo
  if [ -n "$GITLEAKS_REPORT" ]; then
    echo "## Secrets (gitleaks --staged) — ${GITLEAKS_COUNT}"
    printf '%s\n' "$GITLEAKS_REPORT"
    echo
  fi
  if [ -n "$HOLMES_REPORT" ]; then
    echo "## Clojure security patterns (clj-holmes) — ${HOLMES_COUNT}"
    printf '%s\n' "$HOLMES_REPORT"
    echo
  fi
  echo "Fix the findings (or unstage the offending files) and re-attempt"
  echo "the commit. To override, the human can run the commit themselves"
  echo "after acknowledging the finding — this backstop is for Claude,"
  echo "not for humans with full context."
} >&2

exit 2
