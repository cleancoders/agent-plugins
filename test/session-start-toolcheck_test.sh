#!/usr/bin/env bash
# Tests for plugins/clojure/hooks/session-start-toolcheck.sh
#
# Focus: the cljfmt-config suggestion branch. The hook injects an
# additionalContext payload when a Clojure project is missing tools OR has no
# cljfmt config. These tests pin the config-detection behavior.
#
# Requires jq (the hook emits its payload via jq; without it the hook falls
# back to stderr and these assertions do not apply). CI has jq.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOK="${SCRIPT_DIR}/../plugins/clojure/hooks/session-start-toolcheck.sh"

oneTimeSetUp() {
  if ! command -v jq >/dev/null 2>&1; then
    echo "jq not installed — skipping session-start-toolcheck tests"
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

test_suggests_setup_skill_when_clojure_project_has_no_cljfmt_config() {
  printf '{:deps {}}' > "${PROJECT}/deps.edn"

  local ctx
  ctx="$(run_hook_context)"

  assertContains "should suggest the setup skill" "${ctx}" "/clojure:setup-cljfmt"
  assertContains "should explain why" "${ctx}" "No cljfmt config found"
}

test_no_cljfmt_suggestion_when_cljfmt_edn_present() {
  printf '{:deps {}}' > "${PROJECT}/deps.edn"
  printf '{}' > "${PROJECT}/cljfmt.edn"

  local ctx
  ctx="$(run_hook_context)"

  assertNotContains "config present -> no suggestion" "${ctx}" "No cljfmt config found"
}

test_no_cljfmt_suggestion_when_dotcljfmt_edn_present() {
  printf '{:deps {}}' > "${PROJECT}/deps.edn"
  printf '{}' > "${PROJECT}/.cljfmt.edn"

  local ctx
  ctx="$(run_hook_context)"

  assertNotContains "alt config name -> no suggestion" "${ctx}" "No cljfmt config found"
}

test_silent_in_non_clojure_project() {
  # No deps.edn / project.clj / etc. -> is_clojure_project guard exits first.
  local out
  out="$(printf '{"cwd":"%s"}' "${PROJECT}" | bash "${HOOK}" 2>/dev/null)"

  assertEquals "non-clojure project produces no output" "" "${out}"
}

. "${SCRIPT_DIR}/../lib/shunit2"
