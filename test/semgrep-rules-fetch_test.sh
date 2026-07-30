#!/usr/bin/env bash
# Tests for hooks/lib/semgrep-rules.sh — how the hooks obtain the 16 cc-*
# semgrep rules that gate CI.
#
# Those rules live in cleancoders/github-actions, not in this plugin. Vendoring
# a copy here would create exactly the drift the coverage matrix exists to
# prevent, so they are resolved at run time: env override, then a warm cache,
# then a cold fetch of a pinned tag. Every failure mode must degrade to "skip
# the Clojure scan" rather than to a crash or a silent clean result.
#
# Replaces holmes-autofetch_test.sh. Stubs curl on PATH — no test touches the
# network.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIB="${SCRIPT_DIR}/../plugins/clojure-security/hooks/lib/semgrep-rules.sh"

setUp() {
  BIN="$(mktemp -d)"
  FIXTURE="$(mktemp -d)"
  FAKE_TMP="$(mktemp -d)"
  CURL_LOG="${BIN}/curl-args.txt"

  printf 'rules:\n' > "${FIXTURE}/cc-read-string.yaml"

  # Stub curl: record args, then write a tarball whose layout matches
  # codeload's — <repo>-<ref>/security-rules/semgrep/*.yaml
  STAGE="$(mktemp -d)"
  mkdir -p "${STAGE}/github-actions-v1/security-rules/semgrep"
  printf 'rules:\n' > "${STAGE}/github-actions-v1/security-rules/semgrep/cc-read-string.yaml"
  printf 'rules:\n' > "${STAGE}/github-actions-v1/security-rules/semgrep/cc-weak-crypto.yaml"
  tar -czf "${BIN}/payload.tar.gz" -C "${STAGE}" github-actions-v1
  rm -rf "${STAGE}"

  cat > "${BIN}/curl" <<EOF
#!/usr/bin/env bash
printf '%s\n' "\$*" >> "${CURL_LOG}"
out=""
prev=""
for a in "\$@"; do
  [ "\$prev" = "-o" ] && out="\$a"
  prev="\$a"
done
if [ "\${CURL_SHOULD_FAIL:-0}" = "1" ]; then exit 22; fi
[ -n "\$out" ] && cp "${BIN}/payload.tar.gz" "\$out"
exit 0
EOF
  chmod +x "${BIN}/curl"
}

tearDown() {
  rm -rf "${BIN}" "${FIXTURE}" "${FAKE_TMP}"
}

# Run resolve_semgrep_rules in a subshell with a per-test cache location, so a
# real /tmp/cc-semgrep-rules-* on the developer's machine cannot leak in.
resolve() {
  ( . "${LIB}" >/dev/null 2>&1
    CC_SEMGREP_RULES_CACHE_ROOT="${FAKE_TMP}"
    resolve_semgrep_rules )
}

test_env_override_wins_and_skips_network() {
  local got
  got="$(CC_SEMGREP_RULES_DIR="${FIXTURE}" PATH="${BIN}:${PATH}" resolve)"
  assertEquals "override dir must be returned verbatim" "${FIXTURE}" "${got}"
  assertFalse "override must not fetch" "[ -f '${CURL_LOG}' ]"
}

test_nonexistent_override_falls_through_to_fetch() {
  local got
  got="$(CC_SEMGREP_RULES_DIR="${FAKE_TMP}/nope" PATH="${BIN}:${PATH}" resolve)"
  assertTrue "a bogus override must not be returned" "[ '${got}' != '${FAKE_TMP}/nope' ]"
  assertTrue "must have fetched instead" "[ -f '${CURL_LOG}' ]"
}

test_cold_cache_fetches_and_extracts_the_yaml() {
  local got
  got="$(PATH="${BIN}:${PATH}" resolve)"
  assertTrue "must have fetched" "[ -f '${CURL_LOG}' ]"
  assertTrue "cache dir must exist" "[ -d '${got}' ]"
  assertTrue "rule yaml must be extracted flat into the cache" \
    "[ -f '${got}/cc-read-string.yaml' ]"
  assertContains "cache dir name must pin the ref" "${got}" "v1"
}

test_warm_cache_does_not_fetch() {
  PATH="${BIN}:${PATH}" resolve >/dev/null   # warm it
  rm -f "${CURL_LOG}"
  local got
  got="$(PATH="${BIN}:${PATH}" resolve)"
  assertTrue "warm cache must still resolve" "[ -f '${got}/cc-read-string.yaml' ]"
  assertFalse "warm cache must not re-fetch" "[ -f '${CURL_LOG}' ]"
}

test_fetch_failure_returns_nothing_and_leaves_no_cache() {
  local got
  got="$(CURL_SHOULD_FAIL=1 PATH="${BIN}:${PATH}" resolve)"
  assertEquals "a failed fetch must resolve to nothing" "" "${got}"
  assertFalse "a failed fetch must not leave a half-built cache" \
    "[ -d '${FAKE_TMP}/cc-semgrep-rules-v1' ]"
}

test_returns_zero_even_on_failure() {
  # Callers run under `set -e`. A non-zero return would kill the hook.
  CURL_SHOULD_FAIL=1 PATH="${BIN}:${PATH}" resolve >/dev/null 2>&1
  assertEquals "must always return 0" "0" "$?"
}

# --- refusing a directory that cannot be the rule set (whole-branch review #1b) ---
#
# The documented `CC_SEMGREP_RULES_DIR` value used to be a `github-actions`
# *checkout root* — a real, existing, non-empty directory full of YAML (CI
# workflows, etc.) that contains not one `cc-*.yaml` rule. Handed to semgrep as
# `--config`, that produced zero results and a non-zero exit that
# `run_semgrep_scan`'s `|| true` swallowed: a wrong directory rendered
# identically to "clean". A directory without `cc-*.yaml` must resolve to
# nothing so callers fall back to skipping the scan, on both branches that can
# short-circuit the fetch.

test_env_override_without_cc_rules_falls_through_to_fetch() {
  local bogus got
  bogus="$(mktemp -d)"
  printf 'name: ci\n' > "${bogus}/workflow.yaml"
  got="$(CC_SEMGREP_RULES_DIR="${bogus}" PATH="${BIN}:${PATH}" resolve)"
  assertTrue "a dir with no cc-*.yaml must not be returned verbatim" \
    "[ '${got}' != '${bogus}' ]"
  assertTrue "must have fetched instead of trusting the bogus override" \
    "[ -f '${CURL_LOG}' ]"
  rm -rf "${bogus}"
}

test_warm_cache_without_cc_rules_is_treated_as_absent() {
  # Simulates a cache directory that exists and is non-empty but was never
  # populated by this function (e.g. left over from something else) — the old
  # `ls -A` check would have trusted it.
  mkdir -p "${FAKE_TMP}/cc-semgrep-rules-v1"
  printf 'not a rule\n' > "${FAKE_TMP}/cc-semgrep-rules-v1/README.md"
  local got
  got="$(PATH="${BIN}:${PATH}" resolve)"
  assertTrue "must have fetched rather than trusting the bad cache" \
    "[ -f '${CURL_LOG}' ]"
  assertTrue "the fetch must replace the bad cache with real rules" \
    "[ -f '${got}/cc-read-string.yaml' ]"
}

# --- atomic cache population (whole-branch review #7, escalated from MINOR) ---
#
# Cache population used to `mkdir -p` the real cache path and `cp` into it
# directly, so an interrupted or concurrent cold fetch left a permanently
# partial rule set — a warm cache with one rule cached forever after,
# indistinguishable from a healthy one. Populate a temp sibling and `mv` it
# into place, so a reader only ever sees the cache absent or complete.

test_cache_population_leaves_no_temporary_staging_dir_behind() {
  PATH="${BIN}:${PATH}" resolve >/dev/null
  local leftover
  leftover="$(find "${FAKE_TMP}" -maxdepth 1 -name '.cc-semgrep-rules-tmp-*' 2>/dev/null)"
  assertEquals "the temp staging dir must be renamed away, not left behind" \
    "" "${leftover}"
}

test_cache_population_yields_the_complete_rule_set_not_a_partial_one() {
  PATH="${BIN}:${PATH}" resolve >/dev/null
  assertTrue "cc-read-string.yaml must be present" \
    "[ -f '${FAKE_TMP}/cc-semgrep-rules-v1/cc-read-string.yaml' ]"
  assertTrue "cc-weak-crypto.yaml must also be present — a partial cache is the bug" \
    "[ -f '${FAKE_TMP}/cc-semgrep-rules-v1/cc-weak-crypto.yaml' ]"
}

. "${SCRIPT_DIR}/../lib/shunit2"
