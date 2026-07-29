#!/usr/bin/env bash
# Tests for the scanner-blind-class review in security-stop.sh.
#
# 13 of the skill's 27 vulnerability classes have no scanner at all — they need
# dataflow, namespace-alias resolution, or whole-route reasoning that semgrep
# cannot do. Before this they were reachable only by a manual /security-audit
# that nothing triggers. Nine of them are CWE Top 25 entries.
#
# The invariants:
#   - the ledger is drained UNCONDITIONALLY, before the decision to review.
#     A review that does not fire must not leave work to pile up across turns.
#   - the directive is one-shot per turn. It has no findings to clear, so
#     re-issuing it on reentry would block forever.
#   - it names the ledger's files and tells Claude not to sweep the repo.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOK="${SCRIPT_DIR}/../plugins/clojure-security/hooks/security-stop.sh"

oneTimeSetUp() {
  if ! command -v jq >/dev/null 2>&1 || ! command -v git >/dev/null 2>&1; then
    echo "jq or git not installed — skipping stop-review tests"
    startSkipping
  fi
}

setUp() {
  PROJECT="$(mktemp -d)"
  BIN="$(mktemp -d)"
  RULES="$(mktemp -d)"
  LEDGER="${PROJECT}/.claude/.security-turn-files"

  printf 'rules:\n' > "${RULES}/cc-read-string.yaml"

  # Clean semgrep, absent gitleaks: the review must be able to fire on its own.
  cat > "${BIN}/semgrep" <<'EOF'
#!/usr/bin/env bash
printf '{"results":[],"errors":[]}'
exit 0
EOF
  chmod +x "${BIN}/semgrep"

  git -C "${PROJECT}" init -q
  git -C "${PROJECT}" config user.email t@t.t
  git -C "${PROJECT}" config user.name t
  printf '{:deps {}}' > "${PROJECT}/deps.edn"
  printf '(ns foo)' > "${PROJECT}/routes.clj"
  git -C "${PROJECT}" add -A
  git -C "${PROJECT}" commit -qm init >/dev/null 2>&1
  printf '(ns foo)\n(def x 1)\n' > "${PROJECT}/routes.clj"

  mkdir -p "${PROJECT}/.claude"
}

tearDown() {
  rm -rf "${PROJECT}" "${BIN}" "${RULES}"
}

# Run the hook; echo "<exit-code>|<stderr>". `active` is the stop_hook_active
# value; extra env can be prepended via ENV_EXTRA.
run_hook() {
  local active="${1:-false}" err rc
  err="$(printf '{"cwd":"%s","stop_hook_active":%s}' "${PROJECT}" "${active}" \
    | PATH="${BIN}:${PATH}" CC_SEMGREP_RULES_DIR="${RULES}" \
      env ${ENV_EXTRA:-} bash "${HOOK}" 2>&1 >/dev/null)"
  rc=$?
  printf '%s|%s' "${rc}" "${err}"
}

test_no_ledger_means_no_review() {
  local out; out="$(run_hook)"
  assertEquals "clean scan and no ledger -> exit 0" "0" "${out%%|*}"
  assertEquals "no ledger -> no directive" "" "${out#*|}"
}

test_ledger_triggers_a_blocking_review() {
  printf 'routes.clj\n' > "${LEDGER}"
  local out; out="$(run_hook)"
  assertEquals "a populated ledger must block the stop" "2" "${out%%|*}"
  assertContains "the directive must name the edited file" "${out#*|}" "routes.clj"
}

test_directive_scopes_the_review_to_the_ledger() {
  printf 'routes.clj\n' > "${LEDGER}"
  local out; out="$(run_hook)"
  local err="${out#*|}"
  assertContains "must forbid a repo-wide sweep" "${err}" "do not sweep the repo"
  assertContains "must point at the access-control reference" \
    "${err}" "references/access-control.md"
  assertContains "must point at the config-and-ops reference" \
    "${err}" "references/config-and-ops.md"
  assertContains "must point at the injection reference for macro-runtime-input" \
    "${err}" "references/injection.md"
  assertContains "must point at the route sweep procedure" \
    "${err}" "references/route-inventory.md"
  assertContains "must forbid auto-fixing" "${err}" "Do not auto-fix"
}

test_ledger_is_deleted_after_the_review() {
  printf 'routes.clj\n' > "${LEDGER}"
  run_hook >/dev/null
  assertFalse "the ledger must be drained" "[ -f '${LEDGER}' ]"
}

test_ledger_is_deleted_even_when_the_review_is_suppressed() {
  # The drain must happen BEFORE the decision to review. Otherwise a suppressed
  # turn leaves its files to pile up and the next unsuppressed Stop reviews a
  # cumulative list — the exact repetition this design exists to avoid.
  printf 'routes.clj\n' > "${LEDGER}"
  ENV_EXTRA="CC_SKIP_DIFF_REVIEW=1" run_hook >/dev/null
  assertFalse "the ledger must be drained even when suppressed" "[ -f '${LEDGER}' ]"
}

test_reentry_does_not_reissue_the_directive() {
  printf 'routes.clj\n' > "${LEDGER}"
  local out; out="$(run_hook "true")"
  assertEquals "reentry must not block on a directive alone" "0" "${out%%|*}"
}

test_skip_env_var_suppresses_the_block() {
  printf 'routes.clj\n' > "${LEDGER}"
  local out; out="$(ENV_EXTRA="CC_SKIP_DIFF_REVIEW=1" run_hook)"
  assertEquals "the opt-out must not block" "0" "${out%%|*}"
}

test_deleted_files_are_not_reviewed() {
  printf 'routes.clj\ngone.clj\n' > "${LEDGER}"
  local out; out="$(run_hook)"
  local err="${out#*|}"
  assertContains "existing file must be reviewed" "${err}" "routes.clj"
  assertNotContains "a file deleted later in the turn must be dropped" \
    "${err}" "gone.clj"
}

test_review_names_the_scanner_blind_classes() {
  printf 'routes.clj\n' > "${LEDGER}"
  local out; out="$(run_hook)"
  local err="${out#*|}"
  # Spot-check the highest-value ones. missing-authz is CWE-862, #4 on the
  # CWE Top 25; idor is CWE-639; ssrf is CWE-918.
  assertContains "must name missing-authz" "${err}" "missing-authz"
  assertContains "must name idor" "${err}" "idor"
  assertContains "must name ssrf" "${err}" "ssrf"
  assertContains "must name macro-runtime-input" "${err}" "macro-runtime-input"
}

test_absolute_ledger_paths_are_reported_repo_relative() {
  # The semgrep block in the same report prints repo-relative paths. A directive
  # that prints absolute ones reads like output from a different tool.
  printf '%s/routes.clj\n' "${PROJECT}" > "${LEDGER}"
  local out; out="$(run_hook)"
  local err="${out#*|}"
  assertContains "path must be reported repo-relative" "${err}" "routes.clj"
  assertNotContains "the project prefix must be stripped" "${err}" "${PROJECT}/routes.clj"
}

. "${SCRIPT_DIR}/../lib/shunit2"
