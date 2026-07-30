#!/usr/bin/env bash
# PostToolUse hook: record which Clojure files this turn edited.
#
# Contract (Claude Code hook protocol):
#   stdin  — JSON with .cwd and .tool_input.file_path (Edit/Write) or
#            .tool_input.file_paths (MultiEdit)
#   stdout — nothing
#   exit 0 — always. This hook is bookkeeping and must never affect a turn.
#
# Why it exists: the Stop hook's diff is CUMULATIVE (branch merge-base or the
# session-start SHA, plus uncommitted and untracked), so it cannot tell what
# changed in the current turn. Semgrep does not care — it is fast, deterministic
# and idempotent. The LLM review of the scanner-blind classes does: without a
# per-turn scope it would re-review turn 3's files again on turn 40, forever.
# This ledger is that scope; security-stop.sh drains and deletes it.
#
# Deliberately separate from clj-kondo-postedit.sh, which shares this matcher:
# that hook signals findings with exit 1 and 2 and a ledger write must never
# perturb its exit code, and it returns early on `command -v clj-kondo`, so a
# machine without clj-kondo would silently record nothing.
#
# .edn and .bb are excluded, unlike the lint hook. The 13 classes this feeds are
# about handlers, routes and dataflow, not config files.

# No `set -e` / `set -u`: bash 3.2 treats empty arrays as unbound, and any
# non-zero intermediate here must be survivable.

INPUT="$(cat 2>/dev/null || true)"

command -v jq >/dev/null 2>&1 || exit 0

CWD="$(printf '%s' "$INPUT" | jq -r '.cwd // empty' 2>/dev/null)"
if [ -z "$CWD" ]; then
  CWD="${CLAUDE_PROJECT_DIR:-$PWD}"
fi

PATHS="$(printf '%s' "$INPUT" | jq -r '
  if (.tool_input.file_paths | type) == "array"
    then .tool_input.file_paths[]
    else (.tool_input.file_path // empty)
  end
' 2>/dev/null)"

if [ -z "$PATHS" ]; then
  exit 0
fi

LEDGER="${CWD}/.claude/.security-turn-files"
MADE_DIR=0

while IFS= read -r p; do
  [ -z "$p" ] && continue
  case "$p" in
    *.clj|*.cljs|*.cljc) ;;
    *) continue ;;
  esac
  if [ "$MADE_DIR" -eq 0 ]; then
    mkdir -p "${CWD}/.claude" 2>/dev/null || exit 0
    MADE_DIR=1
  fi
  printf '%s\n' "$p" >> "$LEDGER" 2>/dev/null || true
done <<EOF
${PATHS}
EOF

exit 0
