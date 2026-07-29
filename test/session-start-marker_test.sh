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

# Run the hook with a PATH that excludes the homebrew prefix, so every scanner
# reports missing and the notice's CONTENT can actually be asserted. Without
# this, a machine that has semgrep installed — which after this migration is the
# normal case — can only ever skip the assertion, and a test that asserts
# nothing passes no matter what the hook does.
#
# jq is symlinked in because the hook needs it to emit its JSON payload at all;
# /usr/bin and /bin supply the coreutils it uses. The outer jq in the pipeline
# runs under the test's own PATH, not the hook's.
run_hook_context_without_tools() {
  local shim out
  shim="$(mktemp -d)"
  ln -s "$(command -v jq)" "${shim}/jq" 2>/dev/null || true
  out="$(printf '{"cwd":"%s"}' "${PROJECT}" \
    | PATH="${shim}:/usr/bin:/bin" bash "${HOOK}" 2>/dev/null \
    | jq -r '.hookSpecificOutput.additionalContext // empty' 2>/dev/null)"
  rm -rf "${shim}"
  printf '%s' "${out}"
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

test_no_marker_written_in_non_clojure_git_repo() {
  # Regression: the marker + .gitignore write must be gated on
  # is_clojure_project, not just "is a git repo". A non-Clojure repo must be
  # left completely untouched.
  git -C "${PROJECT}" init -q
  printf '{"cwd":"%s"}' "${PROJECT}" | bash "${HOOK}" >/dev/null 2>&1

  assertFalse "no .security-session-start-sha marker in non-Clojure repo" \
    "[ -f '${PROJECT}/.claude/.security-session-start-sha' ]"
  assertFalse "no .gitignore created in non-Clojure repo" \
    "[ -f '${PROJECT}/.gitignore' ]"
}

test_marker_written_in_clojure_git_repo() {
  # The marker SHOULD still be written for a real Clojure project so the
  # Stop-hook can diff against the session-start SHA.
  git -C "${PROJECT}" init -q
  printf '{:deps {}}' > "${PROJECT}/deps.edn"
  git -C "${PROJECT}" add -A >/dev/null 2>&1
  git -C "${PROJECT}" -c user.email=t@t -c user.name=t commit -qm init >/dev/null 2>&1
  printf '{"cwd":"%s"}' "${PROJECT}" | bash "${HOOK}" >/dev/null 2>&1

  assertTrue "marker written in Clojure repo" \
    "[ -f '${PROJECT}/.claude/.security-session-start-sha' ]"
  assertContains "marker gitignored" \
    "$(cat "${PROJECT}/.gitignore" 2>/dev/null)" ".security-session-start-sha"
}

test_missing_notice_names_semgrep_not_clj_holmes() {
  printf '{:deps {}}' > "${PROJECT}/deps.edn"

  local ctx scrubbed
  ctx="$(run_hook_context)"

  # clj-watson's real home is github.com/clj-holmes/clj-watson, and that URL
  # legitimately appears in clj-watson's own missing-tool notice. Strip that
  # substring before asserting — otherwise this test fails on every machine
  # where clj-watson is not installed, which is most of them.
  scrubbed="$(printf '%s' "${ctx}" | sed 's|clj-holmes/clj-watson||g')"

  # CI dropped clj-holmes for 16 cc-* semgrep rules. Telling a developer to
  # install a tool the pipeline no longer runs is worse than saying nothing:
  # they would install abandoned software and believe they were covered.
  assertNotContains "clj-holmes must be gone from the toolchain notice" \
    "${scrubbed}" "clj-holmes"

  if ! command -v semgrep >/dev/null 2>&1; then
    assertContains "missing-tool notice should flag semgrep" "${ctx}" "semgrep"
  fi
}

test_missing_notice_documents_the_rules_dir_override() {
  printf '{:deps {}}' > "${PROJECT}/deps.edn"

  local ctx
  ctx="$(run_hook_context_without_tools)"

  # Unconditional: the shim guarantees semgrep looks absent, so the notice must
  # be present and must carry both the install hint and the override.
  assertContains "the notice should flag semgrep" "${ctx}" "semgrep"
  assertContains "the notice should mention the env override" \
    "${ctx}" "CC_SEMGREP_RULES_DIR"
}

. "${SCRIPT_DIR}/../lib/shunit2"
