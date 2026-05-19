#!/usr/bin/env bash
# SessionEnd hook: remove the session-start SHA marker so the next session
# starts fresh. Best-effort; a stale marker is harmless because the Stop-hook
# revalidates the SHA before using it.
#
# exit 0 — always.

set -e

INPUT="$(cat 2>/dev/null || true)"

if command -v jq >/dev/null 2>&1; then
  CWD="$(printf '%s' "$INPUT" | jq -r '.cwd // empty')"
else
  CWD=""
fi

[ -z "$CWD" ] && CWD="${CLAUDE_PROJECT_DIR:-$PWD}"

MARKER="${CWD}/.claude/.security-session-start-sha"
[ -f "$MARKER" ] && rm -f "$MARKER"

exit 0
