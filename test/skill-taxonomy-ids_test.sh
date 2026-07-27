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

. "${SCRIPT_DIR}/../lib/shunit2"
