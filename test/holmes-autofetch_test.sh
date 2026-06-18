#!/usr/bin/env bash
# Tests for clj-holmes rule auto-fetch in the clojure-security hooks.
#
# clj-holmes ships with NO rules; the SAST scan is a silent no-op until the
# rule set is cloned into the rules dir. Rather than skip the scan when the
# dir is missing/empty, the Stop and commit-backstop hooks now run
# `clj-holmes fetch-rules -o <dir>` first, so the session is actually scanned.
#
# Requires jq + git. Stubs clj-holmes on PATH to record subcommands and to
# populate the rules dir on `fetch-rules`.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STOP_HOOK="${SCRIPT_DIR}/../plugins/clojure-security/hooks/security-stop.sh"
COMMIT_HOOK="${SCRIPT_DIR}/../plugins/clojure-security/hooks/commit-backstop.sh"

oneTimeSetUp() {
  if ! command -v jq >/dev/null 2>&1 || ! command -v git >/dev/null 2>&1; then
    echo "jq or git not installed — skipping holmes auto-fetch tests"
    startSkipping
  fi
}

setUp() {
  PROJECT="$(mktemp -d)"
  BIN="$(mktemp -d)"
  RULES_PARENT="$(mktemp -d)"
  RULES="${RULES_PARENT}/clj-holmes-rules"   # does NOT exist yet
  ARGS_LOG="${BIN}/holmes-subcommands.txt"

  # Stub clj-holmes:
  #   fetch-rules -o DIR  -> create DIR with a rule file (simulates the clone)
  #   scan ... -o OUT     -> write an empty findings array to OUT
  cat > "${BIN}/clj-holmes" <<EOF
#!/usr/bin/env bash
sub="\$1"; shift
printf '%s %s\n' "\$sub" "\$*" >> "${ARGS_LOG}"
prev=""
if [ "\$sub" = "fetch-rules" ]; then
  out=""
  for a in "\$@"; do
    [ "\$prev" = "-o" ] && out="\$a"
    prev="\$a"
  done
  if [ -n "\$out" ]; then
    mkdir -p "\$out"
    printf 'rule' > "\${out}/rule.yml"
  fi
  exit 0
fi
if [ "\$sub" = "scan" ]; then
  for a in "\$@"; do
    [ "\$prev" = "-o" ] && printf '[]' > "\$a"
    prev="\$a"
  done
  exit 0
fi
exit 0
EOF
  chmod +x "${BIN}/clj-holmes"

  git -C "${PROJECT}" init -q
  git -C "${PROJECT}" config user.email t@t.t
  git -C "${PROJECT}" config user.name t
  printf '{:deps {}}' > "${PROJECT}/deps.edn"   # mark as a Clojure project
  printf '(ns foo)' > "${PROJECT}/foo.clj"
  git -C "${PROJECT}" add -A
  git -C "${PROJECT}" commit -qm init >/dev/null 2>&1
}

tearDown() {
  rm -rf "${PROJECT}" "${BIN}" "${RULES_PARENT}"
}

# --- security-stop.sh -------------------------------------------------------

run_stop_hook() {
  printf '{"cwd":"%s","stop_hook_active":false}' "${PROJECT}" \
    | PATH="${BIN}:${PATH}" CLJ_HOLMES_RULES_DIR="${RULES}" \
      bash "${STOP_HOOK}" >/dev/null 2>&1 || true
}

test_stop_fetches_rules_when_dir_missing() {
  # uncommitted change -> non-empty diff scope
  printf '(ns foo)\n(def x 1)\n' > "${PROJECT}/foo.clj"
  run_stop_hook
  local log; log="$(cat "${ARGS_LOG}" 2>/dev/null)"
  assertContains "Stop hook must fetch rules when the dir is missing" "${log}" "fetch-rules"
  assertContains "Stop hook must still scan after fetching" "${log}" "scan"
  assertTrue "rules dir should now exist" "[ -d '${RULES}' ]"
}

test_stop_fetches_rules_when_dir_empty() {
  mkdir -p "${RULES}"   # exists but empty
  printf '(ns foo)\n(def x 1)\n' > "${PROJECT}/foo.clj"
  run_stop_hook
  local log; log="$(cat "${ARGS_LOG}" 2>/dev/null)"
  assertContains "Stop hook must fetch rules when the dir is empty" "${log}" "fetch-rules"
}

test_stop_skips_fetch_when_rules_present() {
  mkdir -p "${RULES}"
  printf 'rule' > "${RULES}/existing.yml"
  printf '(ns foo)\n(def x 1)\n' > "${PROJECT}/foo.clj"
  run_stop_hook
  local log; log="$(cat "${ARGS_LOG}" 2>/dev/null)"
  assertNotContains "Stop hook must NOT re-fetch when rules already present" "${log}" "fetch-rules"
  assertContains "Stop hook must scan with existing rules" "${log}" "scan"
}

# --- commit-backstop.sh -----------------------------------------------------

run_commit_hook() {
  printf '{"tool_name":"Bash","tool_input":{"command":"git commit -m x"},"cwd":"%s"}' "${PROJECT}" \
    | PATH="${BIN}:${PATH}" CLJ_HOLMES_RULES_DIR="${RULES}" \
      bash "${COMMIT_HOOK}" >/dev/null 2>&1 || true
}

test_commit_fetches_rules_when_dir_missing() {
  printf '(ns foo)\n(def x 1)\n' > "${PROJECT}/bar.clj"
  git -C "${PROJECT}" add bar.clj
  run_commit_hook
  local log; log="$(cat "${ARGS_LOG}" 2>/dev/null)"
  assertContains "Commit backstop must fetch rules when the dir is missing" "${log}" "fetch-rules"
  assertContains "Commit backstop must still scan after fetching" "${log}" "scan"
}

. "${SCRIPT_DIR}/../lib/shunit2"
