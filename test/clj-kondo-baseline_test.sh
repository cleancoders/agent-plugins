#!/usr/bin/env bash
# Tests the clojure-security plugin's clj-kondo.edn baseline against real
# clj-kondo. Speclj's `around` takes a body fn and invokes it via the bound
# symbol (`(around [body] (body))`). Without a `:lint-as ... clojure.core/fn`
# entry, clj-kondo cannot see `body` as a binding and false-flags the call site
# as an unresolved symbol. The baseline must treat `around` like `fn`.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BASELINE="${SCRIPT_DIR}/../plugins/clojure-security/clj-kondo.edn"

setUp() {
  TMP="$(mktemp -d)"
  mkdir -p "${TMP}/.clj-kondo"
  cp "${BASELINE}" "${TMP}/.clj-kondo/config.edn"

  cat > "${TMP}/foo_spec.clj" <<'EOF'
(ns foo-spec
  (:require [speclj.core :refer [describe it should= around]]))

(describe "x"
  (around [body] (body))
  (it "works" (should= 1 1)))
EOF
}

tearDown() {
  [ -n "${TMP}" ] && rm -rf "${TMP}"
}

test_around_body_resolves_under_baseline() {
  if ! command -v clj-kondo >/dev/null 2>&1; then
    startSkipping
    return
  fi
  output="$( cd "${TMP}" && clj-kondo --lint foo_spec.clj 2>&1 )"
  assertNotContains "around's body binding must resolve under the baseline" \
    "${output}" "Unresolved symbol: body"
}

. "${SCRIPT_DIR}/../lib/shunit2"
