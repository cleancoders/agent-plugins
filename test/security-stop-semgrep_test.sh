#!/usr/bin/env bash
# Tests for plugins/clojure-security/hooks/security-stop.sh — semgrep call.
#
# CI dropped clj-holmes for 16 cc-* semgrep rules, so the Stop hook had to move
# too or a developer's local gate and their PR check would enforce different
# rule sets. The pins that matter:
#
#   - ERROR blocks (exit 2), WARNING does not (exit 1). Three rules are WARNING
#     in CI on purpose — without dataflow they cannot be precise enough to gate,
#     and cc-generic-catch fires on ordinary (catch Exception e ...). A local
#     gate stricter than CI gets muted, which costs more than it buys.
#   - check_id is displayed short. semgrep prefixes it with the config path when
#     --config is absolute, which would print
#     ".private.tmp.cc-semgrep-rules-v1.cc-read-string" as the rule name.
#   - a missing rules dir or missing semgrep skips silently.
#
# Replaces security-stop-holmes_test.sh.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOK="${SCRIPT_DIR}/../plugins/clojure-security/hooks/security-stop.sh"

oneTimeSetUp() {
  if ! command -v jq >/dev/null 2>&1 || ! command -v git >/dev/null 2>&1; then
    echo "jq or git not installed — skipping security-stop semgrep tests"
    startSkipping
  fi
}

setUp() {
  PROJECT="$(mktemp -d)"
  BIN="$(mktemp -d)"
  RULES="$(mktemp -d)"
  ARGS_LOG="${BIN}/semgrep-args.txt"
  RESULTS="${BIN}/results.json"

  printf 'rules:\n' > "${RULES}/cc-read-string.yaml"
  printf '{"results":[],"errors":[]}' > "${RESULTS}"

  # Stub semgrep: record args, emit whatever RESULTS holds on stdout.
  cat > "${BIN}/semgrep" <<EOF
#!/usr/bin/env bash
printf '%s\n' "\$*" > "${ARGS_LOG}"
cat "${RESULTS}"
exit 0
EOF
  chmod +x "${BIN}/semgrep"

  git -C "${PROJECT}" init -q
  git -C "${PROJECT}" config user.email t@t.t
  git -C "${PROJECT}" config user.name t
  printf '{:deps {}}' > "${PROJECT}/deps.edn"
  printf '(ns foo)' > "${PROJECT}/foo.clj"
  git -C "${PROJECT}" add -A
  git -C "${PROJECT}" commit -qm init >/dev/null 2>&1
  printf '(ns foo)\n(def x 1)\n' > "${PROJECT}/foo.clj"
}

tearDown() {
  rm -rf "${PROJECT}" "${BIN}" "${RULES}"
}

# Emit a semgrep JSON result at the given severity. The check_id deliberately
# carries an absolute-config path prefix, as real semgrep produces.
set_finding() {
  local sev="$1" rule="$2"
  cat > "${RESULTS}" <<EOF
{"results":[{"check_id":"private.tmp.cc-semgrep-rules-v1.${rule}",
  "path":"foo.clj","start":{"line":2,"col":12},"end":{"line":2,"col":30},
  "extra":{"severity":"${sev}","message":"unsafe thing"}}],"errors":[]}
EOF
}

# Run the hook; echo "<exit-code>|<stderr>".
run_hook() {
  local err rc
  err="$(printf '{"cwd":"%s","stop_hook_active":false}' "${PROJECT}" \
    | PATH="${BIN}:${PATH}" CC_SEMGREP_RULES_DIR="${RULES}" \
      CC_SKIP_DIFF_REVIEW=1 \
      bash "${HOOK}" 2>&1 >/dev/null)"
  rc=$?
  printf '%s|%s' "${rc}" "${err}"
}

test_semgrep_invoked_with_json_and_the_rules_dir() {
  run_hook >/dev/null
  assertTrue "semgrep should have been invoked" "[ -f '${ARGS_LOG}' ]"
  local args; args="$(cat "${ARGS_LOG}")"
  assertContains "must request JSON" "${args}" "--json"
  assertContains "must pass the resolved rules dir" "${args}" "${RULES}"
}

test_error_severity_blocks() {
  set_finding "ERROR" "cc-read-string"
  local out; out="$(run_hook)"
  assertEquals "an ERROR finding must block the stop" "2" "${out%%|*}"
  assertContains "the finding must be reported" "${out#*|}" "unsafe thing"
}

test_warning_severity_does_not_block() {
  set_finding "WARNING" "cc-generic-catch"
  local out; out="$(run_hook)"
  assertEquals "a WARNING finding must not block (exit 1, advisory)" "1" "${out%%|*}"
  assertContains "the warning must still be reported" "${out#*|}" "cc-generic-catch"
}

test_warning_reported_under_a_separate_heading() {
  set_finding "WARNING" "cc-path-traversal"
  local out; out="$(run_hook)"
  assertContains "warnings need their own advisory heading" "${out#*|}" "advisory"
}

test_check_id_displayed_without_the_config_path_prefix() {
  set_finding "ERROR" "cc-read-string"
  local out; out="$(run_hook)"
  assertContains "rule name must be the bare id" "${out#*|}" "[cc-read-string]"
  assertNotContains "config path prefix must be stripped" "${out#*|}" "private.tmp"
}

test_clean_scan_exits_zero_silently() {
  local out; out="$(run_hook)"
  assertEquals "no findings -> exit 0" "0" "${out%%|*}"
  assertEquals "no findings -> no output" "" "${out#*|}"
}

test_missing_rules_dir_skips_the_scan() {
  local out
  out="$(printf '{"cwd":"%s","stop_hook_active":false}' "${PROJECT}" \
    | PATH="${BIN}:${PATH}" CC_SEMGREP_RULES_DIR="${BIN}/nope" \
      CC_SEMGREP_RULES_CACHE_ROOT="${BIN}/cache" \
      CC_SEMGREP_RULES_URL_BASE="file:///nonexistent" \
      CC_SKIP_DIFF_REVIEW=1 \
      bash "${HOOK}" 2>&1 >/dev/null; printf '|%s' "$?")"
  assertEquals "unresolvable rules -> exit 0, no crash" "0" "${out#*|}"
  assertFalse "semgrep must not run without rules" "[ -f '${ARGS_LOG}' ]"
}

test_clj_holmes_is_never_invoked() {
  cat > "${BIN}/clj-holmes" <<'EOF'
#!/usr/bin/env bash
touch "$(dirname "$0")/holmes-ran"
exit 0
EOF
  chmod +x "${BIN}/clj-holmes"
  run_hook >/dev/null
  assertFalse "clj-holmes must be gone from the Stop hook" "[ -f '${BIN}/holmes-ran' ]"
}

# A semgrep process killed mid-write (e.g. a timeout) leaves truncated JSON.
# jq exits 5 on malformed input, which is not `set -e`-exempt as a bare
# assignment — this must not kill the hook with an uncontracted exit code.
test_truncated_semgrep_output_does_not_kill_hook() {
  printf '{"results":[{"check_id":"x"' > "${RESULTS}"
  local out; out="$(run_hook)"
  assertEquals "malformed JSON must not crash the hook" "0" "${out%%|*}"
  assertEquals "malformed JSON must not print anything" "" "${out#*|}"
}

# A wrong rules dir, a partial cache, corrupt rule YAML, or an incompatible
# semgrep all produce zero `.results` and a non-empty `.errors` — and,
# discarded, all four rendered identically to "clean, exit 0". This is the
# exact failure a `CC_SEMGREP_RULES_DIR` pointed at a repo checkout root
# produced: semgrep parsed unrelated YAML, found nothing, exited non-zero, and
# the hook reported clean. The tool error must be surfaced, not blocking.
test_tool_errors_are_surfaced_not_rendered_as_clean() {
  printf '{"results":[],"errors":[{"message":"Invalid Semgrep rule schema"}]}' > "${RESULTS}"
  local out; out="$(run_hook)"
  assertEquals "a tool error alone must not block (it is not a finding)" "1" "${out%%|*}"
  assertContains "the tool error must be surfaced, not swallowed" \
    "${out#*|}" "Invalid Semgrep rule schema"
}

# Regression: semgrep reports an ordinary Clojure syntax error (unbalanced
# paren, etc.) as a `PartialParsing` entry with `"level": "warn"`, and still
# exits 0 — that is its normal signal for a file it could not fully parse, not
# a broken rules directory. Surfacing this as a tool-error notice misdiagnoses
# a Clojure bug (which clj-kondo-postedit.sh already flagged on the edit) as a
# rules-dir fault, drags in the taint-shaped triage block that does not fit,
# and re-fires every turn while the file stays broken (the diff is cumulative).
test_partial_parsing_warning_is_not_reported_as_a_tool_error() {
  printf '{"results":[],"errors":[{"level":"warn","type":["PartialParsing",[]]}]}' > "${RESULTS}"
  local out; out="$(run_hook)"
  assertEquals "a parse warning alone must not block or warn" "0" "${out%%|*}"
  assertEquals "a parse warning must produce no output" "" "${out#*|}"
}

# --- commit-backstop.sh -----------------------------------------------------
# Same rule set, same severity split, different gate: a PreToolUse hook cannot
# signal "advisory" with exit 1 (that does not block, and neither does 0), so
# advisory findings print and the commit proceeds.

COMMIT_HOOK="${SCRIPT_DIR}/../plugins/clojure-security/hooks/commit-backstop.sh"

run_commit_hook() {
  local err rc
  err="$(printf '{"tool_name":"Bash","tool_input":{"command":"git commit -m x"},"cwd":"%s"}' "${PROJECT}" \
    | PATH="${BIN}:${PATH}" CC_SEMGREP_RULES_DIR="${RULES}" \
      bash "${COMMIT_HOOK}" 2>&1 >/dev/null)"
  rc=$?
  printf '%s|%s' "${rc}" "${err}"
}

stage_a_clojure_file() {
  printf '(ns bar)\n(def y 2)\n' > "${PROJECT}/bar.clj"
  git -C "${PROJECT}" add bar.clj
}

test_commit_backstop_blocks_on_error_severity() {
  stage_a_clojure_file
  set_finding "ERROR" "cc-sql-string-concat"
  local out; out="$(run_commit_hook)"
  assertEquals "an ERROR finding must block the commit" "2" "${out%%|*}"
  assertContains "the finding must be reported" "${out#*|}" "cc-sql-string-concat"
}

test_commit_backstop_does_not_block_on_warning_severity() {
  stage_a_clojure_file
  set_finding "WARNING" "cc-generic-catch"
  local out; out="$(run_commit_hook)"
  assertEquals "a WARNING finding must not block the commit" "0" "${out%%|*}"
  assertContains "the warning must still print" "${out#*|}" "cc-generic-catch"
}

test_commit_backstop_uses_semgrep_not_holmes() {
  stage_a_clojure_file
  run_commit_hook >/dev/null
  assertTrue "semgrep should have been invoked" "[ -f '${ARGS_LOG}' ]"
  assertContains "must pass the resolved rules dir" "$(cat "${ARGS_LOG}")" "${RULES}"
}

# A semgrep process killed mid-write leaves truncated JSON. jq exits 5 on
# malformed input, which is not `set -e`-exempt as a bare assignment — this
# must not block a commit with an uncontracted exit code (same hazard class
# as the Stop hook's truncated-JSON test above).
test_commit_backstop_truncated_semgrep_output_does_not_crash() {
  stage_a_clojure_file
  printf '{"results":[{"check_id":"x"' > "${RESULTS}"
  local out; out="$(run_commit_hook)"
  assertEquals "malformed JSON must not crash the hook" "0" "${out%%|*}"
  assertEquals "malformed JSON must not print anything" "" "${out#*|}"
}

# Same class of bug as the Stop hook: a tool error must not render as a silent
# clean pass, and must not block a commit either — it is not a finding.
test_commit_backstop_surfaces_tool_errors_without_blocking() {
  stage_a_clojure_file
  printf '{"results":[],"errors":[{"message":"Invalid Semgrep rule schema"}]}' > "${RESULTS}"
  local out; out="$(run_commit_hook)"
  assertEquals "a tool error alone must not block the commit" "0" "${out%%|*}"
  assertContains "the tool error must be surfaced, not swallowed" \
    "${out#*|}" "Invalid Semgrep rule schema"
}

# Every other fixture hardcodes "path":"foo.clj", so the prefix-strip `sub()`
# in the jq filter never actually matches anything in those tests — it's a
# no-op in disguise. This test makes the stub report the real tmp-mirror path
# semgrep was invoked with, so the rewrite back to a repo-relative path is
# pinned rather than merely exercised.
test_commit_backstop_rewrites_tmp_mirror_prefix_to_repo_relative_path() {
  stage_a_clojure_file
  cat > "${BIN}/semgrep" <<EOF
#!/usr/bin/env bash
printf '%s\n' "\$*" > "${ARGS_LOG}"
last="\${@: -1}"
cat <<JSON
{"results":[{"check_id":"private.tmp.cc-semgrep-rules-v1.cc-sql-string-concat",
  "path":"\$last","start":{"line":2,"col":12},"end":{"line":2,"col":30},
  "extra":{"severity":"ERROR","message":"unsafe thing"}}],"errors":[]}
JSON
exit 0
EOF
  chmod +x "${BIN}/semgrep"

  local out; out="$(run_commit_hook)"
  local body="${out#*|}"
  local tmp_dir; tmp_dir="$(tail -1 "${ARGS_LOG}" | awk '{print $NF}')"
  tmp_dir="${tmp_dir%/*}"

  assertContains "reported path must be repo-relative" "${body}" "bar.clj:"
  assertNotContains "tmp-mirror prefix must be stripped from the reported path" "${body}" "${tmp_dir}"
}

. "${SCRIPT_DIR}/../lib/shunit2"
