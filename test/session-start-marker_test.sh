#!/usr/bin/env bash
# Tests for plugins/clojure-security/hooks/session-start-marker.sh
#
# Focus: the clj-kondo-config suggestion branch. The hook injects an
# additionalContext payload when a Clojure project is missing tools OR has no
# clj-kondo config. These tests pin the config-detection behavior.
#
# Requires jq (the hook emits its payload via jq; without it the hook produces
# no JSON payload and these assertions do not apply). CI has jq.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOK="${SCRIPT_DIR}/../plugins/clojure-security/hooks/session-start-marker.sh"

oneTimeSetUp() {
  if ! command -v jq >/dev/null 2>&1; then
    echo "jq not installed — skipping session-start-marker tests"
    startSkipping
  fi
}

setUp() {
  PROJECT="$(mktemp -d)"
}

tearDown() {
  [ -n "${PROJECT}" ] && rm -rf "${PROJECT}"
}

# Run the hook against PROJECT and capture the injected additionalContext
# (empty string if the hook produced no JSON payload).
run_hook_context() {
  printf '{"cwd":"%s"}' "${PROJECT}" \
    | bash "${HOOK}" 2>/dev/null \
    | jq -r '.hookSpecificOutput.additionalContext // empty' 2>/dev/null
}

test_suggests_setup_skill_when_clojure_project_has_no_clj_kondo_config() {
  printf '{:deps {}}' > "${PROJECT}/deps.edn"

  local ctx
  ctx="$(run_hook_context)"

  assertContains "should suggest the setup skill" "${ctx}" "/clojure-security:setup-clj-kondo"
  assertContains "should explain why" "${ctx}" "No clj-kondo config found"
}

test_no_clj_kondo_suggestion_when_config_present() {
  printf '{:deps {}}' > "${PROJECT}/deps.edn"
  mkdir -p "${PROJECT}/.clj-kondo"
  printf '{}' > "${PROJECT}/.clj-kondo/config.edn"

  local ctx
  ctx="$(run_hook_context)"

  assertNotContains "config present -> no suggestion" "${ctx}" "No clj-kondo config found"
}

test_missing_notice_references_clj_watson_not_nvd_clojure() {
  printf '{:deps {}}' > "${PROJECT}/deps.edn"

  local ctx
  ctx="$(run_hook_context)"

  # nvd-clojure was swapped out for clj-watson — the dependency-CVE tool
  # notice must never name the retired tool.
  assertNotContains "nvd-clojure should be gone" "${ctx}" "nvd-clojure"

  # The clj-watson notice only appears when clj-watson is absent; skip the
  # positive assertion when it happens to be installed on this machine.
  if ! command -v clj-watson >/dev/null 2>&1; then
    assertContains "missing-tool notice should flag clj-watson" "${ctx}" "clj-watson"
  fi
}

test_silent_in_non_clojure_project() {
  # No deps.edn / project.clj / etc. -> is_clojure_project guard exits first.
  local out
  out="$(printf '{"cwd":"%s"}' "${PROJECT}" | bash "${HOOK}" 2>/dev/null)"

  assertEquals "non-clojure project produces no output" "" "${out}"
}

. "${SCRIPT_DIR}/../lib/shunit2"
