#!/usr/bin/env bash
# Tests for plugins/clojure-security/hooks/security-stop.sh — clj-holmes call.
#
# Pins that the Stop hook passes --no-verbose to clj-holmes. Without it,
# clj-holmes draws a progrock progress bar whose ETA interval overflows a
# 32-bit int on long scans and kills the process before findings print:
#   "Value out of range for int: 3625530203"
#   (progrock.core/interval-str). The scan then errors silently — a dead SAST
# gate. --no-verbose disables the progress feedback and the crash with it.
#
# Requires jq + git. Stubs clj-holmes on PATH to record its args.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOK="${SCRIPT_DIR}/../plugins/clojure-security/hooks/security-stop.sh"

oneTimeSetUp() {
  if ! command -v jq >/dev/null 2>&1 || ! command -v git >/dev/null 2>&1; then
    echo "jq or git not installed — skipping security-stop holmes tests"
    startSkipping
  fi
}

setUp() {
  PROJECT="$(mktemp -d)"
  BIN="$(mktemp -d)"
  RULES="$(mktemp -d)"            # non-empty rules dir so the holmes branch runs
  ARGS_LOG="${BIN}/holmes-args.txt"

  # Stub clj-holmes: record args, then write an empty findings array to the
  # path that follows -o so the hook's jq parse stays happy.
  cat > "${BIN}/clj-holmes" <<EOF
#!/usr/bin/env bash
printf '%s\n' "\$*" > "${ARGS_LOG}"
prev=""
for a in "\$@"; do
  [ "\$prev" = "-o" ] && printf '[]' > "\$a"
  prev="\$a"
done
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
  # uncommitted change -> non-empty diff scope (uncommitted-only fallback)
  printf '(ns foo)\n(def x 1)\n' > "${PROJECT}/foo.clj"
}

tearDown() {
  rm -rf "${PROJECT}" "${BIN}" "${RULES}"
}

run_hook() {
  printf '{"cwd":"%s","stop_hook_active":false}' "${PROJECT}" \
    | PATH="${BIN}:${PATH}" CLJ_HOLMES_RULES_DIR="${RULES}" \
      bash "${HOOK}" >/dev/null 2>&1 || true
}

test_holmes_invoked_with_no_verbose() {
  run_hook
  assertTrue "clj-holmes should have been invoked" "[ -f '${ARGS_LOG}' ]"
  local args
  args="$(cat "${ARGS_LOG}" 2>/dev/null)"
  assertContains "Stop hook must pass --no-verbose to clj-holmes" "${args}" "--no-verbose"
}

. "${SCRIPT_DIR}/../lib/shunit2"
