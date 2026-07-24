#!/usr/bin/env bash
# Tests the defmacro-indent-check PostToolUse hook. When an Edit/Write adds a
# variadic `defmacro` (a body-macro: params contain `&`) whose UNqualified name
# is not yet a key in the repo's cljfmt.edn :extra-indents, cljfmt (cursive)
# will deep-indent its call-site bodies. The hook exit-2s with a notice telling
# Claude to add a `name [[:block N]]` rule (N = fixed params before `& body`).
# It stays silent (exit 0) for registered macros, non-variadic defmacros,
# defn/fn, non-Clojure files, repos with no cljfmt.edn, and missing paths.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOK="${SCRIPT_DIR}/../plugins/clojure/hooks/defmacro-indent-check.sh"

setUp() {
  TMP="$(mktemp -d)"
}

tearDown() {
  [ -n "${TMP}" ] && rm -rf "${TMP}"
}

run_hook_on() {
  local target="$1"
  STDERR_OUT="$(bash "${HOOK}" 2>&1 >/dev/null <<< "$(printf '{"tool_input":{"file_path":"%s"}}' "${target}")")"
  EXIT_CODE=$?
}

# a minimal cljfmt.edn with the given extra-indents body (may be empty)
write_cljfmt() {
  printf '{:extra-indents\n {describe [[:block 1]]\n%s}}\n' "$1" > "${TMP}/cljfmt.edn"
}

test_flags_unregistered_body_macro() {
  write_cljfmt ""
  mkdir -p "${TMP}/src/proj"
  local f="${TMP}/src/proj/core.clj"
  printf '(ns proj.core)\n(defmacro guard [request & body]\n  `(do ~@body))\n' > "${f}"
  run_hook_on "${f}"
  assertEquals "unregistered body-macro must exit 2" 2 "${EXIT_CODE}"
  assertContains "feedback names the macro" "${STDERR_OUT}" "guard"
  assertContains "feedback mentions :block" "${STDERR_OUT}" ":block"
}

test_suggests_block_n_from_arglist() {
  write_cljfmt ""
  mkdir -p "${TMP}/src/proj"
  local f="${TMP}/src/proj/auth.clj"
  printf '(ns proj.auth)\n(defmacro ensure [request args & body]\n  `(do ~@body))\n' > "${f}"
  run_hook_on "${f}"
  assertEquals "must exit 2" 2 "${EXIT_CODE}"
  assertContains "suggests block 2 (request + args before &)" "${STDERR_OUT}" "[:block 2]"
}

test_allows_registered_body_macro() {
  write_cljfmt "  guard [[:block 1]]\n"
  mkdir -p "${TMP}/src/proj"
  local f="${TMP}/src/proj/core.clj"
  printf '(ns proj.core)\n(defmacro guard [request & body]\n  `(do ~@body))\n' > "${f}"
  run_hook_on "${f}"
  assertEquals "registered body-macro should pass" 0 "${EXIT_CODE}"
}

test_ignores_non_variadic_defmacro() {
  write_cljfmt ""
  mkdir -p "${TMP}/src/proj"
  local f="${TMP}/src/proj/core.clj"
  printf '(ns proj.core)\n(defmacro fixed [a b]\n  `(+ ~a ~b))\n' > "${f}"
  run_hook_on "${f}"
  assertEquals "non-variadic defmacro is not a body-macro" 0 "${EXIT_CODE}"
}

test_ignores_variadic_defn() {
  write_cljfmt ""
  mkdir -p "${TMP}/src/proj"
  local f="${TMP}/src/proj/core.clj"
  printf '(ns proj.core)\n(defn variadic-fn [a & more]\n  more)\n' > "${f}"
  run_hook_on "${f}"
  assertEquals "defn (not defmacro) must be ignored" 0 "${EXIT_CODE}"
}

test_ignores_non_clojure_file() {
  write_cljfmt ""
  mkdir -p "${TMP}/src/proj"
  local f="${TMP}/src/proj/notes.txt"
  printf '(defmacro guard [request & body] body)\n' > "${f}"
  run_hook_on "${f}"
  assertEquals "non-clojure file must be ignored" 0 "${EXIT_CODE}"
}

test_noop_without_cljfmt_edn() {
  # no cljfmt.edn anywhere in the tree -> nothing to register into -> no-op
  mkdir -p "${TMP}/src/proj"
  local f="${TMP}/src/proj/core.clj"
  printf '(ns proj.core)\n(defmacro guard [request & body] body)\n' > "${f}"
  run_hook_on "${f}"
  assertEquals "no cljfmt.edn -> silent no-op" 0 "${EXIT_CODE}"
}

test_no_file_path_is_noop() {
  bash "${HOOK}" >/dev/null 2>&1 <<< '{"tool_input":{}}'
  assertEquals "missing file path should be a silent no-op" 0 "$?"
}

. "${SCRIPT_DIR}/../lib/shunit2"
