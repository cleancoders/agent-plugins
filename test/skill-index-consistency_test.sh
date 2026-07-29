#!/usr/bin/env bash
# The clojure-security SKILL.md carries a class index table that doubles as the
# manual half of the CWE/OWASP coverage matrix. Each row names a reference file;
# the class must actually be documented there. A row without a heading overstates
# coverage (the matrix claims a class the skill cannot triage); a heading without
# a row hides a class from the matrix. Both directions must hold.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="${SCRIPT_DIR}/../plugins/clojure-security/skills/clojure-security"
SKILL="${SKILL_DIR}/SKILL.md"
REFS="${SKILL_DIR}/references"

# Emit "class ref" for each index-table row. Rows look like:
#   | `read-string-rce` | 94 | A05 | semgrep:cc-read-string | injection |
index_rows() {
  grep -E '^\| `[a-z0-9-]+` \|' "${SKILL}" \
    | awk -F'|' '{gsub(/[ `]/,"",$2); gsub(/ /,"",$6); print $2, $6}'
}

# Emit "class ref" for each "### class-name" heading in each reference file.
ref_headings() {
  for f in "${REFS}"/*.md; do
    base="$(basename "${f}" .md)"
    [ "${base}" = "route-inventory" ] && continue   # a procedure, not a class
    grep -E '^### [a-z0-9-]+$' "${f}" | sed "s/^### //" | while read -r c; do
      echo "${c} ${base}"
    done
  done
}

test_references_directory_exists() {
  assertTrue "references/ must exist" "[ -d '${REFS}' ]"
}

test_every_index_row_has_a_matching_heading() {
  missing="$(comm -23 <(index_rows | sort -u) <(ref_headings | sort -u))"
  assertEquals "index rows with no matching '### class' heading in the named ref" \
    "" "${missing}"
}

test_every_heading_has_a_matching_index_row() {
  orphaned="$(comm -13 <(index_rows | sort -u) <(ref_headings | sort -u))"
  assertEquals "reference headings absent from the SKILL.md index table" \
    "" "${orphaned}"
}

test_reflection_is_not_a_class() {
  assertEquals "reflection is a practice note, not a vulnerability class" \
    "0" "$(index_rows | grep -c '^reflection ' || true)"
}

test_skill_stays_lean() {
  lines="$(wc -l < "${SKILL}")"
  assertTrue "SKILL.md must stay under 200 lines (it is ${lines}); classes belong in references/" \
    "[ ${lines} -lt 200 ]"
}

. "${SCRIPT_DIR}/../lib/shunit2"
