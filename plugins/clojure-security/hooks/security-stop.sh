#!/usr/bin/env bash
# Stop hook: security-specific scan of the session diff.
#
# Contract (Claude Code Stop-hook protocol):
#   stdin  — JSON with .cwd, .stop_hook_active, .session_id, ...
#   exit 0 — silent success (clean, no diff, missing tools, not a git repo)
#   exit 1 — non-blocking warning (stderr surfaced; turn ends normally)
#   exit 2 — block the stop (stderr surfaced as a "continue" prompt to Claude;
#            forces Claude to keep working until findings are addressed)
#
# Tools (each best-effort; missing tools are skipped silently):
#   - semgrep  : the 16 cc-* rules that gate CI (see lib/semgrep-rules.sh).
#                ERROR blocks; the three WARNING rules are advisory, exactly as
#                in CI — without dataflow they cannot be precise enough to gate.
#   - gitleaks : secret scanning
#
# Diff scoping (tiered fallback):
#   1. On a non-default branch with an origin remote:
#        diff = merge-base(HEAD, origin/HEAD)..HEAD + uncommitted
#   2. On default branch with a session-start SHA marker:
#        diff = $(cat marker)..HEAD + uncommitted
#   3. On default branch without a marker:
#        diff = uncommitted + untracked Clojure-shaped files
#   4. Not a git repo:
#        skip — no diff scope is computable
#
# Reentrancy:
#   If stop_hook_active is true and findings persist, we still block. The
#   meta-decision to override belongs to the human, not to Claude. Anyone
#   needing an escape hatch can disable this hook.
#
# Scanner-blind classes:
#   13 of the skill's 27 classes have no scanner. The files this turn edited
#   come from turn-ledger.sh via .claude/.security-turn-files — NOT from the
#   diff, which is cumulative and would re-review the same files every turn.
#   The directive is one-shot per turn (it has no findings to clear) and the
#   ledger is drained unconditionally. CC_SKIP_DIFF_REVIEW suppresses the
#   review on ANY non-empty value, "0" included — it is a presence check,
#   not a boolean parse.
#
#   The empty-diff exit below stays ledger-aware for the same reason: the
#   review is ledger-scoped, not diff-scoped, so an empty diff is not
#   sufficient reason to skip it while the ledger is still populated.
#
#   Known limit: files changed by Bash (sed, a script, git checkout) never
#   enter the ledger. Semgrep still scans those through the cumulative diff;
#   only this review is ledger-scoped. And the hook cannot verify the review
#   happened — it blocks once and trusts Claude, as every Stop directive does.

set -e

# --- read hook input ---------------------------------------------------------

INPUT="$(cat 2>/dev/null || true)"

CWD=""
STOP_HOOK_ACTIVE="false"
if command -v jq >/dev/null 2>&1; then
  CWD="$(printf '%s' "$INPUT" | jq -r '.cwd // empty')"
  STOP_HOOK_ACTIVE="$(printf '%s' "$INPUT" | jq -r '.stop_hook_active // false')"
fi
[ -z "$CWD" ] && CWD="${CLAUDE_PROJECT_DIR:-$PWD}"

cd "$CWD" 2>/dev/null || exit 0

# --- skip if not a git repo --------------------------------------------------

if ! git rev-parse --git-dir >/dev/null 2>&1; then
  exit 0
fi

# --- skip outside a Clojure project ------------------------------------------
# This plugin only scans Clojure repos. Without this gate the Stop hook would
# run gitleaks / semgrep on every git repo the session touches.

is_clojure_project() {
  [ -f "$CWD/deps.edn" ] || [ -f "$CWD/project.clj" ] || \
    [ -f "$CWD/shadow-cljs.edn" ] || [ -f "$CWD/build.boot" ] || \
    [ -f "$CWD/bb.edn" ]
}

is_clojure_project || exit 0

# --- skip if neither security tool is installed ------------------------------

HAVE_SEMGREP=0
HAVE_GITLEAKS=0
command -v semgrep  >/dev/null 2>&1 && HAVE_SEMGREP=1
command -v gitleaks >/dev/null 2>&1 && HAVE_GITLEAKS=1

# The ledger review (below) needs neither tool, so an absent toolchain is no
# longer sufficient reason to exit — only an absent toolchain AND an absent
# ledger is.
if [ "$HAVE_SEMGREP" -eq 0 ] && [ "$HAVE_GITLEAKS" -eq 0 ] \
   && [ ! -f "${CWD}/.claude/.security-turn-files" ]; then
  exit 0
fi

# shellcheck source=lib/semgrep-rules.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib/semgrep-rules.sh"
# shellcheck source=lib/semgrep-scan.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib/semgrep-scan.sh"

# --- compute diff scope ------------------------------------------------------

DEFAULT_BRANCH=""
if git symbolic-ref refs/remotes/origin/HEAD >/dev/null 2>&1; then
  DEFAULT_BRANCH="$(git symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null | sed 's|^origin/||')"
fi
[ -z "$DEFAULT_BRANCH" ] && DEFAULT_BRANCH="$(git config --get init.defaultBranch 2>/dev/null || echo master)"

CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo HEAD)"
MARKER="${CWD}/.claude/.security-session-start-sha"

BASE_SHA=""
SCOPE_KIND=""

if [ "$CURRENT_BRANCH" != "$DEFAULT_BRANCH" ] && [ "$CURRENT_BRANCH" != "HEAD" ]; then
  # Feature branch — diff against merge-base with the default branch.
  if git rev-parse "origin/$DEFAULT_BRANCH" >/dev/null 2>&1; then
    BASE_SHA="$(git merge-base HEAD "origin/$DEFAULT_BRANCH" 2>/dev/null || true)"
  fi
  if [ -z "$BASE_SHA" ] && git rev-parse "$DEFAULT_BRANCH" >/dev/null 2>&1; then
    BASE_SHA="$(git merge-base HEAD "$DEFAULT_BRANCH" 2>/dev/null || true)"
  fi
  [ -n "$BASE_SHA" ] && SCOPE_KIND="branch"
fi

if [ -z "$BASE_SHA" ] && [ -f "$MARKER" ]; then
  CAND="$(tr -d '[:space:]' < "$MARKER")"
  if [ -n "$CAND" ] && git cat-file -e "${CAND}^{commit}" 2>/dev/null; then
    BASE_SHA="$CAND"
    SCOPE_KIND="session-marker"
  fi
fi

# Collect candidate files.
CHANGED=""
if [ -n "$BASE_SHA" ]; then
  CHANGED="$(git diff --name-only "${BASE_SHA}...HEAD" 2>/dev/null || true)"
  UNCOMMITTED="$(git diff --name-only HEAD 2>/dev/null || true)"
  UNTRACKED="$(git ls-files --others --exclude-standard 2>/dev/null || true)"
  CHANGED="$(printf '%s\n%s\n%s\n' "$CHANGED" "$UNCOMMITTED" "$UNTRACKED" | awk 'NF' | sort -u)"
else
  # Fallback: uncommitted + untracked only.
  UNCOMMITTED="$(git diff --name-only HEAD 2>/dev/null || true)"
  UNTRACKED="$(git ls-files --others --exclude-standard 2>/dev/null || true)"
  CHANGED="$(printf '%s\n%s\n' "$UNCOMMITTED" "$UNTRACKED" | awk 'NF' | sort -u)"
  SCOPE_KIND="uncommitted-only"
fi

# An empty diff is not sufficient reason to exit: the review below is
# ledger-scoped, not diff-scoped. Bailing here would leave the ledger to bank
# into the next turn — exactly the cumulative repetition the ledger prevents.
# Same reasoning as the toolchain gate above: absent work AND an absent ledger.
if [ -z "$CHANGED" ] && [ ! -f "${CWD}/.claude/.security-turn-files" ]; then
  exit 0
fi

# Filter to existing files only (a path can be in diff output but deleted on disk).
EXISTING=""
while IFS= read -r f; do
  [ -f "$f" ] && EXISTING="${EXISTING}${f}"$'\n'
done <<<"$CHANGED"
CHANGED="$EXISTING"

# Clojure-shaped subset (for semgrep).
CLJ_FILES=""
while IFS= read -r f; do
  case "$f" in
    *.clj|*.cljs|*.cljc|*.edn|*.bb) CLJ_FILES="${CLJ_FILES}${f}"$'\n' ;;
  esac
done <<<"$CHANGED"

# --- run semgrep ------------------------------------------------------------

SEMGREP_ERRORS=""
SEMGREP_WARNINGS=""
SEMGREP_ERROR_COUNT=0
SEMGREP_WARN_COUNT=0
SEMGREP_TOOL_ERRORS=""

if [ "$HAVE_SEMGREP" -eq 1 ] && [ -n "$CLJ_FILES" ]; then
  RULES_DIR="$(resolve_semgrep_rules)"
  if [ -n "$RULES_DIR" ]; then
    # No tmp-tree mirror, unlike the scanner this replaces: semgrep reads
    # .clj/.cljs/.cljc directly and reports the paths it was given, so no
    # prefix argument is passed to run_semgrep_scan.
    run_semgrep_scan "$RULES_DIR" "$CLJ_FILES"
  fi
fi

# --- run gitleaks -----------------------------------------------------------

GITLEAKS_REPORT=""
GITLEAKS_COUNT=0
if [ "$HAVE_GITLEAKS" -eq 1 ] && [ -n "$CHANGED" ]; then
  TMP_LEAKS="$(mktemp -d 2>/dev/null || true)"
  if [ -n "$TMP_LEAKS" ]; then
    while IFS= read -r f; do
      [ -z "$f" ] && continue
      mkdir -p "${TMP_LEAKS}/$(dirname "$f")"
      cp "$f" "${TMP_LEAKS}/$f" 2>/dev/null || true
    done <<<"$CHANGED"

    REPORT_FILE="${TMP_LEAKS}/__leaks.json"
    gitleaks detect \
      --no-banner \
      --redact \
      --no-git \
      --source "$TMP_LEAKS" \
      --report-format json \
      --report-path "$REPORT_FILE" >/dev/null 2>&1 || true

    if [ -f "$REPORT_FILE" ] && command -v jq >/dev/null 2>&1; then
      GITLEAKS_COUNT="$(jq 'length' "$REPORT_FILE" 2>/dev/null || echo 0)"
      if [ "$GITLEAKS_COUNT" != "0" ] && [ -n "$GITLEAKS_COUNT" ]; then
        GITLEAKS_REPORT="$(
          jq -r '.[] | "\(.File):\(.StartLine)  SECRET  [\(.RuleID)]  \(.Description) — \(.Match)"' \
             "$REPORT_FILE" 2>/dev/null \
          | sed "s|${TMP_LEAKS}/||g"
        )"
      fi
    fi
    rm -rf "$TMP_LEAKS"
  fi
fi

# --- LLM review of the scanner-blind classes --------------------------------

# 13 of the skill's 27 classes have no scanner: they need dataflow, namespace-
# alias resolution, or whole-route reasoning that semgrep cannot do. Nine are
# CWE Top 25 entries. Before this they were reachable only by a manual
# /security-audit that nothing triggers.
#
# Scope comes from turn-ledger.sh, not from the diff: the diff is cumulative,
# so reviewing it would re-review turn 3's files again on turn 40.

LEDGER="${CWD}/.claude/.security-turn-files"
REVIEW_FILES=""

if [ -f "$LEDGER" ]; then
  REVIEW_FILES="$(awk 'NF' "$LEDGER" 2>/dev/null | sort -u)"
  # Drain BEFORE deciding whether to review. A suppressed or skipped review
  # must not leave its files to pile up into the next turn's list.
  rm -f "$LEDGER"
fi

# One-shot per turn. The directive has no findings to clear, so re-issuing it
# on reentry would block forever.
if [ "$STOP_HOOK_ACTIVE" = "true" ] || [ -n "${CC_SKIP_DIFF_REVIEW:-}" ]; then
  REVIEW_FILES=""
fi

# Drop paths deleted later in the same turn, then shorten for display.
#
# Test existence on the ABSOLUTE path — unambiguous regardless of cwd — and
# only then strip the project prefix, so the directive's paths match the
# repo-relative ones the semgrep block prints in the same report.
#
# The strip is parameter expansion, deliberately NOT sed: $CWD in a regex lets
# a metacharacter match the wrong directory, and this plugin supports
# cross-repo edits (test/postedit-hooks-cross-repo_test.sh), so the ledger
# really can hold paths outside $CWD. Quoting inside ${f#"$CWD"/} forces a
# literal match, and a path outside the project simply keeps its absolute form.
if [ -n "$REVIEW_FILES" ]; then
  KEPT=""
  while IFS= read -r f; do
    [ -z "$f" ] && continue
    if [ -f "$f" ]; then
      KEPT="${KEPT}${f#"$CWD"/}"$'\n'
    fi
  done <<<"$REVIEW_FILES"
  REVIEW_FILES="$(printf '%s' "$KEPT" | awk 'NF')"
fi

# --- emit report and exit ---------------------------------------------------

if [ "$SEMGREP_ERROR_COUNT" -eq 0 ] && [ "$SEMGREP_WARN_COUNT" -eq 0 ] \
   && [ "$GITLEAKS_COUNT" = "0" ] && [ -z "$REVIEW_FILES" ] \
   && [ -z "$SEMGREP_TOOL_ERRORS" ]; then
  exit 0
fi

{
  # The header and the closing triage block are both about TOOL findings. When
  # the only content is a ledger-scoped review, neither applies: nothing came
  # from the diff, and the taint-shaped investigation order does not fit
  # access-control work.
  HAVE_TOOL_FINDINGS=0
  if [ "$SEMGREP_ERROR_COUNT" -gt 0 ] || [ "$SEMGREP_WARN_COUNT" -gt 0 ] \
     || [ "$GITLEAKS_COUNT" != "0" ] || [ -n "$SEMGREP_TOOL_ERRORS" ]; then
    HAVE_TOOL_FINDINGS=1
  fi

  if [ "$HAVE_TOOL_FINDINGS" -eq 1 ]; then
    echo "Security scan on the session diff (scope: ${SCOPE_KIND})."
  else
    echo "Security review of this turn's edits."
  fi
  echo
  if [ -n "$SEMGREP_TOOL_ERRORS" ]; then
    echo "## semgrep reported a tool error (not blocking)"
    echo "The rules dir may be wrong, incomplete, or incompatible with this"
    echo "semgrep version — a clean result cannot be trusted until this clears:"
    printf '%s\n' "$SEMGREP_TOOL_ERRORS"
    echo
  fi
  if [ -n "$GITLEAKS_REPORT" ]; then
    echo "## Secrets (gitleaks) — ${GITLEAKS_COUNT}"
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
    echo "Non-blocking, and non-blocking in CI too: these rules have no dataflow,"
    echo "so they cannot be precise enough to gate a build. Read them, judge them,"
    echo "act if warranted."
    printf '%s\n' "$SEMGREP_WARNINGS"
    echo
  fi
  if [ -n "$REVIEW_FILES" ]; then
    echo "## Scanner-blind classes — review this turn's edits"
    echo
    echo "Semgrep cannot reach these classes: they need dataflow, namespace-alias"
    echo "resolution, or whole-route reasoning. Review these files:"
    printf '%s\n' "$REVIEW_FILES" | sed 's/^/  /'
    echo
    echo "Scope: every finding you report must be ABOUT one of those files. Read"
    echo "whatever else you need in order to judge them — a missing authorization"
    echo "check is rarely visible in the handler alone, so follow the middleware"
    echo "stack and the route table wherever they live. What you must not do is go"
    echo "hunting for unrelated findings elsewhere in the repo."
    echo
    echo "Load the clojure-security skill, then only the references you need:"
    echo "  references/access-control.md — atom-toctou, missing-authn,"
    echo "        missing-authz, incorrect-authz, idor, csrf, ssrf, mass-assignment"
    echo "  references/config-and-ops.md — security-misconfig, logging-failures,"
    echo "        unrestricted-upload, resource-exhaustion"
    echo "  references/injection.md — macro-runtime-input"
    echo "  references/route-inventory.md — the route sweep, if any of these files"
    echo "        define, wrap, or dispatch routes"
    echo
    echo "Apply the skill's investigation order and severity heuristic. Report"
    echo "each finding with its class name, CWE and OWASP tag. Provenance you"
    echo "cannot trace is provisional, not a finding. Do not auto-fix — report"
    echo "and let the human choose."
    echo
    echo "This directive is issued once per turn. Report your findings and stop;"
    echo "the hook will not re-issue it."
    echo
  fi
  if [ "$HAVE_TOOL_FINDINGS" -eq 1 ]; then
    echo "Triage each finding through the clojure-security skill before"
    echo "ending this turn. Use the skill's investigation order:"
    echo "  1. source of the tainted value"
    echo "  2. trust boundary crossed"
    echo "  3. existing sanitization on the path"
    echo "  4. whether removing the sink would break legitimate use"
    echo "  5. other call sites with the same sink shape"
    echo
  fi
  if [ "$STOP_HOOK_ACTIVE" = "true" ]; then
    echo "(Stop hook is reentering — findings still present after a prior"
    echo "continuation. Address them or escalate to the human.)"
  fi
} >&2

# Blocking findings block the stop. Advisory-only findings surface as a
# non-blocking warning (exit 1) so the turn can end — mirroring CI, where the
# three WARNING rules never fail the job.
if [ "$SEMGREP_ERROR_COUNT" -gt 0 ] || [ "$GITLEAKS_COUNT" != "0" ] \
   || [ -n "$REVIEW_FILES" ]; then
  exit 2
fi
exit 1
