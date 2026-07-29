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

. "${SCRIPT_DIR}/../lib/shunit2"
