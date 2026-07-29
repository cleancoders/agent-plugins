#!/usr/bin/env bash
# Tests for plugins/clojure-security/commands/security-audit.md
#
# The command is prose, so these are text assertions. They exist because an
# audit that contradicts CI is worse than no audit: it re-litigates decisions a
# developer already made and teaches them to distrust the report.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AUDIT="${SCRIPT_DIR}/../plugins/clojure-security/commands/security-audit.md"

test_audit_does_not_run_clj_holmes() {
  assertEquals "clj-holmes must be gone from the audit command" \
    "0" "$(grep -c 'clj-holmes' "${AUDIT}" || true)"
}

test_audit_semgrep_row_mirrors_ci() {
  local body; body="$(cat "${AUDIT}")"
  assertContains "must not gate semgrep on a .semgrep.yml" \
    "${body}" "cc-rules"
  assertContains "must mirror CI's registry configs" "${body}" "p/owasp-top-ten"
  assertContains "must mirror CI's registry configs" "${body}" "p/default"
  assertNotContains "the old skip-unless-.semgrep.yml rule must be gone" \
    "${body}" "Skip unless the repo has a"
}

test_audit_handles_nosemgrep_suppressions() {
  assertContains "the audit must not report suppressed findings as live" \
    "$(cat "${AUDIT}")" "nosemgrep"
}

test_audit_reads_the_reverse_index() {
  assertContains "Coverage must be driven by taxonomy-coverage.md" \
    "$(cat "${AUDIT}")" "taxonomy-coverage.md"
}

test_audit_distinguishes_clean_from_unexamined() {
  local body; body="$(cat "${AUDIT}")"
  assertContains "must have a clean state" "${body}" "checked, clean"
  assertContains "must have an unexamined state" "${body}" "not reachable"
}

. "${SCRIPT_DIR}/../lib/shunit2"
