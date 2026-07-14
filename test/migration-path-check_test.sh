#!/usr/bin/env bash
# Tests the migration-path-check PostToolUse hook. It must flag (exit 2 with
# feedback) the three ways migration files get placed/named wrong per the
# writing-migrations skill, and stay silent (exit 0) otherwise:
#   1. a Speclj spec under a `migrations/` dir (ns lands under :migration-ns,
#      so the migrator treats the spec as a migration) -> must live in a
#      sibling `migration_specs/` dir instead;
#   2. a migration SOURCE file (YYYYMMDD*.clj) that requires a test-only ns
#      (speclj / beatles) -> src is on the prod classpath;
#   3. two same-date migrations without a/b letter suffixes -> undefined order.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOK="${SCRIPT_DIR}/../plugins/clojure/hooks/migration-path-check.sh"

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

test_flags_spec_under_migrations_dir() {
  mkdir -p "${TMP}/src/clj/proj/migrations"
  local f="${TMP}/src/clj/proj/migrations/20260713_foo_spec.clj"
  printf '(ns proj.migrations.20260713-foo-spec)\n' > "${f}"
  run_hook_on "${f}"
  assertEquals "spec under migrations/ must exit 2" 2 "${EXIT_CODE}"
  assertContains "feedback should name migration_specs" "${STDERR_OUT}" "migration_specs"
}

test_allows_spec_under_migration_specs_dir() {
  mkdir -p "${TMP}/spec/clj/proj/migration_specs"
  local f="${TMP}/spec/clj/proj/migration_specs/20260713_foo_spec.clj"
  printf '(ns proj.migration-specs.20260713-foo-spec)\n' > "${f}"
  run_hook_on "${f}"
  assertEquals "spec in migration_specs/ should pass" 0 "${EXIT_CODE}"
}

test_flags_migration_source_requiring_speclj() {
  mkdir -p "${TMP}/src/clj/proj/migrations"
  local f="${TMP}/src/clj/proj/migrations/20260713_foo.clj"
  printf '(ns proj.migrations.20260713-foo\n  (:require [speclj.core :refer :all]))\n' > "${f}"
  run_hook_on "${f}"
  assertEquals "migration source with speclj require must exit 2" 2 "${EXIT_CODE}"
  assertContains "feedback should mention production classpath" "${STDERR_OUT}" "classpath"
}

test_flags_same_date_without_letter_suffix() {
  mkdir -p "${TMP}/src/clj/proj/migrations"
  printf '(ns proj.migrations.20260713-aaa)\n' > "${TMP}/src/clj/proj/migrations/20260713_aaa.clj"
  local f="${TMP}/src/clj/proj/migrations/20260713_bbb.clj"
  printf '(ns proj.migrations.20260713-bbb)\n' > "${f}"
  run_hook_on "${f}"
  assertEquals "same-date unsuffixed sibling must exit 2" 2 "${EXIT_CODE}"
  assertContains "feedback should mention suffix ordering" "${STDERR_OUT}" "suffix"
}

test_allows_same_date_with_letter_suffix() {
  mkdir -p "${TMP}/src/clj/proj/migrations"
  printf '(ns proj.migrations.20260713a-aaa)\n' > "${TMP}/src/clj/proj/migrations/20260713a_aaa.clj"
  local f="${TMP}/src/clj/proj/migrations/20260713b_bbb.clj"
  printf '(ns proj.migrations.20260713b-bbb)\n' > "${f}"
  run_hook_on "${f}"
  assertEquals "a/b-suffixed same-date siblings should pass" 0 "${EXIT_CODE}"
}

test_allows_clean_migration_source() {
  mkdir -p "${TMP}/src/clj/proj/migrations"
  local f="${TMP}/src/clj/proj/migrations/20260713_only.clj"
  printf '(ns proj.migrations.20260713-only\n  (:require [c3kit.bucket.migrator :as m]))\n' > "${f}"
  run_hook_on "${f}"
  assertEquals "clean lone migration should pass" 0 "${EXIT_CODE}"
}

test_ignores_non_clojure_migration_file() {
  # A non-Clojure migration (e.g. .sql) under a migrations/ dir, even with a
  # same-date .clj sibling, must be ignored — the hook is Clojure-scoped.
  mkdir -p "${TMP}/db/migrations"
  printf '(ns proj.migrations.20260713a-x)\n' > "${TMP}/db/migrations/20260713a_x.clj"
  local f="${TMP}/db/migrations/20260713_foo.sql"
  printf 'SELECT 1;\n' > "${f}"
  run_hook_on "${f}"
  assertEquals "non-clojure migration file must be ignored" 0 "${EXIT_CODE}"
}

test_ignores_non_migration_file() {
  mkdir -p "${TMP}/src/clj/proj/security"
  local f="${TMP}/src/clj/proj/security/handlers.clj"
  printf '(ns proj.security.handlers)\n' > "${f}"
  run_hook_on "${f}"
  assertEquals "non-migration file should be ignored" 0 "${EXIT_CODE}"
}

test_no_file_path_is_noop() {
  bash "${HOOK}" >/dev/null 2>&1 <<< '{"tool_input":{}}'
  assertEquals "missing file path should be a silent no-op" 0 "$?"
}

. "${SCRIPT_DIR}/../lib/shunit2"
