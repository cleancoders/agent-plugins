#!/usr/bin/env bash
# Tests the spec-describe-check PostToolUse hook: it must flag (exit 2 with
# feedback) a Speclj spec file that has more than one top-level (describe ...),
# and stay silent (exit 0) for a compliant file, a non-spec file, or an input
# with no file path.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOK="${SCRIPT_DIR}/../plugins/clojure/hooks/spec-describe-check.sh"

setUp() {
  TMP="$(mktemp -d)"
}

tearDown() {
  [ -n "${TMP}" ] && rm -rf "${TMP}"
}

# Runs the hook with a JSON payload pointing at $1. Captures stderr into
# STDERR_OUT and the exit code into EXIT_CODE.
run_hook_on() {
  local target="$1"
  STDERR_OUT="$(bash "${HOOK}" 2>&1 >/dev/null <<< "$(printf '{"tool_input":{"file_path":"%s"}}' "${target}")")"
  EXIT_CODE=$?
}

test_flags_multiple_top_level_describes() {
  local f="${TMP}/foo_spec.cljs"
  printf '(ns foo-spec)\n(describe "a"\n  (it "x" (should= 1 1)))\n(describe "b"\n  (it "y" (should= 2 2)))\n' > "${f}"
  run_hook_on "${f}"
  assertEquals "should exit 2 to feed feedback back to Claude" 2 "${EXIT_CODE}"
  assertContains "feedback should name the one-describe rule" \
    "${STDERR_OUT}" "exactly ONE top-level"
  assertContains "feedback should name the offending file" "${STDERR_OUT}" "foo_spec.cljs"
}

test_allows_single_top_level_describe() {
  local f="${TMP}/foo_spec.cljs"
  printf '(ns foo-spec)\n(describe "foo"\n  (context "a" (it "x" (should= 1 1)))\n  (context "b" (it "y" (should= 2 2))))\n' > "${f}"
  run_hook_on "${f}"
  assertEquals "single describe should pass silently" 0 "${EXIT_CODE}"
}

test_ignores_non_spec_clojure_file() {
  # A source file with two describe-looking forms is not a *_spec file — ignore.
  local f="${TMP}/foo.cljs"
  printf '(describe "a" 1)\n(describe "b" 2)\n' > "${f}"
  run_hook_on "${f}"
  assertEquals "non-spec file should be ignored" 0 "${EXIT_CODE}"
}

test_ignores_nested_describe_indented() {
  # Only column-0 (describe ...) forms count as top-level; an indented one does not.
  local f="${TMP}/foo_spec.clj"
  printf '(ns foo-spec)\n(describe "foo"\n  (describe "nested-should-not-count" (it "x" (should= 1 1))))\n' > "${f}"
  run_hook_on "${f}"
  assertEquals "indented describe must not count as top-level" 0 "${EXIT_CODE}"
}

test_no_file_path_is_noop() {
  STDERR_OUT="$(bash "${HOOK}" 2>&1 >/dev/null <<< '{"tool_input":{}}')"
  assertEquals "missing file path should be a silent no-op" 0 "$?"
}

. "${SCRIPT_DIR}/../lib/shunit2"
