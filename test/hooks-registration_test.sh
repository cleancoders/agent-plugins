#!/usr/bin/env bash
# Tests that hooks/hooks.json actually registers every hook script this plugin
# ships, on the event(s) it needs.
#
# Nothing previously asserted hooks.json's own content: deleting the entire
# `Stop` block, or dropping the `turn-ledger.sh` entry from the `PostToolUse`
# matcher, left every other test in the suite passing — the capability those
# hooks provide could be silently unregistered with a green build. This file
# closes that gap, and also guards the general case: any future hook added to
# `hooks/` but never wired into `hooks.json` must fail the build, not ship
# silently disabled.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN="${SCRIPT_DIR}/../plugins/clojure-security"
HOOKS_JSON="${PLUGIN}/hooks/hooks.json"

oneTimeSetUp() {
  if ! command -v jq >/dev/null 2>&1; then
    echo "jq not installed — skipping hooks-registration tests"
    startSkipping
  fi
}

test_hooks_json_is_valid_json() {
  jq -e . "${HOOKS_JSON}" >/dev/null 2>&1
  assertEquals "hooks.json must parse as JSON" "0" "$?"
}

# All hook `command` strings registered under a given top-level event, one
# per line, regardless of matcher.
commands_for_event() {
  local event="$1"
  jq -r --arg ev "$event" '
    .hooks[$ev][]? | .hooks[]?.command // empty
  ' "${HOOKS_JSON}" 2>/dev/null
}

# All hook `command` strings registered under a given event AND matcher.
commands_for_event_matcher() {
  local event="$1" matcher="$2"
  jq -r --arg ev "$event" --arg m "$matcher" '
    .hooks[$ev][]? | select(.matcher == $m) | .hooks[]?.command // empty
  ' "${HOOKS_JSON}" 2>/dev/null
}

test_session_start_marker_registered_on_session_start() {
  assertContains "session-start-marker.sh must be registered on SessionStart" \
    "$(commands_for_event SessionStart)" "session-start-marker.sh"
}

test_session_end_cleanup_registered_on_session_end() {
  assertContains "session-end-cleanup.sh must be registered on SessionEnd" \
    "$(commands_for_event SessionEnd)" "session-end-cleanup.sh"
}

test_commit_backstop_registered_on_pretooluse_bash() {
  assertContains "commit-backstop.sh must be registered on PreToolUse matcher Bash" \
    "$(commands_for_event_matcher PreToolUse Bash)" "commit-backstop.sh"
}

test_clj_kondo_postedit_registered_on_postedit_matcher() {
  assertContains "clj-kondo-postedit.sh must be registered on PostToolUse Edit|Write|MultiEdit" \
    "$(commands_for_event_matcher PostToolUse 'Edit|Write|MultiEdit')" "clj-kondo-postedit.sh"
}

test_turn_ledger_registered_on_postedit_matcher() {
  # This is the entry the whole-branch review proved could be deleted with the
  # suite still green: nothing exercised the Stop hook's ledger-review path
  # via hooks.json itself, only via directly invoking the script in other tests.
  assertContains "turn-ledger.sh must be registered on PostToolUse Edit|Write|MultiEdit" \
    "$(commands_for_event_matcher PostToolUse 'Edit|Write|MultiEdit')" "turn-ledger.sh"
}

test_security_stop_registered_on_stop() {
  # The other half of the same mutation: deleting the entire `Stop` block left
  # every other test passing, because every other test invokes security-stop.sh
  # directly rather than through hooks.json.
  assertContains "security-stop.sh must be registered on Stop" \
    "$(commands_for_event Stop)" "security-stop.sh"
}

test_every_shipped_hook_script_is_registered_somewhere() {
  # Guards the general case, not just today's six scripts: a future hook
  # dropped into hooks/ but never wired into hooks.json must fail the build.
  # hooks/lib/ is excluded — those are sourced libraries, not hooks Claude Code
  # invokes directly, and `-maxdepth 1` already excludes them by construction.
  local all_commands unregistered f base
  all_commands="$(jq -r '.. | .command? // empty' "${HOOKS_JSON}" 2>/dev/null)"
  unregistered=""
  while IFS= read -r f; do
    [ -z "$f" ] && continue
    base="$(basename "$f")"
    if ! printf '%s\n' "${all_commands}" | grep -qF "${base}"; then
      unregistered="${unregistered}${base}"$'\n'
    fi
  done < <(find "${PLUGIN}/hooks" -maxdepth 1 -type f -name '*.sh')
  assertEquals "every hooks/*.sh must be referenced in hooks.json" \
    "" "$(printf '%s' "${unregistered}" | awk 'NF')"
}

. "${SCRIPT_DIR}/../lib/shunit2"
