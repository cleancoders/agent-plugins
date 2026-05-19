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
#   - clj-holmes : pattern-based SAST for Clojure idioms
#   - gitleaks   : secret scanning
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

# --- skip if neither security tool is installed ------------------------------

HAVE_HOLMES=0
HAVE_GITLEAKS=0
command -v clj-holmes >/dev/null 2>&1 && HAVE_HOLMES=1
command -v gitleaks   >/dev/null 2>&1 && HAVE_GITLEAKS=1
if [ "$HAVE_HOLMES" -eq 0 ] && [ "$HAVE_GITLEAKS" -eq 0 ]; then
  exit 0
fi

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

if [ -z "$CHANGED" ]; then
  exit 0
fi

# Filter to existing files only (a path can be in diff output but deleted on disk).
EXISTING=""
while IFS= read -r f; do
  [ -f "$f" ] && EXISTING="${EXISTING}${f}"$'\n'
done <<<"$CHANGED"
CHANGED="$EXISTING"

# Clojure-shaped subset (for clj-holmes).
CLJ_FILES=""
while IFS= read -r f; do
  case "$f" in
    *.clj|*.cljs|*.cljc|*.edn|*.bb) CLJ_FILES="${CLJ_FILES}${f}"$'\n' ;;
  esac
done <<<"$CHANGED"

# --- run clj-holmes ---------------------------------------------------------

HOLMES_REPORT=""
HOLMES_COUNT=0
if [ "$HAVE_HOLMES" -eq 1 ] && [ -n "$CLJ_FILES" ]; then
  # clj-holmes wants a directory; copy changed files into a tmp tree
  # mirroring their paths so rule output is still readable.
  TMP_HOLMES="$(mktemp -d 2>/dev/null || true)"
  if [ -n "$TMP_HOLMES" ]; then
    while IFS= read -r f; do
      [ -z "$f" ] && continue
      mkdir -p "${TMP_HOLMES}/$(dirname "$f")"
      cp "$f" "${TMP_HOLMES}/$f" 2>/dev/null || true
    done <<<"$CLJ_FILES"

    # Try common invocations; clj-holmes CLI has shifted versions, so be
    # tolerant. Capture both text findings and a count.
    HOLMES_RAW="$(
      ( clj-holmes scan --path "$TMP_HOLMES" 2>&1 \
        || clj-holmes -p "$TMP_HOLMES" 2>&1 \
        || true ) | sed "s|${TMP_HOLMES}/||g"
    )"
    # Findings lines typically contain "rule" / "vulnerab" / "::" markers;
    # fall back to "anything non-trivial after stripping banners".
    HOLMES_REPORT="$(printf '%s\n' "$HOLMES_RAW" | grep -Ei 'rule|vulnerab|finding|severity|sink' || true)"
    if [ -n "$HOLMES_REPORT" ]; then
      HOLMES_COUNT="$(printf '%s\n' "$HOLMES_REPORT" | wc -l | tr -d ' ')"
    fi
    rm -rf "$TMP_HOLMES"
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

# --- emit report and exit ---------------------------------------------------

if [ "$HOLMES_COUNT" -eq 0 ] && [ "$GITLEAKS_COUNT" = "0" ]; then
  exit 0
fi

{
  echo "Security scan on the session diff (scope: ${SCOPE_KIND})."
  echo
  if [ -n "$GITLEAKS_REPORT" ]; then
    echo "## Secrets (gitleaks) — ${GITLEAKS_COUNT}"
    printf '%s\n' "$GITLEAKS_REPORT"
    echo
  fi
  if [ -n "$HOLMES_REPORT" ]; then
    echo "## Clojure security patterns (clj-holmes) — ${HOLMES_COUNT}"
    printf '%s\n' "$HOLMES_REPORT"
    echo
  fi
  echo "Triage each finding through the clojure-security skill before"
  echo "ending this turn. Use the skill's investigation order:"
  echo "  1. source of the tainted value"
  echo "  2. trust boundary crossed"
  echo "  3. existing sanitization on the path"
  echo "  4. whether removing the sink would break legitimate use"
  echo "  5. other call sites with the same sink shape"
  echo
  if [ "$STOP_HOOK_ACTIVE" = "true" ]; then
    echo "(Stop hook is reentering — findings still present after a prior"
    echo "continuation. Address them or escalate to the human.)"
  fi
} >&2

# Block the stop. Claude must address findings before the turn can end.
exit 2
