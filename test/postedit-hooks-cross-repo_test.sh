#!/usr/bin/env bash
# Tests that the clj-kondo and cljfmt PostToolUse hooks run their tool from the
# EDITED FILE's repo root, not the hook's current working directory. Without
# this, cross-repo edits (hook cwd is one repo, edited file lives in a sibling
# repo) make clj-kondo / cljfmt discover the wrong .clj-kondo/config.edn,
# cljfmt.edn, and analysis cache — surfacing false-positive findings and
# applying the wrong formatting.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
KONDO_HOOK="${SCRIPT_DIR}/../plugins/clojure-security/hooks/clj-kondo-postedit.sh"
CLJFMT_HOOK="${SCRIPT_DIR}/../plugins/clojure/hooks/cljfmt-postedit.sh"

setUp() {
  TMP="$(mktemp -d)"

  # The hook will be invoked from here — a directory unrelated to the edited
  # file (simulates working in repo A while editing a file in sibling repo B).
  SESSION_CWD="${TMP}/session"
  mkdir -p "${SESSION_CWD}"

  # The edited file lives in its own git repo.
  TARGET_REPO="${TMP}/target-repo"
  mkdir -p "${TARGET_REPO}/src"
  ( cd "${TARGET_REPO}" \
      && git init -q \
      && git config user.email t@example.com \
      && git config user.name test )
  TARGET_FILE="${TARGET_REPO}/src/foo.clj"
  printf '(ns foo)\n' > "${TARGET_FILE}"

  # Canonical (symlink-resolved) repo root, as git reports it — what the hook
  # should cd into.
  EXPECTED_ROOT="$(git -C "${TARGET_REPO}" rev-parse --show-toplevel)"

  # Stub clj-kondo and cljfmt onto PATH; each records the cwd it ran in.
  STUB_BIN="${TMP}/bin"
  mkdir -p "${STUB_BIN}"
  CWD_LOG="${TMP}/cwd.log"

  cat > "${STUB_BIN}/clj-kondo" <<EOF
#!/usr/bin/env bash
pwd > "${CWD_LOG}"
echo '{"findings":[]}'
EOF

  cat > "${STUB_BIN}/cljfmt" <<EOF
#!/usr/bin/env bash
pwd > "${CWD_LOG}"
exit 0
EOF

  chmod +x "${STUB_BIN}/clj-kondo" "${STUB_BIN}/cljfmt"
}

tearDown() {
  [ -n "${TMP}" ] && rm -rf "${TMP}"
}

run_hook() {
  # $1 = hook path. Invokes the hook from SESSION_CWD with the target file,
  # the stubs ahead on PATH.
  ( cd "${SESSION_CWD}" \
      && PATH="${STUB_BIN}:${PATH}" bash "$1" >/dev/null 2>&1 \
      <<< "$(printf '{"tool_input":{"file_path":"%s"}}' "${TARGET_FILE}")" )
}

test_clj_kondo_runs_from_edited_files_repo_root() {
  run_hook "${KONDO_HOOK}"
  assertEquals "clj-kondo should run from the edited file's repo root" \
    "${EXPECTED_ROOT}" "$(cat "${CWD_LOG}" 2>/dev/null)"
}

test_cljfmt_runs_from_edited_files_repo_root() {
  run_hook "${CLJFMT_HOOK}"
  assertEquals "cljfmt should run from the edited file's repo root" \
    "${EXPECTED_ROOT}" "$(cat "${CWD_LOG}" 2>/dev/null)"
}

. "${SCRIPT_DIR}/../lib/shunit2"
