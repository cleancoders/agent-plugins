#!/usr/bin/env bash
# Sync VERSION file to plugin.json, package.json, marketplace.json, and index.ts
# Usage: sync-versions.sh <plugin_dir> <marketplace_json_path>

set -euo pipefail

PLUGIN_DIR="$1"
MARKETPLACE_JSON="$2"

VERSION_FILE="${PLUGIN_DIR}/VERSION"
PLUGIN_JSON="${PLUGIN_DIR}/.claude-plugin/plugin.json"
PACKAGE_JSON="${PLUGIN_DIR}/package.json"
INDEX_TS="${PLUGIN_DIR}/src/index.ts"

if [ ! -f "${VERSION_FILE}" ]; then
  echo "ERROR: VERSION file not found at ${VERSION_FILE}" >&2
  exit 1
fi

if [ ! -f "${PLUGIN_JSON}" ]; then
  echo "ERROR: plugin.json not found at ${PLUGIN_JSON}" >&2
  exit 1
fi

VERSION="$(cat "${VERSION_FILE}" | tr -d '[:space:]')"
PLUGIN_NAME="$(jq -r '.name' "${PLUGIN_JSON}")"

# Update plugin.json
jq --arg v "${VERSION}" '.version = $v' "${PLUGIN_JSON}" > "${PLUGIN_JSON}.tmp" \
  && mv "${PLUGIN_JSON}.tmp" "${PLUGIN_JSON}"

# Update package.json
if [ -f "${PACKAGE_JSON}" ]; then
  jq --arg v "${VERSION}" '.version = $v' "${PACKAGE_JSON}" > "${PACKAGE_JSON}.tmp" \
    && mv "${PACKAGE_JSON}.tmp" "${PACKAGE_JSON}"
fi

# Update marketplace.json
if [ -f "${MARKETPLACE_JSON}" ]; then
  jq --arg name "${PLUGIN_NAME}" --arg v "${VERSION}" \
    '(.plugins[] | select(.name == $name)).version = $v' \
    "${MARKETPLACE_JSON}" > "${MARKETPLACE_JSON}.tmp" \
    && mv "${MARKETPLACE_JSON}.tmp" "${MARKETPLACE_JSON}"
fi

# Update index.ts
if [ -f "${INDEX_TS}" ]; then
  sed -i.bak "s/version: '[^']*'/version: '${VERSION}'/" "${INDEX_TS}" \
    && rm -f "${INDEX_TS}.bak"
fi

echo "Synced ${PLUGIN_NAME} to v${VERSION}"
