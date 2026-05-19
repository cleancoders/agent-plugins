#!/usr/bin/env bash
# SessionStart hook: record HEAD SHA so the Stop-hook can diff against
# "what existed when this session began" rather than against an arbitrary
# merge-base. Without this marker, work done on a default branch (master /
# main) during a single session would not have a coherent diff scope.
#
# Contract:
#   stdin  — JSON with .cwd (working dir)
#   exit 0 — always (this hook never blocks anything)
#
# The marker is removed by session-end-cleanup.sh, but a stale marker is
# harmless: the Stop-hook validates it points at a reachable commit before
# using it and falls back if not.

set -e

INPUT="$(cat 2>/dev/null || true)"

if command -v jq >/dev/null 2>&1; then
  CWD="$(printf '%s' "$INPUT" | jq -r '.cwd // empty')"
else
  CWD=""
fi

[ -z "$CWD" ] && CWD="${CLAUDE_PROJECT_DIR:-$PWD}"

cd "$CWD" 2>/dev/null || exit 0

# Not a git repo → nothing to mark.
git rev-parse --git-dir >/dev/null 2>&1 || exit 0

MARKER_DIR="${CWD}/.claude"
MARKER="${MARKER_DIR}/.security-session-start-sha"

mkdir -p "$MARKER_DIR" 2>/dev/null || exit 0

# If a marker already exists (resumed session?), don't clobber — preserve
# the original session-start point so the diff stays stable.
if [ -f "$MARKER" ]; then
  exit 0
fi

HEAD_SHA="$(git rev-parse HEAD 2>/dev/null || true)"
[ -n "$HEAD_SHA" ] && printf '%s\n' "$HEAD_SHA" > "$MARKER"

exit 0
