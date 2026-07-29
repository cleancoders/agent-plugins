#!/usr/bin/env bash
# The class index is handed to auditors as coverage evidence. A malformed or
# invented taxonomy ID makes it worse than no evidence. Six CWE-to-OWASP
# mappings that "looked obvious" were verified wrong against owasp.org, so this
# test pins the ones the design verified and rejects free-text in either column.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL="${SCRIPT_DIR}/../plugins/clojure-security/skills/clojure-security/SKILL.md"

# "class|cwe|owasp" per index row.
rows() {
  grep -E '^\| `[a-z0-9-]+` \|' "${SKILL}" \
    | awk -F'|' '{gsub(/[ `]/,"",$2); gsub(/^ +| +$/,"",$3); gsub(/ /,"",$4);
                  print $2 "|" $3 "|" $4}'
}

test_cwe_column_is_integers_or_varies() {
  bad="$(rows | awk -F'|' '$2 != "varies" && $2 !~ /^[0-9]+(, ?[0-9]+)*$/ {print $1 " => " $2}')"
  assertEquals "CWE cells must be bare integers (comma-separated) or 'varies'" "" "${bad}"
}

test_owasp_column_is_a_2025_category_or_none() {
  bad="$(rows | awk -F'|' '$3 !~ /^(A0[1-9]|A10|\(none\))$/ {print $1 " => " $3}')"
  assertEquals "OWASP cells must be A01-A10 or (none)" "" "${bad}"
}

# Regression guards for the six mappings the design verified against owasp.org.
# Each was inferred wrong before verification; do not "correct" them back.
assert_mapping() {
  actual="$(rows | awk -F'|' -v c="$1" '$1 == c {print $3}')"
  assertEquals "$3" "$2" "${actual}"
}

test_verified_mappings_are_pinned() {
  assert_mapping "xxe" "A02" \
    "CWE-611 XXE is A02 Security Misconfiguration, not A05 Injection"
  assert_mapping "missing-authn" "A07" \
    "CWE-306 is A07; A01's 40-CWE list excludes it"
  assert_mapping "mass-assignment" "A08" \
    "CWE-915 is A08 Integrity Failures, not A01"
  assert_mapping "unrestricted-upload" "A06" \
    "CWE-434 is a notable CWE of A06 Insecure Design"
  assert_mapping "resource-exhaustion" "(none)" \
    "CWE-770/400 are CWE Top 25 #25 but map to no OWASP 2025 category"
  assert_mapping "insecure-tls-verification" "A07" \
    "CWE-295 is A07; A04's 32-CWE crypto list excludes it"
  assert_mapping "java-deserialization" "A08" \
    "CWE-502 is A08 only; A05's 37-CWE injection list excludes it"
}

# --- route column -----------------------------------------------------------
# The index now records HOW each class is detected. Without it, a reader cannot
# tell which classes CI gates, which the Stop-hook review covers, and which are
# audit-only — the local/CI/audit split that this plugin's whole value rests on.

# "class|route" per index row.
route_rows() {
  grep -E '^\| `[a-z0-9-]+` \|' "${SKILL}" \
    | awk -F'|' '{gsub(/[ `]/,"",$2); gsub(/ /,"",$5); print $2 "|" $5}'
}

# The 16 cc-* rules in cleancoders/github-actions at v1. Pinned rather than
# globbed: the tests must not touch the network, and the rules live in another
# repo. A rule renamed upstream shows up as a CI failure there, not here — what
# this catches is a typo or a drop on THIS side.
CC_RULES="cc-cljs-eval cc-cljs-innerhtml cc-clojure-xml-xxe cc-dangerously-set-html
cc-explain-data-response cc-generic-catch cc-hiccup-raw cc-insecure-tls
cc-load-string cc-nippy-thaw cc-path-traversal cc-read-string cc-shell-exec
cc-snakeyaml-unsafe cc-sql-string-concat cc-weak-crypto"

test_route_column_uses_only_known_forms() {
  bad="$(route_rows | awk -F'|' '
    $2 !~ /^(semgrep:cc-[a-z-]+(,cc-[a-z-]+)*|llm-review|clj-watson|audit-only)$/ {
      print $1 " => " $2 }')"
  assertEquals "route must be semgrep:<id>[,<id>], llm-review, clj-watson or audit-only" \
    "" "${bad}"
}

test_every_semgrep_rule_named_actually_exists() {
  named="$(route_rows | awk -F'|' '$2 ~ /^semgrep:/ {sub(/^semgrep:/,"",$2); gsub(/,/,"\n",$2); print $2}' | sort -u)"
  known="$(printf '%s\n' ${CC_RULES} | sort -u)"
  unknown="$(comm -23 <(printf '%s\n' "${named}") <(printf '%s\n' "${known}"))"
  assertEquals "index names cc-* rules that do not exist upstream" "" "${unknown}"
}

test_every_cc_rule_is_claimed_by_some_class() {
  named="$(route_rows | awk -F'|' '$2 ~ /^semgrep:/ {sub(/^semgrep:/,"",$2); gsub(/,/,"\n",$2); print $2}' | sort -u)"
  known="$(printf '%s\n' ${CC_RULES} | sort -u)"
  orphaned="$(comm -13 <(printf '%s\n' "${named}") <(printf '%s\n' "${known}"))"
  assertEquals "CI rules with no class in the index — findings could not be triaged" \
    "" "${orphaned}"
}

test_clj_holmes_is_absent_from_the_skill() {
  # CI dropped it. A skill that still lists it as a pipeline tool teaches the
  # reader to expect coverage that is not there.
  assertEquals "clj-holmes must not appear in SKILL.md" \
    "0" "$(grep -c 'clj-holmes' "${SKILL}" || true)"
}

. "${SCRIPT_DIR}/../lib/shunit2"
