#!/usr/bin/env bash
# The class index maps class -> CWE -> OWASP. That answers "what is this
# finding?" but not "what did we fail to look at?" — so an audit could report
# `OWASP touched: A01, A05` and a reader could not tell a clean category from an
# unexamined one. taxonomy-coverage.md is the reverse index that closes that.
#
# It is only useful if it cannot drift from the forward index, so this test
# checks both directions, and pins the arithmetic the audit report quotes.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="${SCRIPT_DIR}/../plugins/clojure-security/skills/clojure-security"
SKILL="${SKILL_DIR}/SKILL.md"
COVERAGE="${SKILL_DIR}/references/taxonomy-coverage.md"

# "<rank>|<cwe>|<class>|<route>" per CWE Top 25 row.
cwe_rows() {
  grep -E '^\| [0-9]+ \| CWE-[0-9]+ \|' "${COVERAGE}" \
    | awk -F'|' '{gsub(/^ +| +$/,"",$2); gsub(/^ +| +$/,"",$3);
                  gsub(/^ +| +$/,"",$4); gsub(/^ +| +$/,"",$5);
                  print $2 "|" $3 "|" $4 "|" $5}'
}

# Class names mentioned anywhere in the coverage file's class columns.
coverage_classes() {
  grep -oE '`[a-z0-9-]+`' "${COVERAGE}" | tr -d '`' | sort -u
}

index_classes() {
  grep -E '^\| `[a-z0-9-]+` \|' "${SKILL}" \
    | awk -F'|' '{gsub(/[ `]/,"",$2); print $2}' | sort -u
}

test_coverage_file_exists() {
  assertTrue "references/taxonomy-coverage.md must exist" "[ -f '${COVERAGE}' ]"
}

test_all_25_ranks_present_exactly_once() {
  assertEquals "the CWE table must have 25 rows" "25" "$(cwe_rows | wc -l | tr -d ' ')"
  local dupes
  dupes="$(cwe_rows | awk -F'|' '{print $1}' | sort | uniq -d)"
  assertEquals "no rank may appear twice" "" "${dupes}"
  local missing i
  missing=""
  for i in $(seq 1 25); do
    cwe_rows | awk -F'|' -v r="$i" '$1 == r {found=1} END {exit !found}' \
      || missing="${missing}${i} "
  done
  assertEquals "every rank 1-25 must be present" "" "${missing% }"
}

test_nineteen_ranks_are_applicable_to_clojure() {
  # 25 minus the six memory-safety weaknesses the JVM manages. The audit report
  # quotes this number, so pin it.
  local na
  na="$(cwe_rows | grep -c '(memory safety)' || true)"
  assertEquals "6 entries must be marked (memory safety)" "6" "${na}"
}

test_the_memory_safety_entries_are_the_expected_six() {
  local got
  got="$(cwe_rows | awk -F'|' '$3 ~ /memory safety/ {print $2}' | sort | tr '\n' ' ')"
  assertEquals "the non-applicable set is fixed" \
    "CWE-120 CWE-121 CWE-122 CWE-125 CWE-416 CWE-787 " "${got}"
}

test_nine_applicable_ranks_are_llm_review_only() {
  # The headline claim of 0.12.0: these move from audit-only to per-turn review.
  local got
  got="$(cwe_rows | awk -F'|' '$4 == "llm-review" {print $2}' | sort | tr '\n' ' ')"
  assertEquals "the llm-review-only Top 25 set is fixed" \
    "CWE-284 CWE-306 CWE-352 CWE-434 CWE-639 CWE-770 CWE-862 CWE-863 CWE-918 " "${got}"
}

test_gaps_are_recorded_not_hidden() {
  # CWE-20 and CWE-476 have no class and must not silently look covered.
  assertEquals "CWE-20 must be marked (no class)" "1" \
    "$(cwe_rows | awk -F'|' '$2 == "CWE-20" && $3 ~ /no class/' | wc -l | tr -d ' ')"
  assertEquals "CWE-476 must be marked (no class)" "1" \
    "$(cwe_rows | awk -F'|' '$2 == "CWE-476" && $3 ~ /no class/' | wc -l | tr -d ' ')"
}

test_all_ten_owasp_categories_are_listed() {
  local missing c
  missing=""
  for c in A01 A02 A03 A04 A05 A06 A07 A08 A09 A10; do
    grep -q "| ${c} " "${COVERAGE}" || missing="${missing}${c} "
  done
  assertEquals "every OWASP 2025 category needs a row" "" "${missing% }"
}

test_every_class_in_the_index_appears_in_the_coverage_file() {
  local missing
  missing="$(comm -23 <(index_classes) <(coverage_classes))"
  assertEquals "classes in the index but absent from the reverse index" "" "${missing}"
}

test_every_class_in_the_coverage_file_is_a_real_class() {
  local invented
  invented="$(comm -13 <(index_classes) <(coverage_classes))"
  assertEquals "coverage file names classes the index does not define" "" "${invented}"
}

test_reverse_index_routes_agree_with_the_forward_index() {
  # A coverage matrix claiming a route the class index does not have is worse than
  # no matrix: it asserts coverage that does not exist. This is the check that
  # catches it — CWE-22 shipped claiming llm-review when `path-traversal` is
  # semgrep-only, because the row names one class and nothing cross-checked it.
  #
  # A row naming several classes may legitimately be mixed (rank 10 aggregates
  # three semgrep classes and one llm-review one), so the rule is presence-based
  # in both directions rather than string equality.
  local bad rank cwe classes route c fwd want_llm
  bad=""
  while IFS='|' read -r rank cwe classes route; do
    [ -z "${rank}" ] && continue
    case "${classes}" in *"not applicable"*|*"no class"*) continue ;; esac

    want_llm=0
    for c in $(printf '%s' "${classes}" | grep -oE '`[a-z0-9-]+`' | tr -d '`'); do
      fwd="$(awk -F'|' -v k="${c}" '
        /^\| `/ { gsub(/[ `]/,"",$2); if ($2 == k) { gsub(/ /,"",$5); print $5 } }' "${SKILL}")"
      case "${fwd}" in llm-review) want_llm=1 ;; esac
    done

    case "${route}" in
      *llm-review*)
        if [ "${want_llm}" -eq 0 ]; then
          bad="${bad}rank ${rank}: claims llm-review but no named class routes there"$'\n'
        fi ;;
      *)
        if [ "${want_llm}" -eq 1 ]; then
          bad="${bad}rank ${rank}: omits llm-review but a named class routes there"$'\n'
        fi ;;
    esac
  done < <(cwe_rows)

  assertEquals "reverse-index routes must agree with the class index" \
    "" "$(printf '%s' "${bad}" | awk 'NF')"
}

test_sources_are_cited() {
  # Six CWE-to-OWASP mappings in this plugin were wrong on inference before
  # being checked. Taxonomy data gets a source line or it does not go in.
  assertContains "the CWE table must cite mitre" \
    "$(cat "${COVERAGE}")" "cwe.mitre.org"
  assertContains "the OWASP table must cite owasp.org" \
    "$(cat "${COVERAGE}")" "owasp.org"
}

. "${SCRIPT_DIR}/../lib/shunit2"
