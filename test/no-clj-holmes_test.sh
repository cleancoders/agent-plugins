#!/usr/bin/env bash
# Definition of done #1 from the handoff brief: no file in the plugin claims
# clj-holmes is part of CI. A stale attribution is worse than silence — it tells
# the reader a finding will be caught by something that no longer runs, and it
# points them at software abandoned since October 2022.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN="${SCRIPT_DIR}/../plugins/clojure-security"

test_no_plugin_file_credits_clj_holmes_for_ci() {
  # Two deliberate exemptions:
  #   - CHANGES is history and must keep its record of why the tool was dropped.
  #   - clj-watson genuinely lives at github.com/clj-holmes/clj-watson. That URL
  #     is correct and must not be "fixed"; strip the substring before matching
  #     rather than weakening the invariant for every other file.
  local hits f body
  hits=""
  # -print0 into `read -d ''`, not `for f in $(find ...)`: unquoted command
  # substitution word-splits on whitespace, so a path containing a space is torn
  # into fragments that name no file, `sed` fails silently with stderr already
  # discarded, and the file is never scanned — a false PASS. Demonstrated, not
  # theoretical. This is the one test meant to still matter years from now.
  while IFS= read -r -d '' f; do
    body="$(sed 's|clj-holmes/clj-watson||g' "${f}" 2>/dev/null)"
    case "${body}" in
      *clj-holmes*) hits="${hits}${f}"$'\n' ;;
    esac
  done < <(find "${PLUGIN}" -type f ! -name CHANGES -print0)
  assertEquals "these files still reference clj-holmes" "" "$(printf '%s' "${hits}" | awk 'NF')"
}

test_detected_in_ci_lines_name_real_cc_rules() {
  # Every "Detected in CI by" line must name a cc-* rule. injection.md already
  # used this form; config-and-ops.md credited clj-holmes rules by name.
  local bad
  bad="$(grep -rhn 'Detected in CI by' "${PLUGIN}/skills" 2>/dev/null \
    | grep -v 'cc-' || true)"
  assertEquals "CI attributions must name a cc-* rule" "" "${bad}"
}

. "${SCRIPT_DIR}/../lib/shunit2"
