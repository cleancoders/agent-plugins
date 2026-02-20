#!/usr/bin/env bash
# Tests for scripts/sync-versions.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SYNC_SCRIPT="${SCRIPT_DIR}/../scripts/sync-versions.sh"

setUp() {
  TMPDIR_TEST="$(mktemp -d)"
  PLUGIN_DIR="${TMPDIR_TEST}/plugins/kanban-dashboard"
  mkdir -p "${PLUGIN_DIR}/.claude-plugin"
  mkdir -p "${PLUGIN_DIR}/src"

  # Default plugin.json
  cat > "${PLUGIN_DIR}/.claude-plugin/plugin.json" <<'PJSON'
{
  "name": "kanban-dashboard",
  "description": "A plugin",
  "version": "0.0.0"
}
PJSON

  # Default package.json
  cat > "${PLUGIN_DIR}/package.json" <<'PKGJSON'
{
  "name": "kanban-dashboard",
  "version": "0.0.0",
  "private": true
}
PKGJSON

  # Default index.ts
  cat > "${PLUGIN_DIR}/src/index.ts" <<'IDX'
const server = new McpServer({
  name: 'kanban-dashboard',
  version: '0.0.0',
});
IDX

  # Default VERSION
  echo "1.2.3" > "${PLUGIN_DIR}/VERSION"

  # Default marketplace.json
  MARKETPLACE_JSON="${TMPDIR_TEST}/marketplace.json"
  cat > "${MARKETPLACE_JSON}" <<'MKT'
{
  "name": "cleancoders-agent-plugins",
  "plugins": [
    {
      "name": "other-plugin",
      "version": "2.0.0"
    },
    {
      "name": "kanban-dashboard",
      "version": "0.0.0"
    }
  ]
}
MKT
}

tearDown() {
  rm -rf "${TMPDIR_TEST}"
}

test_updates_plugin_json_version() {
  bash "${SYNC_SCRIPT}" "${PLUGIN_DIR}" "${MARKETPLACE_JSON}"

  local actual
  actual="$(jq -r '.version' "${PLUGIN_DIR}/.claude-plugin/plugin.json")"
  assertEquals "plugin.json version" "1.2.3" "${actual}"
}

test_updates_package_json_version() {
  bash "${SYNC_SCRIPT}" "${PLUGIN_DIR}" "${MARKETPLACE_JSON}"

  local actual
  actual="$(jq -r '.version' "${PLUGIN_DIR}/package.json")"
  assertEquals "package.json version" "1.2.3" "${actual}"
}

test_updates_marketplace_json_for_correct_plugin() {
  bash "${SYNC_SCRIPT}" "${PLUGIN_DIR}" "${MARKETPLACE_JSON}"

  local kanban_version other_version
  kanban_version="$(jq -r '.plugins[] | select(.name=="kanban-dashboard") | .version' "${MARKETPLACE_JSON}")"
  other_version="$(jq -r '.plugins[] | select(.name=="other-plugin") | .version' "${MARKETPLACE_JSON}")"

  assertEquals "kanban-dashboard version in marketplace" "1.2.3" "${kanban_version}"
  assertEquals "other-plugin version unchanged" "2.0.0" "${other_version}"
}

test_updates_index_ts_version() {
  bash "${SYNC_SCRIPT}" "${PLUGIN_DIR}" "${MARKETPLACE_JSON}"

  local actual
  actual="$(grep "version:" "${PLUGIN_DIR}/src/index.ts")"
  assertContains "index.ts version" "${actual}" "1.2.3"
}

test_exits_with_error_when_version_file_missing() {
  rm "${PLUGIN_DIR}/VERSION"

  bash "${SYNC_SCRIPT}" "${PLUGIN_DIR}" "${MARKETPLACE_JSON}" 2>/dev/null
  local rc=$?

  assertNotEquals "should exit non-zero" 0 "${rc}"
}

test_exits_with_error_when_plugin_json_missing() {
  rm "${PLUGIN_DIR}/.claude-plugin/plugin.json"

  bash "${SYNC_SCRIPT}" "${PLUGIN_DIR}" "${MARKETPLACE_JSON}" 2>/dev/null
  local rc=$?

  assertNotEquals "should exit non-zero" 0 "${rc}"
}

. "${SCRIPT_DIR}/../lib/shunit2"
