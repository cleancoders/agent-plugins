#!/usr/bin/env bash
# SessionEnd hook: remove the session-start SHA marker and any stale turn ledger
# so the next session starts fresh. Best-effort; a stale marker is harmless
# because the Stop-hook revalidates the SHA before using it.
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

# The Stop hook drains the turn ledger every turn, so this is a backstop for a
# session that ended mid-turn (crash, kill) and left one behind. A stale ledger
# would make the next session's first Stop review files nobody touched in it.
LEDGER="${CWD}/.claude/.security-turn-files"
[ -f "$LEDGER" ] && rm -f "$LEDGER"

exit 0
