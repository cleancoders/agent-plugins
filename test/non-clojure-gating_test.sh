#!/usr/bin/env bash
# Tests that the clojure-security cwd-scoped hooks do NOT fire in a
# non-Clojure git repo.
#
# Regression: the SessionStart marker hook wrote .claude/.security-session-start-sha
# (and edited .gitignore) in any git repo, including non-Clojure projects. The
# Stop and commit-backstop hooks likewise ran their scanners (gitleaks /
# clj-holmes) on every git repo. None of this is meaningful outside a Clojure
# project — the whole plugin is scoped to Clojure — so all three must no-op when
# the repo has no Clojure project marker (deps.edn / project.clj / etc.).
#
# Requires jq + git. Stubs clj-holmes + gitleaks on PATH to detect invocation.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MARKER_HOOK="${SCRIPT_DIR}/../plugins/clojure-security/hooks/session-start-marker.sh"
STOP_HOOK="${SCRIPT_DIR}/../plugins/clojure-security/hooks/security-stop.sh"
COMMIT_HOOK="${SCRIPT_DIR}/../plugins/clojure-security/hooks/commit-backstop.sh"

oneTimeSetUp() {
  if ! command -v jq >/dev/null 2>&1 || ! command -v git >/dev/null 2>&1; then
    echo "jq or git not installed — skipping non-clojure gating tests"
    startSkipping
  fi
}

setUp() {
  PROJECT="$(mktemp -d)"
  BIN="$(mktemp -d)"
  RULES="$(mktemp -d)"
  CALLED="${BIN}/scanner-called.txt"

  # Stubs record that they ran. If a hook short-circuits on the
  # is_clojure_project gate, neither stub should ever be touched.
  for tool in clj-holmes gitleaks; do
    cat > "${BIN}/${tool}" <<EOF
#!/usr/bin/env bash
printf '%s %s\n' "$tool" "\$*" >> "${CALLED}"
exit 0
EOF
    chmod +x "${BIN}/${tool}"
  done
  printf 'rule' > "${RULES}/rule.yml"   # non-empty so the holmes branch isn't skipped for that reason

  # A real git repo, but NOT a Clojure project (no deps.edn/project.clj/etc).
  git -C "${PROJECT}" init -q
  git -C "${PROJECT}" config user.email t@t.t
  git -C "${PROJECT}" config user.name t
  printf 'print("hi")\n' > "${PROJECT}/app.py"
  git -C "${PROJECT}" add -A
  git -C "${PROJECT}" commit -qm init >/dev/null 2>&1
  # uncommitted change so there is a non-empty diff scope to (not) scan
  printf 'print("bye")\n' > "${PROJECT}/app.py"
}

tearDown() {
  rm -rf "${PROJECT}" "${BIN}" "${RULES}"
}

scanner_was_called() {
  [ -f "${CALLED}" ]
}

test_marker_hook_silent_in_non_clojure_repo() {
  printf '{"cwd":"%s"}' "${PROJECT}" | bash "${MARKER_HOOK}" >/dev/null 2>&1
  assertFalse "no marker file in non-Clojure repo" \
    "[ -f '${PROJECT}/.claude/.security-session-start-sha' ]"
  assertFalse "no .gitignore created in non-Clojure repo" \
    "[ -f '${PROJECT}/.gitignore' ]"
}

test_stop_hook_does_not_scan_non_clojure_repo() {
  printf '{"cwd":"%s","stop_hook_active":false}' "${PROJECT}" \
    | PATH="${BIN}:${PATH}" CLJ_HOLMES_RULES_DIR="${RULES}" \
      bash "${STOP_HOOK}" >/dev/null 2>&1 || true
  assertFalse "Stop hook must not invoke any scanner in a non-Clojure repo" scanner_was_called
}

test_commit_hook_does_not_scan_non_clojure_repo() {
  printf 'print("x")\n' > "${PROJECT}/more.py"
  git -C "${PROJECT}" add more.py
  printf '{"tool_name":"Bash","tool_input":{"command":"git commit -m x"},"cwd":"%s"}' "${PROJECT}" \
    | PATH="${BIN}:${PATH}" CLJ_HOLMES_RULES_DIR="${RULES}" \
      bash "${COMMIT_HOOK}" >/dev/null 2>&1 || true
  assertFalse "Commit backstop must not invoke any scanner in a non-Clojure repo" scanner_was_called
}

. "${SCRIPT_DIR}/../lib/shunit2"
