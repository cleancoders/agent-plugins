#!/usr/bin/env bash
# Tests the clojure-security plugin's clj-kondo.edn baseline against real
# clj-kondo. Speclj's `around` takes a body fn and invokes it via the bound
# symbol (`(around [body] (body))`). Without a `:lint-as ... clojure.core/fn`
# entry, clj-kondo cannot see `body` as a binding and false-flags the call site
# as an unresolved symbol. The baseline must treat `around` like `fn`.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_DIR="${SCRIPT_DIR}/../plugins/clojure-security"
BASELINE="${PLUGIN_DIR}/clj-kondo.edn"
HOOK="${PLUGIN_DIR}/clj-kondo.hooks/speclj_with.clj"

setUp() {
  TMP="$(mktemp -d)"
  mkdir -p "${TMP}/.clj-kondo/hooks"
  cp "${BASELINE}" "${TMP}/.clj-kondo/config.edn"
  # The baseline's :hooks config references hooks.speclj-with — copy the hook
  # file in just as the setup-clj-kondo skill does, or clj-kondo cannot load it.
  cp "${HOOK}" "${TMP}/.clj-kondo/hooks/speclj_with.clj"

  cat > "${TMP}/foo_spec.clj" <<'EOF'
(ns foo-spec
  (:require [speclj.core :refer [describe it should= around]]))

(describe "x"
  (around [body] (body))
  (it "works" (should= 1 1)))
EOF

  cat > "${TMP}/with_spec.clj" <<'EOF'
(ns with-spec
  (:require [speclj.core :refer [describe it should= with with! with-all with-all!]]))

(describe "with bindings"
  (with foo {:a 1})
  (with! bar (atom 0))
  (with-all baz [1 2 3])
  (with-all! qux "hello")
  (it "derefs them"
    (should= 1 (:a @foo))
    (should= 0 @bar)
    (should= 3 (count @baz))
    (should= "hello" @qux)))
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

# Speclj with/with!/with-all/with-all! declare deref-able symbols (`@name`).
# The baseline's :hooks rewrites them to `(def sym (atom (do body...)))` so the
# deref type-checks. Mapping them to clojure.core/def (the old approach) made
# `@name` a deref of a non-derefable, which under the escalated :type-mismatch
# :error flagged every deref. This test guards against that regression.
test_with_bindings_deref_without_type_mismatch() {
  if ! command -v clj-kondo >/dev/null 2>&1; then
    startSkipping
    return
  fi
  output="$( cd "${TMP}" && clj-kondo --lint with_spec.clj 2>&1 )"
  assertNotContains "@with-binding must not be flagged as a deref type-mismatch" \
    "${output}" "Expected: deref"
  assertNotContains "the with hook must load (config references hooks.speclj-with)" \
    "${output}" "not found while loading hook"
  assertContains "the spec must lint clean (0 errors, 0 warnings)" \
    "${output}" "errors: 0, warnings: 0"
}

. "${SCRIPT_DIR}/../lib/shunit2"
