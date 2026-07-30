#!/usr/bin/env bash
# Tests for plugins/clojure-security/hooks/turn-ledger.sh
#
# Why this hook exists: the Stop hook's diff is CUMULATIVE — branch merge-base,
# or the session-start SHA, plus uncommitted and untracked. It therefore cannot
# tell what changed in the CURRENT turn. Semgrep does not care; it is fast and
# idempotent. The LLM review does: without a per-turn scope it would re-review
# turn 3's files again on turn 40, forever.
#
# This ledger is that scope. It must never affect a turn, so every failure mode
# — no jq, no cwd, a non-Clojure path, an unwritable directory — exits 0.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOK="${SCRIPT_DIR}/../plugins/clojure-security/hooks/turn-ledger.sh"

oneTimeSetUp() {
  if ! command -v jq >/dev/null 2>&1; then
    echo "jq not installed — skipping turn-ledger tests"
    startSkipping
  fi
}

setUp() {
  PROJECT="$(mktemp -d)"
  LEDGER="${PROJECT}/.claude/.security-turn-files"
}

tearDown() {
  [ -n "${PROJECT}" ] && rm -rf "${PROJECT}"
}

# Feed an Edit-shaped payload.
edit() {
  printf '{"cwd":"%s","tool_name":"Edit","tool_input":{"file_path":"%s"}}' \
    "${PROJECT}" "$1" | bash "${HOOK}" >/dev/null 2>&1
  return 0
}

ledger() {
  cat "${LEDGER}" 2>/dev/null
}

test_records_a_clj_edit() {
  edit "src/clj/app/routes.clj"
  assertEquals "the edited path must be recorded" \
    "src/clj/app/routes.clj" "$(ledger)"
}

test_records_cljs_and_cljc() {
  edit "src/cljs/app/page.cljs"
  edit "src/cljc/app/domain.cljc"
  assertContains "cljs must be recorded — it is where CWE-79 lives" \
    "$(ledger)" "page.cljs"
  assertContains "cljc must be recorded — c3kit puts shared logic there" \
    "$(ledger)" "domain.cljc"
}

test_ignores_non_clojure_paths() {
  edit "README.md"
  edit "package.json"
  assertFalse "no ledger should be created for non-Clojure edits" \
    "[ -f '${LEDGER}' ]"
}

test_ignores_edn_and_bb() {
  # Unlike the lint hook, which lints .edn and .bb: the 13 classes this feeds
  # are about handlers, routes and dataflow, not config files.
  edit "deps.edn"
  edit "script.bb"
  assertFalse "config files must not trigger a security review" \
    "[ -f '${LEDGER}' ]"
}

test_appends_across_multiple_edits() {
  edit "a.clj"
  edit "b.clj"
  assertEquals "both edits must be present" "2" "$(ledger | wc -l | tr -d ' ')"
}

test_handles_multiedit_file_paths_array() {
  printf '{"cwd":"%s","tool_name":"MultiEdit","tool_input":{"file_paths":["x.clj","y.md","z.cljc"]}}' \
    "${PROJECT}" | bash "${HOOK}" >/dev/null 2>&1
  assertContains "MultiEdit array entries must be recorded" "$(ledger)" "x.clj"
  assertContains "MultiEdit array entries must be recorded" "$(ledger)" "z.cljc"
  assertNotContains "non-Clojure array entries must be skipped" "$(ledger)" "y.md"
}

test_always_exits_zero() {
  # A PostToolUse hook returning non-zero surfaces stderr to Claude and, at 2,
  # blocks. A bookkeeping hook must never do either.
  printf '{"cwd":"%s","tool_name":"Edit","tool_input":{"file_path":"a.clj"}}' "${PROJECT}" \
    | bash "${HOOK}" >/dev/null 2>&1
  assertEquals "clean path exits 0" "0" "$?"

  printf 'not json at all' | bash "${HOOK}" >/dev/null 2>&1
  assertEquals "malformed input exits 0" "0" "$?"

  printf '{"cwd":"%s","tool_name":"Edit","tool_input":{}}' "${PROJECT}" \
    | bash "${HOOK}" >/dev/null 2>&1
  assertEquals "missing file_path exits 0" "0" "$?"
}

test_records_an_absolute_path() {
  # This is the only shape production sends: Claude Code puts an absolute path
  # in .tool_input.file_path. The suffix glob and the append are agnostic to it,
  # but nothing proved that until now.
  printf '{"cwd":"%s","tool_name":"Edit","tool_input":{"file_path":"%s/src/app.clj"}}' \
    "${PROJECT}" "${PROJECT}" | bash "${HOOK}" >/dev/null 2>&1
  assertEquals "an absolute path must be recorded verbatim" \
    "${PROJECT}/src/app.clj" "$(ledger)"
}

test_produces_no_output() {
  local out
  out="$(printf '{"cwd":"%s","tool_name":"Edit","tool_input":{"file_path":"a.clj"}}' "${PROJECT}" \
    | bash "${HOOK}" 2>&1)"
  assertEquals "the ledger hook must be silent" "" "${out}"
}

. "${SCRIPT_DIR}/../lib/shunit2"
