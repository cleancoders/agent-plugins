#!/usr/bin/env bash
# Auto-update cleancoders marketplace on Claude Code session start.
# Runs git pull --ff-only on the marketplace repo.
# Fails silently on any error — never blocks session start.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
MARKETPLACE_ROOT="$(git -C "${SCRIPT_DIR}" rev-parse --show-toplevel 2>/dev/null)" || exit 0

LOCAL_HEAD="$(git -C "${MARKETPLACE_ROOT}" rev-parse HEAD 2>/dev/null)" || exit 0
git -C "${MARKETPLACE_ROOT}" fetch --quiet origin 2>/dev/null || exit 0
REMOTE_HEAD="$(git -C "${MARKETPLACE_ROOT}" rev-parse origin/master 2>/dev/null)" || exit 0

if [ "${LOCAL_HEAD}" = "${REMOTE_HEAD}" ]; then
  exit 0
fi

git -C "${MARKETPLACE_ROOT}" pull --ff-only --quiet 2>/dev/null || exit 0

# Build a message listing version changes per plugin
MARKETPLACE_JSON="${MARKETPLACE_ROOT}/.claude-plugin/marketplace.json"
if command -v python3 &>/dev/null && [ -f "${MARKETPLACE_JSON}" ]; then
  # Extract current versions after pull
  NEW_VERSIONS="$(python3 -c "
import json, sys
with open(sys.argv[1]) as f:
    data = json.load(f)
plugins = ', '.join(p['name'] + ' v' + p.get('version','?') for p in data.get('plugins',[]))
print(plugins)
" "${MARKETPLACE_JSON}" 2>/dev/null)" || NEW_VERSIONS=""
fi

UPDATE_MSG="CleanCoders marketplace updated."
if [ -n "${NEW_VERSIONS:-}" ]; then
  UPDATE_MSG="${UPDATE_MSG} Current plugins: ${NEW_VERSIONS}."
fi

escape_for_json() {
  local s="$1"
  s="${s//\\/\\\\}"
  s="${s//\"/\\\"}"
  s="${s//$'\n'/\\n}"
  s="${s//$'\r'/\\r}"
  s="${s//$'\t'/\\t}"
  printf '%s' "$s"
}

ESCAPED_MSG="$(escape_for_json "${UPDATE_MSG}")"

cat <<EOF
{
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "additionalContext": "${ESCAPED_MSG}"
  }
}
EOF

exit 0
