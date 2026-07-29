# clojure-security 0.12.0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace clj-holmes with the 16 `cc-*` semgrep rules in all three clojure-security hooks, and add an LLM review of each turn's Clojure edits covering the 13 vulnerability classes no scanner can reach.

**Architecture:** A shared bash lib resolves the `cc-*` rules (env override → `/tmp` cache → `curl` a pinned tag) so local hooks and CI enforce the same rule set. Severity mirrors CI: `ERROR` blocks, `WARNING` reports. Separately, a new `PostToolUse` hook records each turn's edited Clojure files to `.claude/.security-turn-files`; the `Stop` hook drains that ledger and, once per turn, blocks with a review directive scoped to exactly those files — which is why no content-hash cache is needed.

**Tech Stack:** bash (must run on macOS bash 3.2), `jq`, `semgrep` ≥ 1.157.0, `curl`, `tar`, shunit2 at `lib/shunit2`.

**Spec:** `docs/superpowers/specs/2026-07-29-clojure-security-semgrep-alignment-design.md`

## Global Constraints

- **TDD, no exceptions.** Run the existing suite before touching anything. Write the failing test, watch it fail, then implement.
- **Run the whole suite** with `for t in test/*_test.sh; do bash "$t" || echo "FAIL $t"; done` from the repo root.
- **bash 3.2 compatible.** No `mapfile`, no associative arrays, no `${var,,}`. Use `while IFS= read -r` to build lists.
- **`cond && assignment` under `set -e` — know the exact rule.** Verified empirically, not assumed. A failing `[ -n "$x" ] && y=1` as a **standalone statement** is safe: `set -e` exempts a command that is not the last in an AND-OR list. It is **fatal as the last statement of a function body or sourced file**, because the function then returns 1 and the *call site* is a plain failing command. So:
  - `command -v semgrep >/dev/null 2>&1 && HAVE_SEMGREP=1` mid-script — **fine**, and the existing hook already does this.
  - Any function that could end on a failing test — **must** end with an explicit `return 0`.
  - Where the assignment's result is needed later, prefer an `if` block for legibility regardless.

  This is what bit `cleancoders/github-actions` (`.github/workflows/security.yml:365`): the statement was last in a `run:` block, so its status became the step's.
- **No test may touch the network.** Stub `curl` earlier on `PATH`, or set `CC_SEMGREP_RULES_DIR` to a fixture directory.
- **Do not delete test coverage.** Where a behaviour goes away, its test asserts the replacement.
- **Do not rename or renumber vulnerability classes.** The CI rules key on `metadata.class`; a rename silently breaks the join.
- **Do not add new vulnerability classes.** The index is complete for the current rule set. CWE-20 and CWE-476 are recorded as gaps, not filled.
- **Do not describe `cc-path-traversal`, `cc-generic-catch`, or `cc-clojure-xml-xxe` as blocking.** They are WARNING in CI on purpose.
- **Do not edit** `package.json`, `plugin.json`, `marketplace.json`, or `index.ts` version fields — CI syncs them.
- **`docs/` is gitignored**; commit anything under it with `git add -f`.
- The seven pinned CWE→OWASP mappings in `test/skill-taxonomy-ids_test.sh` are verified against owasp.org and six contradict the obvious guess. **Do not "correct" them.**

## File Structure

**Create:**
- `plugins/clojure-security/hooks/lib/semgrep-rules.sh` — rule-set resolution, one function
- `plugins/clojure-security/hooks/turn-ledger.sh` — PostToolUse; records the turn's Clojure edits
- `plugins/clojure-security/skills/clojure-security/references/taxonomy-coverage.md` — CWE Top 25 / OWASP reverse index
- `test/semgrep-rules-fetch_test.sh` — replaces `holmes-autofetch_test.sh`
- `test/security-stop-semgrep_test.sh` — replaces `security-stop-holmes_test.sh`
- `test/turn-ledger_test.sh`
- `test/security-stop-review_test.sh`
- `test/taxonomy-coverage_test.sh` — the reverse index only
- `test/security-audit-alignment_test.sh` — the audit command's prose
- `test/no-clj-holmes_test.sh` — the plugin-wide invariant

**Modify:**
- `plugins/clojure-security/hooks/security-stop.sh` — semgrep block, review block, exit decision
- `plugins/clojure-security/hooks/commit-backstop.sh` — semgrep block
- `plugins/clojure-security/hooks/session-start-marker.sh:100-113` — tool check
- `plugins/clojure-security/hooks/session-end-cleanup.sh:20-21` — also remove the ledger
- `plugins/clojure-security/hooks/hooks.json` — add `turn-ledger.sh` to the PostToolUse matcher
- `plugins/clojure-security/skills/clojure-security/SKILL.md` — `route` column, tool table, description
- `plugins/clojure-security/skills/clojure-security/references/config-and-ops.md:179,225`
- `plugins/clojure-security/commands/security-audit.md` — Step 5 table, Coverage section
- `plugins/clojure-security/README.md:6,27,37,42,52,55`
- `plugins/clojure-security/VERSION`, `plugins/clojure-security/CHANGES`
- `test/non-clojure-gating_test.sh`, `test/session-start-marker_test.sh`, `test/skill-index-consistency_test.sh`, `test/skill-taxonomy-ids_test.sh`

**Delete:** `test/holmes-autofetch_test.sh`, `test/security-stop-holmes_test.sh` — both replaced by same-shape files above. Their coverage is asserted in the replacements; delete only after the replacement is green.

**Note:** the handoff brief lists `session-start-toolcheck_test.sh` as needing changes. It does not — that file targets `plugins/clojure/`, a different plugin. The clojure-security equivalent is `session-start-marker_test.sh`.

---

### Task 0: Baseline

- [ ] **Step 1: Confirm the suite is green before any change**

```bash
cd /Users/alex-root-roatch/current-projects/agent-plugins
for t in test/*_test.sh; do bash "$t" >/dev/null 2>&1 || echo "FAIL $t"; done; echo done
```

Expected: `done` with no `FAIL` lines. If anything fails, stop and report — do not build on a red suite.

- [ ] **Step 2: Confirm semgrep runs the rules**

```bash
semgrep --version
ls ~/current-projects/github-actions/security-rules/semgrep/*.yaml | wc -l
```

Expected: `1.157.0` or later, and `16`.

---

### Task 1: Rule-set resolution lib

**Files:**
- Create: `plugins/clojure-security/hooks/lib/semgrep-rules.sh`
- Create: `test/semgrep-rules-fetch_test.sh`
- Delete (Step 7): `test/holmes-autofetch_test.sh`

**Interfaces:**
- Produces: `resolve_semgrep_rules` — takes no arguments, echoes an absolute rules directory on success and **nothing** on failure, always returns 0. Tasks 2 and 3 source this file and treat empty output as "skip the Clojure scan".
- Reads env: `CC_SEMGREP_RULES_DIR` (override), `CC_SEMGREP_RULES_REF` (default `v1`), `CC_SEMGREP_RULES_URL_BASE` (default `https://codeload.github.com/cleancoders/github-actions/tar.gz`). The last two exist so tests can point at a stub without network.

- [ ] **Step 1: Write the failing test**

Create `test/semgrep-rules-fetch_test.sh`:

```bash
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
```

- [ ] **Step 2: Run it to verify it fails**

```bash
bash test/semgrep-rules-fetch_test.sh
```

Expected: every test fails — the lib file does not exist, so `resolve` produces nothing.

- [ ] **Step 3: Write the implementation**

Create `plugins/clojure-security/hooks/lib/semgrep-rules.sh`:

```bash
#!/usr/bin/env bash
# Shared rule-set resolution for the clojure-security scanning hooks.
#
# The 16 cc-* semgrep rules that gate CI live in cleancoders/github-actions,
# not in this plugin, and are consumed there at tag v1. Vendoring a copy here
# would mean two sources of truth for the rule set — exactly the drift the
# generated coverage matrix exists to prevent, and undetectable offline. So the
# hooks resolve the rules at run time and cache the result.
#
# Resolution order, first hit wins:
#   1. $CC_SEMGREP_RULES_DIR — a github-actions checkout; never touches network
#   2. a warm cache at <root>/cc-semgrep-rules-<ref>
#   3. a cold fetch of the pinned tag's tarball into that cache
#
# Echoes the rules directory on success and NOTHING on any failure, always
# returning 0. Callers treat empty output as "skip the Clojure scan" — the same
# posture as a missing tool. A hook must never fail a turn because GitHub was
# unreachable.
#
# The ref is in the cache directory name so a future v2 can never be served
# out of a v1 cache.
#
# Network on a Stop hook is not a new cost: before this, the hooks ran
# `clj-holmes fetch-rules` on a cold cache in exactly the same place.

CC_SEMGREP_RULES_REF="${CC_SEMGREP_RULES_REF:-v1}"
CC_SEMGREP_RULES_URL_BASE="${CC_SEMGREP_RULES_URL_BASE:-https://codeload.github.com/cleancoders/github-actions/tar.gz}"
CC_SEMGREP_RULES_CACHE_ROOT="${CC_SEMGREP_RULES_CACHE_ROOT:-/tmp}"

resolve_semgrep_rules() {
  local cache tmp tarball src

  if [ -n "${CC_SEMGREP_RULES_DIR:-}" ] && [ -d "${CC_SEMGREP_RULES_DIR}" ]; then
    printf '%s' "${CC_SEMGREP_RULES_DIR}"
    return 0
  fi

  cache="${CC_SEMGREP_RULES_CACHE_ROOT}/cc-semgrep-rules-${CC_SEMGREP_RULES_REF}"
  if [ -d "${cache}" ] && [ -n "$(ls -A "${cache}" 2>/dev/null)" ]; then
    printf '%s' "${cache}"
    return 0
  fi

  command -v curl >/dev/null 2>&1 || return 0
  command -v tar  >/dev/null 2>&1 || return 0

  tmp="$(mktemp -d 2>/dev/null)" || return 0
  tarball="${tmp}/rules.tar.gz"

  if ! curl -fsSL --max-time 20 \
       "${CC_SEMGREP_RULES_URL_BASE}/${CC_SEMGREP_RULES_REF}" \
       -o "${tarball}" 2>/dev/null; then
    rm -rf "${tmp}"
    return 0
  fi

  mkdir -p "${tmp}/x"
  if ! tar -xzf "${tarball}" -C "${tmp}/x" 2>/dev/null; then
    rm -rf "${tmp}"
    return 0
  fi

  # Locate the rules dir rather than assuming the tarball's root name.
  # `tar --include` / `--strip-components` filtering is not portable between
  # BSD tar (macOS) and GNU tar, so extract everything and copy what we want.
  src="$(find "${tmp}/x" -type d -path '*/security-rules/semgrep' -print 2>/dev/null | head -1)"
  if [ -z "${src}" ]; then
    rm -rf "${tmp}"
    return 0
  fi

  mkdir -p "${cache}"
  cp "${src}"/*.yaml "${cache}/" 2>/dev/null || true
  rm -rf "${tmp}"

  if [ -z "$(ls -A "${cache}" 2>/dev/null)" ]; then
    rm -rf "${cache}"
    return 0
  fi

  printf '%s' "${cache}"
  return 0
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
bash test/semgrep-rules-fetch_test.sh
```

Expected: `Ran 6 tests.` / `OK`

- [ ] **Step 5: Verify against the real endpoint once, by hand**

The test stubs `curl`, so it never proves the URL or tarball layout is right. Prove it once:

```bash
rm -rf /tmp/cc-semgrep-rules-v1
bash -c '. plugins/clojure-security/hooks/lib/semgrep-rules.sh; resolve_semgrep_rules'; echo
ls /tmp/cc-semgrep-rules-v1 | wc -l
```

Expected: prints `/tmp/cc-semgrep-rules-v1`, and `16`. If the count is not 16, the tarball layout assumption is wrong — fix `src` before continuing.

- [ ] **Step 6: Confirm the rest of the suite is still green**

```bash
for t in test/*_test.sh; do bash "$t" >/dev/null 2>&1 || echo "FAIL $t"; done; echo done
```

Expected: `done`, no `FAIL`.

- [ ] **Step 7: Delete the superseded test and commit**

```bash
git rm -q test/holmes-autofetch_test.sh
git add plugins/clojure-security/hooks/lib/semgrep-rules.sh test/semgrep-rules-fetch_test.sh
git commit -m "feat(clojure-security): resolve cc-* semgrep rules at run time

The 16 rules that gate CI live in cleancoders/github-actions at tag v1.
Resolution order is env override, warm cache, then a fetch of the pinned
tag — so local hooks and CI cannot drift to different rule versions, and
no copy of the rules lives in this plugin.

Every failure degrades to 'skip the Clojure scan' and returns 0: callers
run under set -e, and an unreachable GitHub must not fail a turn.

Replaces holmes-autofetch_test.sh, whose fetch coverage this carries."
```

---

### Task 2: security-stop.sh runs semgrep

**Files:**
- Modify: `plugins/clojure-security/hooks/security-stop.sh` — header comment, tool gate (lines 64-71), the clj-holmes block (lines 141-188), report and exit (lines 226-259)
- Create: `test/security-stop-semgrep_test.sh`
- Delete (Step 6): `test/security-stop-holmes_test.sh`

**Interfaces:**
- Consumes: `resolve_semgrep_rules` from Task 1.
- Produces: exit codes `0` clean / `1` warnings only / `2` errors or secrets. Task 6 adds the review to the same exit decision and depends on the variable names `SEMGREP_ERROR_COUNT`, `SEMGREP_WARN_COUNT`, `SEMGREP_ERRORS`, `SEMGREP_WARNINGS`.

- [ ] **Step 1: Write the failing test**

Create `test/security-stop-semgrep_test.sh`:

```bash
#!/usr/bin/env bash
# Tests for plugins/clojure-security/hooks/security-stop.sh — semgrep call.
#
# CI dropped clj-holmes for 16 cc-* semgrep rules, so the Stop hook had to move
# too or a developer's local gate and their PR check would enforce different
# rule sets. The pins that matter:
#
#   - ERROR blocks (exit 2), WARNING does not (exit 1). Three rules are WARNING
#     in CI on purpose — without dataflow they cannot be precise enough to gate,
#     and cc-generic-catch fires on ordinary (catch Exception e ...). A local
#     gate stricter than CI gets muted, which costs more than it buys.
#   - check_id is displayed short. semgrep prefixes it with the config path when
#     --config is absolute, which would print
#     ".private.tmp.cc-semgrep-rules-v1.cc-read-string" as the rule name.
#   - a missing rules dir or missing semgrep skips silently.
#
# Replaces security-stop-holmes_test.sh.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOK="${SCRIPT_DIR}/../plugins/clojure-security/hooks/security-stop.sh"

oneTimeSetUp() {
  if ! command -v jq >/dev/null 2>&1 || ! command -v git >/dev/null 2>&1; then
    echo "jq or git not installed — skipping security-stop semgrep tests"
    startSkipping
  fi
}

setUp() {
  PROJECT="$(mktemp -d)"
  BIN="$(mktemp -d)"
  RULES="$(mktemp -d)"
  ARGS_LOG="${BIN}/semgrep-args.txt"
  RESULTS="${BIN}/results.json"

  printf 'rules:\n' > "${RULES}/cc-read-string.yaml"
  printf '{"results":[],"errors":[]}' > "${RESULTS}"

  # Stub semgrep: record args, emit whatever RESULTS holds on stdout.
  cat > "${BIN}/semgrep" <<EOF
#!/usr/bin/env bash
printf '%s\n' "\$*" > "${ARGS_LOG}"
cat "${RESULTS}"
exit 0
EOF
  chmod +x "${BIN}/semgrep"

  git -C "${PROJECT}" init -q
  git -C "${PROJECT}" config user.email t@t.t
  git -C "${PROJECT}" config user.name t
  printf '{:deps {}}' > "${PROJECT}/deps.edn"
  printf '(ns foo)' > "${PROJECT}/foo.clj"
  git -C "${PROJECT}" add -A
  git -C "${PROJECT}" commit -qm init >/dev/null 2>&1
  printf '(ns foo)\n(def x 1)\n' > "${PROJECT}/foo.clj"
}

tearDown() {
  rm -rf "${PROJECT}" "${BIN}" "${RULES}"
}

# Emit a semgrep JSON result at the given severity. The check_id deliberately
# carries an absolute-config path prefix, as real semgrep produces.
set_finding() {
  local sev="$1" rule="$2"
  cat > "${RESULTS}" <<EOF
{"results":[{"check_id":"private.tmp.cc-semgrep-rules-v1.${rule}",
  "path":"foo.clj","start":{"line":2,"col":12},"end":{"line":2,"col":30},
  "extra":{"severity":"${sev}","message":"unsafe thing"}}],"errors":[]}
EOF
}

# Run the hook; echo "<exit-code>|<stderr>".
run_hook() {
  local err rc
  err="$(printf '{"cwd":"%s","stop_hook_active":false}' "${PROJECT}" \
    | PATH="${BIN}:${PATH}" CC_SEMGREP_RULES_DIR="${RULES}" \
      CC_SKIP_DIFF_REVIEW=1 \
      bash "${HOOK}" 2>&1 >/dev/null)"
  rc=$?
  printf '%s|%s' "${rc}" "${err}"
}

test_semgrep_invoked_with_json_and_the_rules_dir() {
  run_hook >/dev/null
  assertTrue "semgrep should have been invoked" "[ -f '${ARGS_LOG}' ]"
  local args; args="$(cat "${ARGS_LOG}")"
  assertContains "must request JSON" "${args}" "--json"
  assertContains "must pass the resolved rules dir" "${args}" "${RULES}"
}

test_error_severity_blocks() {
  set_finding "ERROR" "cc-read-string"
  local out; out="$(run_hook)"
  assertEquals "an ERROR finding must block the stop" "2" "${out%%|*}"
  assertContains "the finding must be reported" "${out#*|}" "unsafe thing"
}

test_warning_severity_does_not_block() {
  set_finding "WARNING" "cc-generic-catch"
  local out; out="$(run_hook)"
  assertEquals "a WARNING finding must not block (exit 1, advisory)" "1" "${out%%|*}"
  assertContains "the warning must still be reported" "${out#*|}" "cc-generic-catch"
}

test_warning_reported_under_a_separate_heading() {
  set_finding "WARNING" "cc-path-traversal"
  local out; out="$(run_hook)"
  assertContains "warnings need their own advisory heading" "${out#*|}" "advisory"
}

test_check_id_displayed_without_the_config_path_prefix() {
  set_finding "ERROR" "cc-read-string"
  local out; out="$(run_hook)"
  assertContains "rule name must be the bare id" "${out#*|}" "[cc-read-string]"
  assertNotContains "config path prefix must be stripped" "${out#*|}" "private.tmp"
}

test_clean_scan_exits_zero_silently() {
  local out; out="$(run_hook)"
  assertEquals "no findings -> exit 0" "0" "${out%%|*}"
  assertEquals "no findings -> no output" "" "${out#*|}"
}

test_missing_rules_dir_skips_the_scan() {
  local out
  out="$(printf '{"cwd":"%s","stop_hook_active":false}' "${PROJECT}" \
    | PATH="${BIN}:${PATH}" CC_SEMGREP_RULES_DIR="${BIN}/nope" \
      CC_SEMGREP_RULES_CACHE_ROOT="${BIN}/cache" \
      CC_SEMGREP_RULES_URL_BASE="file:///nonexistent" \
      CC_SKIP_DIFF_REVIEW=1 \
      bash "${HOOK}" 2>&1 >/dev/null; printf '|%s' "$?")"
  assertEquals "unresolvable rules -> exit 0, no crash" "0" "${out#*|}"
  assertFalse "semgrep must not run without rules" "[ -f '${ARGS_LOG}' ]"
}

test_clj_holmes_is_never_invoked() {
  cat > "${BIN}/clj-holmes" <<'EOF'
#!/usr/bin/env bash
touch "$(dirname "$0")/holmes-ran"
exit 0
EOF
  chmod +x "${BIN}/clj-holmes"
  run_hook >/dev/null
  assertFalse "clj-holmes must be gone from the Stop hook" "[ -f '${BIN}/holmes-ran' ]"
}

. "${SCRIPT_DIR}/../lib/shunit2"
```

- [ ] **Step 2: Run it to verify it fails**

```bash
bash test/security-stop-semgrep_test.sh
```

Expected: failures — the hook still calls clj-holmes, so `semgrep-args.txt` never appears and no severity split exists.

- [ ] **Step 3: Replace the tool gate**

In `plugins/clojure-security/hooks/security-stop.sh`, replace lines 64-71:

```bash
HAVE_HOLMES=0
HAVE_GITLEAKS=0
command -v clj-holmes >/dev/null 2>&1 && HAVE_HOLMES=1
command -v gitleaks   >/dev/null 2>&1 && HAVE_GITLEAKS=1
if [ "$HAVE_HOLMES" -eq 0 ] && [ "$HAVE_GITLEAKS" -eq 0 ]; then
  exit 0
fi
```

with:

```bash
HAVE_SEMGREP=0
HAVE_GITLEAKS=0
command -v semgrep  >/dev/null 2>&1 && HAVE_SEMGREP=1
command -v gitleaks >/dev/null 2>&1 && HAVE_GITLEAKS=1

# The ledger review (below) needs neither tool, so an absent toolchain is no
# longer sufficient reason to exit — only an absent toolchain AND an absent
# ledger is.
if [ "$HAVE_SEMGREP" -eq 0 ] && [ "$HAVE_GITLEAKS" -eq 0 ] \
   && [ ! -f "${CWD}/.claude/.security-turn-files" ]; then
  exit 0
fi

# shellcheck source=lib/semgrep-rules.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib/semgrep-rules.sh"
```

- [ ] **Step 4: Replace the clj-holmes block**

Replace lines 141-188 (`# --- run clj-holmes ---` through the closing `fi` before `# --- run gitleaks ---`) with:

```bash
# --- run semgrep ------------------------------------------------------------

SEMGREP_ERRORS=""
SEMGREP_WARNINGS=""
SEMGREP_ERROR_COUNT=0
SEMGREP_WARN_COUNT=0

if [ "$HAVE_SEMGREP" -eq 1 ] && [ -n "$CLJ_FILES" ]; then
  RULES_DIR="$(resolve_semgrep_rules)"
  if [ -n "$RULES_DIR" ]; then
    SEMGREP_OUT="$(mktemp 2>/dev/null || true)"
    if [ -n "$SEMGREP_OUT" ]; then
      # No tmp-tree mirror, unlike the scanner this replaces: semgrep reads
      # .clj/.cljs/.cljc directly and reports the paths it was given.
      # --quiet keeps the progress spinner out of stderr; findings come from JSON.
      #
      # A bash array rather than `xargs`: xargs splits its input on whitespace,
      # so a path containing a space would arrive as two bogus arguments and the
      # file would be silently left unscanned. The previous scanner iterated with
      # while-read for that reason; keep the property.
      #
      # (Comments here name no tool: test/no-clj-holmes_test.sh keeps the retired
      # scanner's name out of every plugin file but CHANGES, which is where the
      # history of why it was dropped actually belongs.)
      SG_ARGS=()
      while IFS= read -r f; do
        [ -n "$f" ] && SG_ARGS+=("$f")
      done <<<"$CLJ_FILES"

      semgrep scan --json --quiet --config "$RULES_DIR" "${SG_ARGS[@]}" \
        > "$SEMGREP_OUT" 2>/dev/null || true

      # Findings suppressed in source with `nosemgrep` are absent from --json
      # output entirely, so they need no handling here — and the local gate
      # matches CI's, which excludes them from both its table and its exit code.
      #
      # check_id is prefixed with the config path when --config is absolute, so
      # strip to the last dot-segment for display.
      #
      # Both substitutions end in `|| true`. `jq` exits 5 on malformed input —
      # exactly what a semgrep killed mid-write leaves behind — and a bare
      # `X="$(cmd)"` assignment is NOT exempt from `set -e` the way a command in
      # an AND-OR list is. Unguarded, that kills the hook with an uncontracted
      # exit 5 and stderr already routed to /dev/null: a silent dead gate, the
      # same failure that condemned clj-holmes. The gitleaks block below has
      # always guarded its jq the same way.
      if [ -s "$SEMGREP_OUT" ]; then
        SEMGREP_ERRORS="$(jq -r '
          .results[]? | select(.extra.severity == "ERROR")
          | "\(.path):\(.start.line):\(.start.col)  ERROR  [\(.check_id | split(".") | last)]  \(.extra.message | gsub("\\s+"; " "))"
        ' "$SEMGREP_OUT" 2>/dev/null || true)"

        SEMGREP_WARNINGS="$(jq -r '
          .results[]? | select(.extra.severity == "WARNING")
          | "\(.path):\(.start.line):\(.start.col)  WARNING  [\(.check_id | split(".") | last)]  \(.extra.message | gsub("\\s+"; " "))"
        ' "$SEMGREP_OUT" 2>/dev/null || true)"
      fi

      # `[ -n "$x" ] && y=...` is safe as a standalone statement, but an
      # if-block is clearer where the body computes a value used later.
      if [ -n "$SEMGREP_ERRORS" ]; then
        SEMGREP_ERROR_COUNT="$(printf '%s\n' "$SEMGREP_ERRORS" | wc -l | tr -d ' ')"
      fi
      if [ -n "$SEMGREP_WARNINGS" ]; then
        SEMGREP_WARN_COUNT="$(printf '%s\n' "$SEMGREP_WARNINGS" | wc -l | tr -d ' ')"
      fi

      rm -f "$SEMGREP_OUT"
    fi
  fi
fi
```

Also update line 133's comment `# Clojure-shaped subset (for clj-holmes).` to `# Clojure-shaped subset (for semgrep).`

And line ~56, above `is_clojure_project()` — outside every region named above, but
`test/no-clj-holmes_test.sh` in Task 10 asserts that no plugin file outside
`CHANGES` mentions clj-holmes, so leaving it makes that task fail:

```bash
# run gitleaks / clj-holmes on every git repo the session touches.
```

becomes

```bash
# run gitleaks / semgrep on every git repo the session touches.
```

Then confirm nothing stale survives:
`git grep -n 'clj-holmes' plugins/clojure-security/hooks/security-stop.sh` must be
empty — including in the new comments. Where a comment needs to explain why the
code differs from what came before, say "the scanner this replaces" rather than
naming it. Task 10's invariant keeps the retired tool's name out of every plugin
file but `CHANGES`, which is where the history belongs; a grep that simple cannot
rot, and the "why" survives either way.

- [ ] **Step 5: Replace the report and exit decision**

Replace lines 226-259 (`# --- emit report and exit ---` to end of file) with:

```bash
# --- emit report and exit ---------------------------------------------------

if [ "$SEMGREP_ERROR_COUNT" -eq 0 ] && [ "$SEMGREP_WARN_COUNT" -eq 0 ] \
   && [ "$GITLEAKS_COUNT" = "0" ]; then
  exit 0
fi

{
  # The header and the closing triage block are both about TOOL findings. When
  # the only content is a ledger-scoped review, neither applies: nothing came
  # from the diff, and the taint-shaped investigation order does not fit
  # access-control work.
  HAVE_TOOL_FINDINGS=0
  if [ "$SEMGREP_ERROR_COUNT" -gt 0 ] || [ "$SEMGREP_WARN_COUNT" -gt 0 ] \
     || [ "$GITLEAKS_COUNT" != "0" ]; then
    HAVE_TOOL_FINDINGS=1
  fi

  if [ "$HAVE_TOOL_FINDINGS" -eq 1 ]; then
    echo "Security scan on the session diff (scope: ${SCOPE_KIND})."
  else
    echo "Security review of this turn's edits."
  fi
  echo
  if [ -n "$GITLEAKS_REPORT" ]; then
    echo "## Secrets (gitleaks) — ${GITLEAKS_COUNT}"
    printf '%s\n' "$GITLEAKS_REPORT"
    echo
  fi
  if [ -n "$SEMGREP_ERRORS" ]; then
    echo "## Clojure security patterns (semgrep, blocking) — ${SEMGREP_ERROR_COUNT}"
    printf '%s\n' "$SEMGREP_ERRORS"
    echo
  fi
  if [ -n "$SEMGREP_WARNINGS" ]; then
    echo "## Clojure security patterns (semgrep, advisory) — ${SEMGREP_WARN_COUNT}"
    echo "Non-blocking, and non-blocking in CI too: these rules have no dataflow,"
    echo "so they cannot be precise enough to gate a build. Read them, judge them,"
    echo "act if warranted."
    printf '%s\n' "$SEMGREP_WARNINGS"
    echo
  fi
  if [ "$HAVE_TOOL_FINDINGS" -eq 1 ]; then
    echo "Triage each finding through the clojure-security skill before"
    echo "ending this turn. Use the skill's investigation order:"
    echo "  1. source of the tainted value"
    echo "  2. trust boundary crossed"
    echo "  3. existing sanitization on the path"
    echo "  4. whether removing the sink would break legitimate use"
    echo "  5. other call sites with the same sink shape"
    echo
  fi
  if [ "$STOP_HOOK_ACTIVE" = "true" ]; then
    echo "(Stop hook is reentering — findings still present after a prior"
    echo "continuation. Address them or escalate to the human.)"
  fi
} >&2

# Blocking findings block the stop. Advisory-only findings surface as a
# non-blocking warning (exit 1) so the turn can end — mirroring CI, where the
# three WARNING rules never fail the job.
if [ "$SEMGREP_ERROR_COUNT" -gt 0 ] || [ "$GITLEAKS_COUNT" != "0" ]; then
  exit 2
fi
exit 1
```

Update the header comment at lines 11-13:

```bash
# Tools (each best-effort; missing tools are skipped silently):
#   - semgrep  : the 16 cc-* rules that gate CI (see lib/semgrep-rules.sh).
#                ERROR blocks; the three WARNING rules are advisory, exactly as
#                in CI — without dataflow they cannot be precise enough to gate.
#   - gitleaks : secret scanning
```

- [ ] **Step 6: Run the test to verify it passes**

```bash
bash test/security-stop-semgrep_test.sh
```

Expected: `Ran 8 tests.` / `OK`

- [ ] **Step 7: Run the whole suite**

```bash
for t in test/*_test.sh; do bash "$t" >/dev/null 2>&1 || echo "FAIL $t"; done; echo done
```

Expected: `FAIL test/security-stop-holmes_test.sh` and nothing else — Step 8 deletes it.

`non-clojure-gating_test.sh` will **pass**, even though it still stubs `clj-holmes`.
`security-stop.sh` runs `is_clojure_project || exit 0` *before* tool detection, so
in a non-Clojure repo the hook exits before it ever looks for a tool, and the
stubs are never reached whichever tool is named. Task 4 renames them for hygiene,
not to fix a failure.

- [ ] **Step 8: Delete the superseded test and commit**

```bash
git rm -q test/security-stop-holmes_test.sh
git add plugins/clojure-security/hooks/security-stop.sh test/security-stop-semgrep_test.sh
git commit -m "feat(clojure-security)!: Stop hook scans with semgrep, not clj-holmes

Local enforcement was a strictly weaker subset of CI: clj-holmes reads
only *.clj, so .cljs and .cljc were never scanned at all — and that is
where CWE-79 (#1 on the Top 25) and c3kit's shared domain logic live.

Severity now mirrors CI exactly. The 13 ERROR rules block; cc-path-traversal,
cc-generic-catch and cc-clojure-xml-xxe are advisory and exit 1. Blocking
locally on rules CI deliberately does not gate would make the hook stricter
than the pipeline, and a hook stricter than the pipeline gets disabled.

check_id is printed as the bare rule id: semgrep prefixes it with the config
path when --config is absolute."
```

---

### Task 3: commit-backstop.sh runs semgrep

**Files:**
- Modify: `plugins/clojure-security/hooks/commit-backstop.sh` — lines 86-92 (tool gate), 122-172 (clj-holmes block), 176-199 (decide/report)

**Interfaces:**
- Consumes: `resolve_semgrep_rules` from Task 1.
- Produces: exit `0` clean-or-advisory-only, `2` blocking. Unlike the Stop hook this has no exit-1 tier — a PreToolUse hook returning 1 does not block, so advisory findings print and the commit proceeds.

- [ ] **Step 1: Write the failing test**

Append to `test/security-stop-semgrep_test.sh`, immediately before the final `. "${SCRIPT_DIR}/../lib/shunit2"` line:

```bash
# --- commit-backstop.sh -----------------------------------------------------
# Same rule set, same severity split, different gate: a PreToolUse hook cannot
# signal "advisory" with exit 1 (that does not block, and neither does 0), so
# advisory findings print and the commit proceeds.

COMMIT_HOOK="${SCRIPT_DIR}/../plugins/clojure-security/hooks/commit-backstop.sh"

run_commit_hook() {
  local err rc
  err="$(printf '{"tool_name":"Bash","tool_input":{"command":"git commit -m x"},"cwd":"%s"}' "${PROJECT}" \
    | PATH="${BIN}:${PATH}" CC_SEMGREP_RULES_DIR="${RULES}" \
      bash "${COMMIT_HOOK}" 2>&1 >/dev/null)"
  rc=$?
  printf '%s|%s' "${rc}" "${err}"
}

stage_a_clojure_file() {
  printf '(ns bar)\n(def y 2)\n' > "${PROJECT}/bar.clj"
  git -C "${PROJECT}" add bar.clj
}

test_commit_backstop_blocks_on_error_severity() {
  stage_a_clojure_file
  set_finding "ERROR" "cc-sql-string-concat"
  local out; out="$(run_commit_hook)"
  assertEquals "an ERROR finding must block the commit" "2" "${out%%|*}"
  assertContains "the finding must be reported" "${out#*|}" "cc-sql-string-concat"
}

test_commit_backstop_does_not_block_on_warning_severity() {
  stage_a_clojure_file
  set_finding "WARNING" "cc-generic-catch"
  local out; out="$(run_commit_hook)"
  assertEquals "a WARNING finding must not block the commit" "0" "${out%%|*}"
  assertContains "the warning must still print" "${out#*|}" "cc-generic-catch"
}

test_commit_backstop_uses_semgrep_not_holmes() {
  stage_a_clojure_file
  run_commit_hook >/dev/null
  assertTrue "semgrep should have been invoked" "[ -f '${ARGS_LOG}' ]"
  assertContains "must pass the resolved rules dir" "$(cat "${ARGS_LOG}")" "${RULES}"
}
```

- [ ] **Step 2: Run it to verify the new tests fail**

```bash
bash test/security-stop-semgrep_test.sh
```

Expected: the three new `test_commit_backstop_*` tests fail; the eight from Task 2 still pass.

- [ ] **Step 3: Replace the tool gate**

In `plugins/clojure-security/hooks/commit-backstop.sh`, replace lines 86-92:

```bash
HAVE_HOLMES=0
HAVE_GITLEAKS=0
command -v clj-holmes >/dev/null 2>&1 && HAVE_HOLMES=1
command -v gitleaks   >/dev/null 2>&1 && HAVE_GITLEAKS=1
if [ "$HAVE_HOLMES" -eq 0 ] && [ "$HAVE_GITLEAKS" -eq 0 ]; then
  exit 0
fi
```

with:

```bash
HAVE_SEMGREP=0
HAVE_GITLEAKS=0
command -v semgrep  >/dev/null 2>&1 && HAVE_SEMGREP=1
command -v gitleaks >/dev/null 2>&1 && HAVE_GITLEAKS=1
if [ "$HAVE_SEMGREP" -eq 0 ] && [ "$HAVE_GITLEAKS" -eq 0 ]; then
  exit 0
fi

# shellcheck source=lib/semgrep-rules.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib/semgrep-rules.sh"
```

- [ ] **Step 4: Replace the clj-holmes block**

Replace lines 122-172 (`# --- clj-holmes against working-tree copies ---` through its closing `fi`) with:

```bash
# --- semgrep against staged content of staged Clojure files ----------------

SEMGREP_ERRORS=""
SEMGREP_WARNINGS=""
SEMGREP_ERROR_COUNT=0
SEMGREP_WARN_COUNT=0

if [ "$HAVE_SEMGREP" -eq 1 ] && [ -n "$CLJ_STAGED" ]; then
  RULES_DIR="$(resolve_semgrep_rules)"
  if [ -n "$RULES_DIR" ]; then
    TMP_SG="$(mktemp -d 2>/dev/null || true)"
    if [ -n "$TMP_SG" ]; then
      # The tmp-tree mirror stays, unlike in the Stop hook: this must scan
      # STAGED content (`git show :path`), which by definition is not what is
      # on disk when a file is partially staged.
      SG_FILES=""
      while IFS= read -r f; do
        [ -z "$f" ] && continue
        mkdir -p "${TMP_SG}/$(dirname "$f")"
        if ! git show ":$f" > "${TMP_SG}/$f" 2>/dev/null; then
          cp "$f" "${TMP_SG}/$f" 2>/dev/null || true
        fi
        SG_FILES="${SG_FILES}${TMP_SG}/${f}"$'\n'
      done <<<"$CLJ_STAGED"

      SG_OUT="${TMP_SG}/__semgrep.json"

      # A bash array, not `xargs` — see the Stop hook for why: xargs splits on
      # whitespace and would silently drop a path containing a space.
      SG_ARGS=()
      while IFS= read -r f; do
        [ -n "$f" ] && SG_ARGS+=("$f")
      done <<<"$SG_FILES"

      semgrep scan --json --quiet --config "$RULES_DIR" "${SG_ARGS[@]}" \
        > "$SG_OUT" 2>/dev/null || true

      # Strip the tmp-tree prefix so reported paths are repo-relative, and the
      # config-path prefix off check_id so the rule name is the bare id.
      #
      # `|| true` on both, and the `-s` guard: jq exits 5 on the truncated JSON a
      # semgrep killed mid-write leaves behind, and a bare `X="$(cmd)"` is not
      # exempt from `set -e`. Unguarded, this blocks a commit with an
      # uncontracted exit 5 and no message.
      if [ -s "$SG_OUT" ]; then
        SEMGREP_ERRORS="$(jq -r --arg prefix "${TMP_SG}/" '
          .results[]? | select(.extra.severity == "ERROR")
          | "\(.path | sub($prefix; "")):\(.start.line):\(.start.col)  ERROR  [\(.check_id | split(".") | last)]  \(.extra.message | gsub("\\s+"; " "))"
        ' "$SG_OUT" 2>/dev/null || true)"

        SEMGREP_WARNINGS="$(jq -r --arg prefix "${TMP_SG}/" '
          .results[]? | select(.extra.severity == "WARNING")
          | "\(.path | sub($prefix; "")):\(.start.line):\(.start.col)  WARNING  [\(.check_id | split(".") | last)]  \(.extra.message | gsub("\\s+"; " "))"
        ' "$SG_OUT" 2>/dev/null || true)"
      fi

      if [ -n "$SEMGREP_ERRORS" ]; then
        SEMGREP_ERROR_COUNT="$(printf '%s\n' "$SEMGREP_ERRORS" | wc -l | tr -d ' ')"
      fi
      if [ -n "$SEMGREP_WARNINGS" ]; then
        SEMGREP_WARN_COUNT="$(printf '%s\n' "$SEMGREP_WARNINGS" | wc -l | tr -d ' ')"
      fi

      rm -rf "$TMP_SG"
    fi
  fi
fi
```

- [ ] **Step 5: Replace the decide/report block**

Replace lines 176-199 (`# --- decide ---` to end of file) with:

```bash
# --- decide -----------------------------------------------------------------

if [ "$SEMGREP_ERROR_COUNT" -eq 0 ] && [ "$SEMGREP_WARN_COUNT" -eq 0 ] \
   && [ "$GITLEAKS_COUNT" = "0" ]; then
  exit 0
fi

{
  if [ "$SEMGREP_ERROR_COUNT" -gt 0 ] || [ "$GITLEAKS_COUNT" != "0" ]; then
    echo "Commit blocked by clojure-security backstop. Staged diff has findings:"
  else
    echo "clojure-security backstop — advisory findings in the staged diff."
    echo "Not blocking: these rules do not gate CI either."
  fi
  echo
  if [ -n "$GITLEAKS_REPORT" ]; then
    echo "## Secrets (gitleaks --staged) — ${GITLEAKS_COUNT}"
    printf '%s\n' "$GITLEAKS_REPORT"
    echo
  fi
  if [ -n "$SEMGREP_ERRORS" ]; then
    echo "## Clojure security patterns (semgrep, blocking) — ${SEMGREP_ERROR_COUNT}"
    printf '%s\n' "$SEMGREP_ERRORS"
    echo
  fi
  if [ -n "$SEMGREP_WARNINGS" ]; then
    echo "## Clojure security patterns (semgrep, advisory) — ${SEMGREP_WARN_COUNT}"
    printf '%s\n' "$SEMGREP_WARNINGS"
    echo
  fi
  if [ "$SEMGREP_ERROR_COUNT" -gt 0 ] || [ "$GITLEAKS_COUNT" != "0" ]; then
    echo "Fix the findings (or unstage the offending files) and re-attempt"
    echo "the commit. To override, the human can run the commit themselves"
    echo "after acknowledging the finding — this backstop is for Claude,"
    echo "not for humans with full context."
  fi
} >&2

# A PreToolUse hook has no advisory exit code — 1 does not block any more than
# 0 does — so advisory findings print and the commit proceeds.
if [ "$SEMGREP_ERROR_COUNT" -gt 0 ] || [ "$GITLEAKS_COUNT" != "0" ]; then
  exit 2
fi
exit 0
```

Update the header comment at lines 17-18 to name semgrep instead of clj-holmes, keeping the partial-stage fidelity note.

- [ ] **Step 6: Run the test to verify it passes**

```bash
bash test/security-stop-semgrep_test.sh
```

Expected: `OK`, with the three new tests added to everything already in the file (Task 2 and its fix round left nine there).

- [ ] **Step 7: Commit**

```bash
git add plugins/clojure-security/hooks/commit-backstop.sh test/security-stop-semgrep_test.sh
git commit -m "feat(clojure-security)!: commit backstop scans with semgrep

Same migration as the Stop hook, so a commit and a PR cannot disagree.

The tmp-tree mirror stays here, unlike in the Stop hook: this must scan
staged content via \`git show :path\`, which is not what is on disk when a
file is only partially staged.

A PreToolUse hook has no advisory exit code, so WARNING findings print and
the commit proceeds rather than being silently dropped."
```

---

### Task 4: SessionStart tool check and non-Clojure gating

**Files:**
- Modify: `plugins/clojure-security/hooks/session-start-marker.sh:100-113`
- Modify: `test/non-clojure-gating_test.sh:12,34,42,73,82`
- Modify: `test/session-start-marker_test.sh` — add two assertions

- [ ] **Step 1: Write the failing tests**

In `test/session-start-marker_test.sh`, add before the final `. "${SCRIPT_DIR}/../lib/shunit2"`:

```bash
test_missing_notice_names_semgrep_not_clj_holmes() {
  printf '{:deps {}}' > "${PROJECT}/deps.edn"

  local ctx scrubbed
  ctx="$(run_hook_context)"

  # clj-watson's real home is github.com/clj-holmes/clj-watson, and that URL
  # legitimately appears in clj-watson's own missing-tool notice. Strip that
  # substring before asserting — otherwise this test fails on every machine
  # where clj-watson is not installed, which is most of them.
  scrubbed="$(printf '%s' "${ctx}" | sed 's|clj-holmes/clj-watson||g')"

  # CI dropped clj-holmes for 16 cc-* semgrep rules. Telling a developer to
  # install a tool the pipeline no longer runs is worse than saying nothing:
  # they would install abandoned software and believe they were covered.
  assertNotContains "clj-holmes must be gone from the toolchain notice" \
    "${scrubbed}" "clj-holmes"

  if ! command -v semgrep >/dev/null 2>&1; then
    assertContains "missing-tool notice should flag semgrep" "${ctx}" "semgrep"
  fi
}

# Run the hook with a PATH that excludes the homebrew prefix, so every scanner
# reports missing and the notice's CONTENT can actually be asserted. Without
# this, a machine that has semgrep installed — which after this migration is the
# normal case — can only ever skip the assertion, and a test that asserts
# nothing passes no matter what the hook does.
#
# jq is symlinked in because the hook needs it to emit its JSON payload at all;
# /usr/bin and /bin supply the coreutils it uses. The outer jq in the pipeline
# runs under the test's own PATH, not the hook's.
run_hook_context_without_tools() {
  local shim out
  shim="$(mktemp -d)"
  ln -s "$(command -v jq)" "${shim}/jq" 2>/dev/null || true
  out="$(printf '{"cwd":"%s"}' "${PROJECT}" \
    | PATH="${shim}:/usr/bin:/bin" bash "${HOOK}" 2>/dev/null \
    | jq -r '.hookSpecificOutput.additionalContext // empty' 2>/dev/null)"
  rm -rf "${shim}"
  printf '%s' "${out}"
}

test_missing_notice_documents_the_rules_dir_override() {
  printf '{:deps {}}' > "${PROJECT}/deps.edn"

  local ctx
  ctx="$(run_hook_context_without_tools)"

  # Unconditional: the shim guarantees semgrep looks absent, so the notice must
  # be present and must carry both the install hint and the override.
  assertContains "the notice should flag semgrep" "${ctx}" "semgrep"
  assertContains "the notice should mention the env override" \
    "${ctx}" "CC_SEMGREP_RULES_DIR"
}
```

In `test/non-clojure-gating_test.sh`, change line 34 from:

```bash
  for tool in clj-holmes gitleaks; do
```

to:

```bash
  for tool in semgrep gitleaks; do
```

and both `CLJ_HOLMES_RULES_DIR="${RULES}"` occurrences (lines 73, 82) to `CC_SEMGREP_RULES_DIR="${RULES}"`. Update line 42's comment to `# non-empty so the semgrep branch isn't skipped for that reason` and lines 7-12's header prose from `clj-holmes` to `semgrep`.

- [ ] **Step 2: Run them to verify they fail**

```bash
bash test/session-start-marker_test.sh
bash test/non-clojure-gating_test.sh
```

Expected: the two new marker tests fail (the hook still says `clj-holmes`).

`non-clojure-gating_test.sh` passes both before and after your edit to it — it was
never failing. The hook exits at `is_clojure_project || exit 0` before tool
detection, so its stubs are never reached whichever tool they name. Renaming them
to `semgrep` is hygiene: it keeps the test honest about what the hook would call
if the gate ever let it through. Do not expect a red-to-green transition here.

- [ ] **Step 3: Update the tool check**

In `plugins/clojure-security/hooks/session-start-marker.sh`, replace lines 100-106:

```bash
if ! command -v clj-holmes >/dev/null 2>&1; then
  note_missing "clj-holmes" \
    "Clojure security-pattern SAST in the Stop and PreToolUse hooks" \
    "download from https://github.com/clj-holmes/clj-holmes/releases/latest — the hooks auto-fetch the rule set on first scan, so no separate \`fetch-rules\` step is needed"
fi
# Note: when clj-holmes is installed but the rules dir is missing/empty, the
# Stop and commit-backstop hooks now run `clj-holmes fetch-rules` themselves
# before scanning — so a missing rules dir is no longer a silent no-op and
# needs no setup note here.
```

with:

```bash
command -v semgrep >/dev/null 2>&1 || note_missing "semgrep" \
  "Clojure security-pattern SAST in the Stop and PreToolUse hooks" \
  "\`brew install semgrep\` — the hooks fetch the 16 cleancoders \`cc-*\` rules on first scan and cache them; set \`CC_SEMGREP_RULES_DIR\` to a \`cleancoders/github-actions\` checkout to skip the fetch entirely"
```

Update line 9's header comment from `clj-holmes + rules, gitleaks, clj-watson, jq` to `semgrep, gitleaks, clj-watson, jq`, and line 112's clj-watson note to drop any implication that clj-holmes is a sibling in the pipeline. **Keep the `https://github.com/clj-holmes/clj-watson` URL** — clj-watson genuinely lives under that GitHub org, and the URL is correct. Task 10's invariant strips that exact substring before matching, so it does not collide.

Also reword `hooks/lib/semgrep-rules.sh:24`, which no other task covers:

```bash
# `clj-holmes fetch-rules` on a cold cache in exactly the same place.
```

becomes

```bash
# the retired scanner's own rule fetch on a cold cache, in the same place.
```

Task 10's invariant would otherwise fail on it, and the sentence loses nothing —
which tool it was is recorded in `CHANGES`.

When done, this must print nothing:

```bash
git grep -n 'clj-holmes' plugins/clojure-security/hooks/
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
bash test/session-start-marker_test.sh && bash test/non-clojure-gating_test.sh
```

Expected: both `OK`.

- [ ] **Step 5: Full suite**

```bash
for t in test/*_test.sh; do bash "$t" >/dev/null 2>&1 || echo "FAIL $t"; done; echo done
```

Expected: `done`, no `FAIL`.

- [ ] **Step 6: Commit**

```bash
git add plugins/clojure-security/hooks/session-start-marker.sh \
        test/session-start-marker_test.sh test/non-clojure-gating_test.sh
git commit -m "fix(clojure-security): SessionStart checks for semgrep

Telling a developer to install clj-holmes is now worse than silence: they
would install software abandoned since October 2022 and believe they were
covered by it. The notice names semgrep and documents CC_SEMGREP_RULES_DIR
for anyone with a github-actions checkout."
```

---

### Task 5: Turn ledger

**Files:**
- Create: `plugins/clojure-security/hooks/turn-ledger.sh`
- Create: `test/turn-ledger_test.sh`
- Modify: `plugins/clojure-security/hooks/hooks.json` — PostToolUse block
- Modify: `plugins/clojure-security/hooks/session-end-cleanup.sh:20-21`

**Interfaces:**
- Produces: the file `<cwd>/.claude/.security-turn-files`, one repo-path per line, append-only, `.clj`/`.cljs`/`.cljc` only. Task 6 drains and deletes it. Always exits 0.

- [ ] **Step 1: Write the failing test**

Create `test/turn-ledger_test.sh`:

```bash
#!/usr/bin/env bash
# Tests for plugins/clojure-security/hooks/turn-ledger.sh
#
# Why this hook exists: the Stop hook's diff is CUMULATIVE — branch merge-base,
# or the session-start SHA, plus uncommitted and untracked. It therefore cannot
# tell what changed in the CURRENT turn. Semgrep does not care; it is fast and
# idempotent. The LLM review does: without a per-turn scope it would re-review
# turn 3's files again on turn 40, forever.
#
# This ledger is that scope. It must never affect a turn, so every failure mode
# — no jq, no cwd, a non-Clojure path, an unwritable directory — exits 0.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOK="${SCRIPT_DIR}/../plugins/clojure-security/hooks/turn-ledger.sh"

oneTimeSetUp() {
  if ! command -v jq >/dev/null 2>&1; then
    echo "jq not installed — skipping turn-ledger tests"
    startSkipping
  fi
}

setUp() {
  PROJECT="$(mktemp -d)"
  LEDGER="${PROJECT}/.claude/.security-turn-files"
}

tearDown() {
  [ -n "${PROJECT}" ] && rm -rf "${PROJECT}"
}

# Feed an Edit-shaped payload.
edit() {
  printf '{"cwd":"%s","tool_name":"Edit","tool_input":{"file_path":"%s"}}' \
    "${PROJECT}" "$1" | bash "${HOOK}" >/dev/null 2>&1
  return 0
}

ledger() {
  cat "${LEDGER}" 2>/dev/null
}

test_records_a_clj_edit() {
  edit "src/clj/app/routes.clj"
  assertEquals "the edited path must be recorded" \
    "src/clj/app/routes.clj" "$(ledger)"
}

test_records_cljs_and_cljc() {
  edit "src/cljs/app/page.cljs"
  edit "src/cljc/app/domain.cljc"
  assertContains "cljs must be recorded — it is where CWE-79 lives" \
    "$(ledger)" "page.cljs"
  assertContains "cljc must be recorded — c3kit puts shared logic there" \
    "$(ledger)" "domain.cljc"
}

test_ignores_non_clojure_paths() {
  edit "README.md"
  edit "package.json"
  assertFalse "no ledger should be created for non-Clojure edits" \
    "[ -f '${LEDGER}' ]"
}

test_ignores_edn_and_bb() {
  # Unlike the lint hook, which lints .edn and .bb: the 13 classes this feeds
  # are about handlers, routes and dataflow, not config files.
  edit "deps.edn"
  edit "script.bb"
  assertFalse "config files must not trigger a security review" \
    "[ -f '${LEDGER}' ]"
}

test_appends_across_multiple_edits() {
  edit "a.clj"
  edit "b.clj"
  assertEquals "both edits must be present" "2" "$(ledger | wc -l | tr -d ' ')"
}

test_handles_multiedit_file_paths_array() {
  printf '{"cwd":"%s","tool_name":"MultiEdit","tool_input":{"file_paths":["x.clj","y.md","z.cljc"]}}' \
    "${PROJECT}" | bash "${HOOK}" >/dev/null 2>&1
  assertContains "MultiEdit array entries must be recorded" "$(ledger)" "x.clj"
  assertContains "MultiEdit array entries must be recorded" "$(ledger)" "z.cljc"
  assertNotContains "non-Clojure array entries must be skipped" "$(ledger)" "y.md"
}

test_always_exits_zero() {
  # A PostToolUse hook returning non-zero surfaces stderr to Claude and, at 2,
  # blocks. A bookkeeping hook must never do either.
  printf '{"cwd":"%s","tool_name":"Edit","tool_input":{"file_path":"a.clj"}}' "${PROJECT}" \
    | bash "${HOOK}" >/dev/null 2>&1
  assertEquals "clean path exits 0" "0" "$?"

  printf 'not json at all' | bash "${HOOK}" >/dev/null 2>&1
  assertEquals "malformed input exits 0" "0" "$?"

  printf '{"cwd":"%s","tool_name":"Edit","tool_input":{}}' "${PROJECT}" \
    | bash "${HOOK}" >/dev/null 2>&1
  assertEquals "missing file_path exits 0" "0" "$?"
}

test_produces_no_output() {
  local out
  out="$(printf '{"cwd":"%s","tool_name":"Edit","tool_input":{"file_path":"a.clj"}}' "${PROJECT}" \
    | bash "${HOOK}" 2>&1)"
  assertEquals "the ledger hook must be silent" "" "${out}"
}

. "${SCRIPT_DIR}/../lib/shunit2"
```

- [ ] **Step 2: Run it to verify it fails**

```bash
bash test/turn-ledger_test.sh
```

Expected: all fail — the hook does not exist.

- [ ] **Step 3: Write the hook**

Create `plugins/clojure-security/hooks/turn-ledger.sh`:

```bash
#!/usr/bin/env bash
# PostToolUse hook: record which Clojure files this turn edited.
#
# Contract (Claude Code hook protocol):
#   stdin  — JSON with .cwd and .tool_input.file_path (Edit/Write) or
#            .tool_input.file_paths (MultiEdit)
#   stdout — nothing
#   exit 0 — always. This hook is bookkeeping and must never affect a turn.
#
# Why it exists: the Stop hook's diff is CUMULATIVE (branch merge-base or the
# session-start SHA, plus uncommitted and untracked), so it cannot tell what
# changed in the current turn. Semgrep does not care — it is fast, deterministic
# and idempotent. The LLM review of the scanner-blind classes does: without a
# per-turn scope it would re-review turn 3's files again on turn 40, forever.
# This ledger is that scope; security-stop.sh drains and deletes it.
#
# Deliberately separate from clj-kondo-postedit.sh, which shares this matcher:
# that hook signals findings with exit 1 and 2 and a ledger write must never
# perturb its exit code, and it returns early on `command -v clj-kondo`, so a
# machine without clj-kondo would silently record nothing.
#
# .edn and .bb are excluded, unlike the lint hook. The 13 classes this feeds are
# about handlers, routes and dataflow, not config files.

# No `set -e` / `set -u`: bash 3.2 treats empty arrays as unbound, and any
# non-zero intermediate here must be survivable.

INPUT="$(cat 2>/dev/null || true)"

command -v jq >/dev/null 2>&1 || exit 0

CWD="$(printf '%s' "$INPUT" | jq -r '.cwd // empty' 2>/dev/null)"
if [ -z "$CWD" ]; then
  CWD="${CLAUDE_PROJECT_DIR:-$PWD}"
fi

PATHS="$(printf '%s' "$INPUT" | jq -r '
  if (.tool_input.file_paths | type) == "array"
    then .tool_input.file_paths[]
    else (.tool_input.file_path // empty)
  end
' 2>/dev/null)"

if [ -z "$PATHS" ]; then
  exit 0
fi

LEDGER="${CWD}/.claude/.security-turn-files"
MADE_DIR=0

while IFS= read -r p; do
  [ -z "$p" ] && continue
  case "$p" in
    *.clj|*.cljs|*.cljc) ;;
    *) continue ;;
  esac
  if [ "$MADE_DIR" -eq 0 ]; then
    mkdir -p "${CWD}/.claude" 2>/dev/null || exit 0
    MADE_DIR=1
  fi
  printf '%s\n' "$p" >> "$LEDGER" 2>/dev/null || true
done <<EOF
${PATHS}
EOF

exit 0
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
bash test/turn-ledger_test.sh
```

Expected: `Ran 8 tests.` / `OK` — the file defines eight `test_` functions.

- [ ] **Step 5: Register the hook**

In `plugins/clojure-security/hooks/hooks.json`, replace the `PostToolUse` block with:

```json
    "PostToolUse": [
      {
        "matcher": "Edit|Write|MultiEdit",
        "hooks": [
          {
            "type": "command",
            "command": "${CLAUDE_PLUGIN_ROOT}/hooks/clj-kondo-postedit.sh",
            "timeout": 10
          },
          {
            "type": "command",
            "command": "${CLAUDE_PLUGIN_ROOT}/hooks/turn-ledger.sh",
            "timeout": 5
          }
        ]
      }
    ],
```

- [ ] **Step 6: Clean the ledger at SessionEnd**

In `plugins/clojure-security/hooks/session-end-cleanup.sh`, replace lines 20-21:

```bash
MARKER="${CWD}/.claude/.security-session-start-sha"
[ -f "$MARKER" ] && rm -f "$MARKER"
```

with:

```bash
MARKER="${CWD}/.claude/.security-session-start-sha"
[ -f "$MARKER" ] && rm -f "$MARKER"

# The Stop hook drains the turn ledger every turn, so this is a backstop for a
# session that ended mid-turn (crash, kill) and left one behind. A stale ledger
# would make the next session's first Stop review files nobody touched in it.
LEDGER="${CWD}/.claude/.security-turn-files"
[ -f "$LEDGER" ] && rm -f "$LEDGER"
```

Update the header comment on line 2 to `# SessionEnd hook: remove the session-start SHA marker and any stale turn ledger`.

- [ ] **Step 7: Verify the JSON is valid and the suite is green**

```bash
jq -e . plugins/clojure-security/hooks/hooks.json >/dev/null && echo "hooks.json ok"
for t in test/*_test.sh; do bash "$t" >/dev/null 2>&1 || echo "FAIL $t"; done; echo done
```

Expected: `hooks.json ok` then `done`, no `FAIL`.

- [ ] **Step 8: Commit**

```bash
git add plugins/clojure-security/hooks/turn-ledger.sh \
        plugins/clojure-security/hooks/hooks.json \
        plugins/clojure-security/hooks/session-end-cleanup.sh \
        test/turn-ledger_test.sh
git commit -m "feat(clojure-security): record each turn's Clojure edits

Groundwork for reviewing the 13 vulnerability classes no scanner reaches.

The Stop hook's diff is cumulative, so it cannot tell what changed in the
current turn — which is fine for semgrep and fatal for an LLM pass, since it
would re-review turn 3's files again on turn 40. A PostToolUse ledger gives
the Stop hook a per-turn scope, so no content-hash cache is needed.

Separate from clj-kondo-postedit.sh on the same matcher: that hook signals
findings through exit 1 and 2, and it returns early when clj-kondo is absent,
which would silently record nothing."
```

---

### Task 6: LLM review directive

**Files:**
- Modify: `plugins/clojure-security/hooks/security-stop.sh` — new block before the report, and the exit decision
- Create: `test/security-stop-review_test.sh`

**Interfaces:**
- Consumes: `.claude/.security-turn-files` from Task 5; `SEMGREP_ERROR_COUNT` / `GITLEAKS_COUNT` from Task 2.
- Reads env: `CC_SKIP_DIFF_REVIEW` — any non-empty value skips the directive while still draining the ledger.

- [ ] **Step 1: Write the failing test**

Create `test/security-stop-review_test.sh`:

```bash
#!/usr/bin/env bash
# Tests for the scanner-blind-class review in security-stop.sh.
#
# 13 of the skill's 27 vulnerability classes have no scanner at all — they need
# dataflow, namespace-alias resolution, or whole-route reasoning that semgrep
# cannot do. Before this they were reachable only by a manual /security-audit
# that nothing triggers. Nine of them are CWE Top 25 entries.
#
# The invariants:
#   - the ledger is drained UNCONDITIONALLY, before the decision to review.
#     A review that does not fire must not leave work to pile up across turns.
#   - the directive is one-shot per turn. It has no findings to clear, so
#     re-issuing it on reentry would block forever.
#   - it names the ledger's files and tells Claude not to sweep the repo.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOK="${SCRIPT_DIR}/../plugins/clojure-security/hooks/security-stop.sh"

oneTimeSetUp() {
  if ! command -v jq >/dev/null 2>&1 || ! command -v git >/dev/null 2>&1; then
    echo "jq or git not installed — skipping stop-review tests"
    startSkipping
  fi
}

setUp() {
  PROJECT="$(mktemp -d)"
  BIN="$(mktemp -d)"
  RULES="$(mktemp -d)"
  LEDGER="${PROJECT}/.claude/.security-turn-files"

  printf 'rules:\n' > "${RULES}/cc-read-string.yaml"

  # Clean semgrep, absent gitleaks: the review must be able to fire on its own.
  cat > "${BIN}/semgrep" <<'EOF'
#!/usr/bin/env bash
printf '{"results":[],"errors":[]}'
exit 0
EOF
  chmod +x "${BIN}/semgrep"

  git -C "${PROJECT}" init -q
  git -C "${PROJECT}" config user.email t@t.t
  git -C "${PROJECT}" config user.name t
  printf '{:deps {}}' > "${PROJECT}/deps.edn"
  printf '(ns foo)' > "${PROJECT}/routes.clj"
  git -C "${PROJECT}" add -A
  git -C "${PROJECT}" commit -qm init >/dev/null 2>&1
  printf '(ns foo)\n(def x 1)\n' > "${PROJECT}/routes.clj"

  mkdir -p "${PROJECT}/.claude"
}

tearDown() {
  rm -rf "${PROJECT}" "${BIN}" "${RULES}"
}

# Run the hook; echo "<exit-code>|<stderr>". `active` is the stop_hook_active
# value; extra env can be prepended via ENV_EXTRA.
run_hook() {
  local active="${1:-false}" err rc
  # `env` is required, not decoration: a variable that expands to `NAME=VAL` is
  # NOT re-parsed as a prefix assignment, so `${ENV_EXTRA:-} bash …` tries to
  # execute a command literally named `CC_SKIP_DIFF_REVIEW=1` and dies with
  # exit 127. Verified: `E="FOO=bar"; $E env` → "FOO=bar: command not found".
  err="$(printf '{"cwd":"%s","stop_hook_active":%s}' "${PROJECT}" "${active}" \
    | PATH="${BIN}:${PATH}" CC_SEMGREP_RULES_DIR="${RULES}" \
      env ${ENV_EXTRA:-} bash "${HOOK}" 2>&1 >/dev/null)"
  rc=$?
  printf '%s|%s' "${rc}" "${err}"
}

test_no_ledger_means_no_review() {
  local out; out="$(run_hook)"
  assertEquals "clean scan and no ledger -> exit 0" "0" "${out%%|*}"
  assertEquals "no ledger -> no directive" "" "${out#*|}"
}

test_ledger_triggers_a_blocking_review() {
  printf 'routes.clj\n' > "${LEDGER}"
  local out; out="$(run_hook)"
  assertEquals "a populated ledger must block the stop" "2" "${out%%|*}"
  assertContains "the directive must name the edited file" "${out#*|}" "routes.clj"
}

test_directive_scopes_the_review_to_the_ledger() {
  printf 'routes.clj\n' > "${LEDGER}"
  local out; out="$(run_hook)"
  local err="${out#*|}"
  assertContains "must forbid a repo-wide sweep" "${err}" "do not sweep the repo"
  assertContains "must point at the access-control reference" \
    "${err}" "references/access-control.md"
  assertContains "must point at the config-and-ops reference" \
    "${err}" "references/config-and-ops.md"
  assertContains "must point at the injection reference for macro-runtime-input" \
    "${err}" "references/injection.md"
  assertContains "must point at the route sweep procedure" \
    "${err}" "references/route-inventory.md"
  assertContains "must forbid auto-fixing" "${err}" "Do not auto-fix"
}

test_ledger_is_deleted_after_the_review() {
  printf 'routes.clj\n' > "${LEDGER}"
  run_hook >/dev/null
  assertFalse "the ledger must be drained" "[ -f '${LEDGER}' ]"
}

test_ledger_is_deleted_even_when_the_review_is_suppressed() {
  # The drain must happen BEFORE the decision to review. Otherwise a suppressed
  # turn leaves its files to pile up and the next unsuppressed Stop reviews a
  # cumulative list — the exact repetition this design exists to avoid.
  printf 'routes.clj\n' > "${LEDGER}"
  ENV_EXTRA="CC_SKIP_DIFF_REVIEW=1" run_hook >/dev/null
  assertFalse "the ledger must be drained even when suppressed" "[ -f '${LEDGER}' ]"
}

test_reentry_does_not_reissue_the_directive() {
  printf 'routes.clj\n' > "${LEDGER}"
  local out; out="$(run_hook "true")"
  assertEquals "reentry must not block on a directive alone" "0" "${out%%|*}"
}

test_skip_env_var_suppresses_the_block() {
  printf 'routes.clj\n' > "${LEDGER}"
  local out; out="$(ENV_EXTRA="CC_SKIP_DIFF_REVIEW=1" run_hook)"
  assertEquals "the opt-out must not block" "0" "${out%%|*}"
}

test_deleted_files_are_not_reviewed() {
  printf 'routes.clj\ngone.clj\n' > "${LEDGER}"
  local out; out="$(run_hook)"
  local err="${out#*|}"
  assertContains "existing file must be reviewed" "${err}" "routes.clj"
  assertNotContains "a file deleted later in the turn must be dropped" \
    "${err}" "gone.clj"
}

test_review_names_the_scanner_blind_classes() {
  printf 'routes.clj\n' > "${LEDGER}"
  local out; out="$(run_hook)"
  local err="${out#*|}"
  # Spot-check the highest-value ones. missing-authz is CWE-862, #4 on the
  # CWE Top 25; idor is CWE-639; ssrf is CWE-918.
  assertContains "must name missing-authz" "${err}" "missing-authz"
  assertContains "must name idor" "${err}" "idor"
  assertContains "must name ssrf" "${err}" "ssrf"
  assertContains "must name macro-runtime-input" "${err}" "macro-runtime-input"
}

. "${SCRIPT_DIR}/../lib/shunit2"
```

Also add one case to `test/turn-ledger_test.sh`, closing a fidelity gap Task 5's
review found: every existing case feeds a relative path, but Claude Code only ever
sends absolute ones, so the suite has no coverage of the real payload shape.

```bash
test_records_an_absolute_path() {
  # This is the only shape production sends: Claude Code puts an absolute path
  # in .tool_input.file_path. The suffix glob and the append are agnostic to it,
  # but nothing proved that until now.
  printf '{"cwd":"%s","tool_name":"Edit","tool_input":{"file_path":"%s/src/app.clj"}}' \
    "${PROJECT}" "${PROJECT}" | bash "${HOOK}" >/dev/null 2>&1
  assertEquals "an absolute path must be recorded verbatim" \
    "${PROJECT}/src/app.clj" "$(ledger)"
}
```

And one to `test/security-stop-review_test.sh` proving the drain normalizes it:

```bash
test_absolute_ledger_paths_are_reported_repo_relative() {
  # The semgrep block in the same report prints repo-relative paths. A directive
  # that prints absolute ones reads like output from a different tool.
  printf '%s/routes.clj\n' "${PROJECT}" > "${LEDGER}"
  local out; out="$(run_hook)"
  local err="${out#*|}"
  assertContains "path must be reported repo-relative" "${err}" "routes.clj"
  assertNotContains "the project prefix must be stripped" "${err}" "${PROJECT}/routes.clj"
}
```

- [ ] **Step 2: Run it to verify it fails**

```bash
bash test/security-stop-review_test.sh
bash test/turn-ledger_test.sh
```

Expected: the ledger tests fail — the hook ignores the file entirely. The new
`turn-ledger` absolute-path case should **pass** immediately; it documents
existing correct behaviour rather than driving a change.

- [ ] **Step 3: Add the review block**

In `plugins/clojure-security/hooks/security-stop.sh`, insert immediately before the `# --- emit report and exit ---` line:

```bash
# --- LLM review of the scanner-blind classes --------------------------------

# 13 of the skill's 27 classes have no scanner: they need dataflow, namespace-
# alias resolution, or whole-route reasoning that semgrep cannot do. Nine are
# CWE Top 25 entries. Before this they were reachable only by a manual
# /security-audit that nothing triggers.
#
# Scope comes from turn-ledger.sh, not from the diff: the diff is cumulative,
# so reviewing it would re-review turn 3's files again on turn 40.

LEDGER="${CWD}/.claude/.security-turn-files"
REVIEW_FILES=""

if [ -f "$LEDGER" ]; then
  REVIEW_FILES="$(awk 'NF' "$LEDGER" 2>/dev/null | sort -u)"
  # Drain BEFORE deciding whether to review. A suppressed or skipped review
  # must not leave its files to pile up into the next turn's list.
  rm -f "$LEDGER"
fi

# One-shot per turn. The directive has no findings to clear, so re-issuing it
# on reentry would block forever.
if [ "$STOP_HOOK_ACTIVE" = "true" ] || [ -n "${CC_SKIP_DIFF_REVIEW:-}" ]; then
  REVIEW_FILES=""
fi

# Drop paths deleted later in the same turn, then shorten for display.
#
# Test existence on the ABSOLUTE path — it is unambiguous regardless of cwd —
# and only then strip the project prefix, so the directive's paths match the
# repo-relative ones the semgrep block prints in the same report.
#
# The strip is bash parameter expansion, deliberately NOT `sed "s|^${CWD}/||"`.
# That interpolates $CWD into a regex, where a `.` in the project path — common
# enough — matches any character: with cwd `/tmp/a.b`, the entry
# `/tmp/aXb/file.clj` strips to `file.clj`, which then fails the existence test
# and is dropped from the review **silently**. This plugin supports cross-repo
# edits (see test/postedit-hooks-cross-repo_test.sh), so the ledger really can
# hold paths outside $CWD. Quoting inside `${f#"$CWD"/}` forces a literal match,
# and a path outside the project simply keeps its absolute form.
if [ -n "$REVIEW_FILES" ]; then
  KEPT=""
  while IFS= read -r f; do
    [ -z "$f" ] && continue
    if [ -f "$f" ]; then
      KEPT="${KEPT}${f#"$CWD"/}"$'\n'
    fi
  done <<<"$REVIEW_FILES"
  REVIEW_FILES="$(printf '%s' "$KEPT" | awk 'NF')"
fi
```

- [ ] **Step 3b: Make the empty-diff guard ledger-aware**

`security-stop.sh:146-148` currently reads:

```bash
if [ -z "$CHANGED" ]; then
  exit 0
fi
```

That sits *before* the review block and skips the drain, so a turn with no
git-visible change banks its ledger into the next turn's list — the cumulative
repetition this design exists to prevent. It needs the same clause the toolchain
gate already got:

```bash
# An empty diff is not sufficient reason to exit: the review below is
# ledger-scoped, not diff-scoped. Bailing here would leave the ledger to bank
# into the next turn — exactly the cumulative repetition the ledger prevents.
# Same reasoning as the toolchain gate above: absent work AND an absent ledger.
if [ -z "$CHANGED" ] && [ ! -f "${CWD}/.claude/.security-turn-files" ]; then
  exit 0
fi
```

Reachable whenever `.claude/` is gitignored (otherwise the untracked ledger keeps
`CHANGED` non-empty, which is why the shipped tests cannot catch it) and the turn
leaves no git trace — an edit-then-revert, or an edit under a gitignored path.
Both are ordinary agent behaviour.

The downstream blocks are already guarded: semgrep runs only when `CLJ_FILES` is
non-empty and gitleaks only when `CHANGED` is, so both correctly skip while the
review still fires.

- [ ] **Step 4: Update the exit decision to account for the review**

Change the early-exit guard from:

```bash
if [ "$SEMGREP_ERROR_COUNT" -eq 0 ] && [ "$SEMGREP_WARN_COUNT" -eq 0 ] \
   && [ "$GITLEAKS_COUNT" = "0" ]; then
  exit 0
fi
```

to:

```bash
if [ "$SEMGREP_ERROR_COUNT" -eq 0 ] && [ "$SEMGREP_WARN_COUNT" -eq 0 ] \
   && [ "$GITLEAKS_COUNT" = "0" ] && [ -z "$REVIEW_FILES" ]; then
  exit 0
fi
```

Inside the `{ ... } >&2` report block, insert after the semgrep advisory section and before the `Triage each finding` lines:

```bash
  if [ -n "$REVIEW_FILES" ]; then
    echo "## Scanner-blind classes — review this turn's edits"
    echo
    echo "Semgrep cannot reach these classes: they need dataflow, namespace-alias"
    echo "resolution, or whole-route reasoning. Review these files:"
    printf '%s\n' "$REVIEW_FILES" | sed 's/^/  /'
    echo
    echo "Scope: every finding you report must be ABOUT one of those files. Read"
    echo "whatever else you need in order to judge them — a missing authorization"
    echo "check is rarely visible in the handler alone, so follow the middleware"
    echo "stack and the route table wherever they live. What you must not do is go"
    echo "hunting for unrelated findings elsewhere in the repo."
    echo
    echo "Load the clojure-security skill, then only the references you need:"
    echo "  references/access-control.md — atom-toctou, missing-authn,"
    echo "        missing-authz, incorrect-authz, idor, csrf, ssrf, mass-assignment"
    echo "  references/config-and-ops.md — security-misconfig, logging-failures,"
    echo "        unrestricted-upload, resource-exhaustion"
    echo "  references/injection.md — macro-runtime-input"
    echo "  references/route-inventory.md — the route sweep, if any of these files"
    echo "        define, wrap, or dispatch routes"
    echo
    echo "Apply the skill's investigation order and severity heuristic. Report"
    echo "each finding with its class name, CWE and OWASP tag. Provenance you"
    echo "cannot trace is provisional, not a finding. Do not auto-fix — report"
    echo "and let the human choose."
    echo
    echo "This directive is issued once per turn. Report your findings and stop;"
    echo "the hook will not re-issue it."
    echo
  fi
```

Finally, extend the exit condition so a review blocks:

```bash
if [ "$SEMGREP_ERROR_COUNT" -gt 0 ] || [ "$GITLEAKS_COUNT" != "0" ] \
   || [ -n "$REVIEW_FILES" ]; then
  exit 2
fi
exit 1
```

Add to the header comment block, after the Reentrancy note:

```bash
# Scanner-blind classes:
#   13 of the skill's 27 classes have no scanner. The files this turn edited
#   come from turn-ledger.sh via .claude/.security-turn-files — NOT from the
#   diff, which is cumulative and would re-review the same files every turn.
#   The directive is one-shot per turn (it has no findings to clear) and the
#   ledger is drained unconditionally — including by the empty-diff guard above,
#   which must stay ledger-aware or a trace-free turn banks its files into the
#   next one. CC_SKIP_DIFF_REVIEW opts out on ANY non-empty value, "0" included.
#
#   Known limit: files changed by Bash (sed, a script, git checkout) never
#   enter the ledger. Semgrep still scans those through the cumulative diff;
#   only this review is ledger-scoped. And the hook cannot verify the review
#   happened — it blocks once and trusts Claude, as every Stop directive does.
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
bash test/security-stop-review_test.sh
```

Expected: `Ran 9 tests.` / `OK`

- [ ] **Step 6: Full suite**

```bash
for t in test/*_test.sh; do bash "$t" >/dev/null 2>&1 || echo "FAIL $t"; done; echo done
```

Expected: `done`, no `FAIL`. If `security-stop-semgrep_test.sh` fails, check that its `run_hook` still passes `CC_SKIP_DIFF_REVIEW=1` — those tests assert exit codes driven by findings alone.

- [ ] **Step 7: Commit**

```bash
git add plugins/clojure-security/hooks/security-stop.sh test/security-stop-review_test.sh
git commit -m "feat(clojure-security): review the classes no scanner reaches

Nine of the 19 Clojure-applicable CWE Top 25 entries — CWE-352, 862, 434,
863, 284, 306, 918, 639, 770 — were reachable only by a manual
/security-audit that nothing triggers. Semgrep cannot reach them: they need
dataflow, namespace-alias resolution, or whole-route reasoning. An LLM with
the turn's diff can, and that capability is the whole reason this plugin
exists rather than being a CI config.

Scope is the turn ledger, not the diff, so nothing is reviewed twice. The
directive is one-shot per turn because it has no findings to clear, and the
ledger drains before that decision so a suppressed turn cannot bank work."
```

---

### Task 7: SKILL.md route column and tool table

**Files:**
- Modify: `plugins/clojure-security/skills/clojure-security/SKILL.md` — frontmatter `description`, line 12, class index table (lines 41-68), tool table (lines 110-118)
- Modify: `test/skill-index-consistency_test.sh:17`
- Modify: `test/skill-taxonomy-ids_test.sh` — add route-column assertions

**Interfaces:**
- Produces: a 5-data-column class index — `| class | CWE | OWASP | route | ref |` — so awk field numbers become `$2` class, `$3` CWE, `$4` OWASP, `$5` route, `$6` ref. Task 8's test reads the `route` column.
- `route` values: `semgrep:<id>[,<id>…]`, `llm-review`, `clj-watson`, or `audit-only`.

- [ ] **Step 1: Write the failing test**

In `test/skill-taxonomy-ids_test.sh`, add before the final `. "${SCRIPT_DIR}/../lib/shunit2"`:

```bash
# --- route column -----------------------------------------------------------
# The index now records HOW each class is detected. Without it, a reader cannot
# tell which classes CI gates, which the Stop-hook review covers, and which are
# audit-only — the local/CI/audit split that this plugin's whole value rests on.

# "class|route" per index row.
route_rows() {
  grep -E '^\| `[a-z0-9-]+` \|' "${SKILL}" \
    | awk -F'|' '{gsub(/[ `]/,"",$2); gsub(/ /,"",$5); print $2 "|" $5}'
}

# The 16 cc-* rules in cleancoders/github-actions at v1. Pinned rather than
# globbed: the tests must not touch the network, and the rules live in another
# repo. A rule renamed upstream shows up as a CI failure there, not here — what
# this catches is a typo or a drop on THIS side.
CC_RULES="cc-cljs-eval cc-cljs-innerhtml cc-clojure-xml-xxe cc-dangerously-set-html
cc-explain-data-response cc-generic-catch cc-hiccup-raw cc-insecure-tls
cc-load-string cc-nippy-thaw cc-path-traversal cc-read-string cc-shell-exec
cc-snakeyaml-unsafe cc-sql-string-concat cc-weak-crypto"

test_route_column_uses_only_known_forms() {
  bad="$(route_rows | awk -F'|' '
    $2 !~ /^(semgrep:cc-[a-z-]+(,cc-[a-z-]+)*|llm-review|clj-watson|audit-only)$/ {
      print $1 " => " $2 }')"
  assertEquals "route must be semgrep:<id>[,<id>], llm-review, clj-watson or audit-only" \
    "" "${bad}"
}

test_every_semgrep_rule_named_actually_exists() {
  named="$(route_rows | awk -F'|' '$2 ~ /^semgrep:/ {sub(/^semgrep:/,"",$2); gsub(/,/,"\n",$2); print $2}' | sort -u)"
  known="$(printf '%s\n' ${CC_RULES} | sort -u)"
  unknown="$(comm -23 <(printf '%s\n' "${named}") <(printf '%s\n' "${known}"))"
  assertEquals "index names cc-* rules that do not exist upstream" "" "${unknown}"
}

test_every_cc_rule_is_claimed_by_some_class() {
  named="$(route_rows | awk -F'|' '$2 ~ /^semgrep:/ {sub(/^semgrep:/,"",$2); gsub(/,/,"\n",$2); print $2}' | sort -u)"
  known="$(printf '%s\n' ${CC_RULES} | sort -u)"
  orphaned="$(comm -13 <(printf '%s\n' "${named}") <(printf '%s\n' "${known}"))"
  assertEquals "CI rules with no class in the index — findings could not be triaged" \
    "" "${orphaned}"
}

test_clj_holmes_is_absent_from_the_skill() {
  # CI dropped it. A skill that still lists it as a pipeline tool teaches the
  # reader to expect coverage that is not there.
  assertEquals "clj-holmes must not appear in SKILL.md" \
    "0" "$(grep -c 'clj-holmes' "${SKILL}" || true)"
}
```

- [ ] **Step 2: Run it to verify it fails**

```bash
bash test/skill-taxonomy-ids_test.sh
```

Expected: the four new tests fail — there is no route column and `clj-holmes` still appears three times.

- [ ] **Step 3: Rewrite the class index table**

In `SKILL.md`, replace the class index table (header plus all 27 rows) with:

```markdown
| class | CWE | OWASP 2025 | route | ref |
|-------|-----|------------|-------|-----|
| `read-string-rce` | 94 | A05 | semgrep:cc-read-string | injection |
| `dynamic-eval` | 94 | A05 | semgrep:cc-load-string | injection |
| `sql-injection` | 89 | A05 | semgrep:cc-sql-string-concat | injection |
| `hiccup-injection` | 79 | A05 | semgrep:cc-hiccup-raw | injection |
| `cljs-dom-xss` | 79, 94 | A05 | semgrep:cc-cljs-innerhtml,cc-cljs-eval,cc-dangerously-set-html | injection |
| `command-injection` | 78, 77 | A05 | semgrep:cc-shell-exec | injection |
| `macro-runtime-input` | 94 | A05 | llm-review | injection |
| `xxe` | 611 | A02 | semgrep:cc-clojure-xml-xxe | injection |
| `java-deserialization` | 502 | A08 | semgrep:cc-nippy-thaw,cc-snakeyaml-unsafe | deserialization |
| `transitive-cve` | varies | A03 | clj-watson | deserialization |
| `atom-toctou` | 367 | (none) | llm-review | access-control |
| `spec-malli-leak` | 209, 550 | A10 | semgrep:cc-explain-data-response | exceptional-conditions |
| `missing-authn` | 306 | A07 | llm-review | access-control |
| `missing-authz` | 862 | A01 | llm-review | access-control |
| `incorrect-authz` | 863, 284 | A01 | llm-review | access-control |
| `idor` | 639 | A01 | llm-review | access-control |
| `csrf` | 352 | A01 | llm-review | access-control |
| `path-traversal` | 22 | A01 | semgrep:cc-path-traversal | access-control |
| `ssrf` | 918 | A01 | llm-review | access-control |
| `mass-assignment` | 915 | A08 | llm-review | access-control |
| `fail-open` | 636, 396 | A10 | semgrep:cc-generic-catch | exceptional-conditions |
| `security-misconfig` | 16, 614, 1004 | A02 | llm-review | config-and-ops |
| `logging-failures` | 778, 532 | A09 | llm-review | config-and-ops |
| `unrestricted-upload` | 434 | A06 | llm-review | config-and-ops |
| `resource-exhaustion` | 770, 400 | (none) | llm-review | config-and-ops |
| `weak-crypto` | 327, 328 | A04 | semgrep:cc-weak-crypto | config-and-ops |
| `insecure-tls-verification` | 295 | A07 | semgrep:cc-insecure-tls | config-and-ops |

`route` is how a finding in that class reaches you: `semgrep:<rule>` gates CI and
the local hooks; `llm-review` is covered by the Stop hook's per-turn review and
`/security-audit`; `clj-watson` runs only in `/security-audit`. 13 classes are
semgrep-detectable, 13 are `llm-review`, 1 is `clj-watson`.

`cc-path-traversal`, `cc-generic-catch` and `cc-clojure-xml-xxe` are **WARNING**
severity — advisory in CI and in the hooks. Without dataflow they cannot be
precise enough to gate a build.
```

- [ ] **Step 4: Replace the tool table**

Replace the `## Tool findings — coverage and blind spots` table's `clj-holmes` and `Semgrep` rows with a single row (drop the clj-holmes row entirely):

```markdown
| **Semgrep** | the only Clojure engine in CI: 16 first-party `cc-*` rules over `.clj`, `.cljs` and `.cljc` | no dataflow; **no namespace-alias resolution** — each rule enumerates aliases, so an unusual one is a silent miss. `cc-weak-crypto` and `cc-insecure-tls` are `pattern-regex` and can match inside a comment |
```

- [ ] **Step 5: Update the description and the judgment-layer line**

In the frontmatter `description`, change `clj-kondo / clj-holmes / gitleaks / clj-watson / Semgrep findings` to `clj-kondo / Semgrep / gitleaks / clj-watson findings`. Leave every other word of the description alone — the trigger phrasing is what makes the skill fire.

On line 12, change `The mechanical layer — \`clj-kondo\`, \`clj-holmes\`, \`gitleaks\`, \`clj-watson\`, Semgrep —` to `The mechanical layer — \`clj-kondo\`, Semgrep, \`gitleaks\`, \`clj-watson\` —`.

- [ ] **Step 6: Fix the index-consistency parser**

In `test/skill-index-consistency_test.sh`, change line 17 from:

```bash
    | awk -F'|' '{gsub(/[ `]/,"",$2); gsub(/ /,"",$5); print $2, $5}'
```

to:

```bash
    | awk -F'|' '{gsub(/[ `]/,"",$2); gsub(/ /,"",$6); print $2, $6}'
```

and update the comment on lines 13-14 to show the new row shape:

```bash
# Emit "class ref" for each index-table row. Rows look like:
#   | `read-string-rce` | 94 | A05 | semgrep:cc-read-string | injection |
```

- [ ] **Step 7: Run both skill tests**

```bash
bash test/skill-taxonomy-ids_test.sh && bash test/skill-index-consistency_test.sh
```

Expected: both `OK`. `test_skill_stays_lean` must still pass — the table gains no rows and the tool table loses one, so SKILL.md should be at or below its current 148 lines plus the ~8 explanatory lines added in Step 3. If it crosses 200, move the explanation into `taxonomy-coverage.md`.

- [ ] **Step 8: Full suite and commit**

```bash
for t in test/*_test.sh; do bash "$t" >/dev/null 2>&1 || echo "FAIL $t"; done; echo done
git add plugins/clojure-security/skills/clojure-security/SKILL.md \
        test/skill-taxonomy-ids_test.sh test/skill-index-consistency_test.sh
git commit -m "feat(clojure-security): class index records how each class is detected

A reader could not tell which classes CI gates, which the Stop-hook review
covers, and which only a manual audit reaches. The route column says so:
13 semgrep, 13 llm-review, 1 clj-watson.

Tests assert the column both ways against the 16 cc-* rule names — a class
naming a rule that does not exist, or a CI rule no class can triage, now
fails the build. The rule list is pinned rather than globbed because tests
must not touch the network.

The tool table's two stale rows collapse into one honest one: semgrep is the
only Clojure engine now, and its real blind spots are no dataflow and no
namespace-alias resolution."
```

---

### Task 8: Taxonomy coverage reference

**Files:**
- Create: `plugins/clojure-security/skills/clojure-security/references/taxonomy-coverage.md`
- Create: `test/taxonomy-coverage_test.sh`

**Interfaces:**
- Consumes: the `route` column from Task 7.
- Produces: two tables `/security-audit` reads in Task 9. Row format for the CWE table is `| <rank> | CWE-<id> | <class-or-marker> | <route> |`; markers are `(memory safety)` and `(no class)`.

- [ ] **Step 1: Write the failing test**

Create `test/taxonomy-coverage_test.sh`:

```bash
#!/usr/bin/env bash
# The class index maps class -> CWE -> OWASP. That answers "what is this
# finding?" but not "what did we fail to look at?" — so an audit could report
# `OWASP touched: A01, A05` and a reader could not tell a clean category from an
# unexamined one. taxonomy-coverage.md is the reverse index that closes that.
#
# It is only useful if it cannot drift from the forward index, so this test
# checks both directions, and pins the arithmetic the audit report quotes.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="${SCRIPT_DIR}/../plugins/clojure-security/skills/clojure-security"
SKILL="${SKILL_DIR}/SKILL.md"
COVERAGE="${SKILL_DIR}/references/taxonomy-coverage.md"

# "<rank>|<cwe>|<class>|<route>" per CWE Top 25 row.
cwe_rows() {
  grep -E '^\| [0-9]+ \| CWE-[0-9]+ \|' "${COVERAGE}" \
    | awk -F'|' '{gsub(/^ +| +$/,"",$2); gsub(/^ +| +$/,"",$3);
                  gsub(/^ +| +$/,"",$4); gsub(/^ +| +$/,"",$5);
                  print $2 "|" $3 "|" $4 "|" $5}'
}

# Class names mentioned anywhere in the coverage file's class columns.
coverage_classes() {
  grep -oE '`[a-z0-9-]+`' "${COVERAGE}" | tr -d '`' | sort -u
}

index_classes() {
  grep -E '^\| `[a-z0-9-]+` \|' "${SKILL}" \
    | awk -F'|' '{gsub(/[ `]/,"",$2); print $2}' | sort -u
}

test_coverage_file_exists() {
  assertTrue "references/taxonomy-coverage.md must exist" "[ -f '${COVERAGE}' ]"
}

test_all_25_ranks_present_exactly_once() {
  assertEquals "the CWE table must have 25 rows" "25" "$(cwe_rows | wc -l | tr -d ' ')"
  local dupes
  dupes="$(cwe_rows | awk -F'|' '{print $1}' | sort | uniq -d)"
  assertEquals "no rank may appear twice" "" "${dupes}"
  local missing i
  missing=""
  for i in $(seq 1 25); do
    cwe_rows | awk -F'|' -v r="$i" '$1 == r {found=1} END {exit !found}' \
      || missing="${missing}${i} "
  done
  assertEquals "every rank 1-25 must be present" "" "${missing% }"
}

test_nineteen_ranks_are_applicable_to_clojure() {
  # 25 minus the six memory-safety weaknesses the JVM manages. The audit report
  # quotes this number, so pin it.
  local na
  na="$(cwe_rows | grep -c '(memory safety)' || true)"
  assertEquals "6 entries must be marked (memory safety)" "6" "${na}"
}

test_the_memory_safety_entries_are_the_expected_six() {
  local got
  got="$(cwe_rows | awk -F'|' '$3 ~ /memory safety/ {print $2}' | sort | tr '\n' ' ')"
  assertEquals "the non-applicable set is fixed" \
    "CWE-120 CWE-121 CWE-122 CWE-125 CWE-416 CWE-787 " "${got}"
}

test_nine_applicable_ranks_are_llm_review_only() {
  # The headline claim of 0.12.0: these move from audit-only to per-turn review.
  local got
  got="$(cwe_rows | awk -F'|' '$4 == "llm-review" {print $2}' | sort | tr '\n' ' ')"
  assertEquals "the llm-review-only Top 25 set is fixed" \
    "CWE-284 CWE-306 CWE-352 CWE-434 CWE-639 CWE-770 CWE-862 CWE-863 CWE-918 " "${got}"
}

test_gaps_are_recorded_not_hidden() {
  # CWE-20 and CWE-476 have no class and must not silently look covered.
  assertEquals "CWE-20 must be marked (no class)" "1" \
    "$(cwe_rows | awk -F'|' '$2 == "CWE-20" && $3 ~ /no class/' | wc -l | tr -d ' ')"
  assertEquals "CWE-476 must be marked (no class)" "1" \
    "$(cwe_rows | awk -F'|' '$2 == "CWE-476" && $3 ~ /no class/' | wc -l | tr -d ' ')"
}

test_all_ten_owasp_categories_are_listed() {
  local missing c
  missing=""
  for c in A01 A02 A03 A04 A05 A06 A07 A08 A09 A10; do
    grep -q "| ${c} " "${COVERAGE}" || missing="${missing}${c} "
  done
  assertEquals "every OWASP 2025 category needs a row" "" "${missing% }"
}

test_every_class_in_the_index_appears_in_the_coverage_file() {
  local missing
  missing="$(comm -23 <(index_classes) <(coverage_classes))"
  assertEquals "classes in the index but absent from the reverse index" "" "${missing}"
}

test_every_class_in_the_coverage_file_is_a_real_class() {
  local invented
  invented="$(comm -13 <(index_classes) <(coverage_classes))"
  assertEquals "coverage file names classes the index does not define" "" "${invented}"
}

test_reverse_index_routes_agree_with_the_forward_index() {
  # A coverage matrix claiming a route the class index does not have is worse than
  # no matrix: it asserts coverage that does not exist. This is the check that
  # catches it — CWE-22 shipped claiming llm-review when `path-traversal` is
  # semgrep-only, because the row names one class and nothing cross-checked it.
  #
  # A row naming several classes may legitimately be mixed (rank 10 aggregates
  # three semgrep classes and one llm-review one), so the rule is presence-based
  # in both directions rather than string equality.
  local bad rank cwe classes route c fwd want_llm want_semgrep want_watson
  bad=""
  while IFS='|' read -r rank cwe classes route; do
    [ -z "${rank}" ] && continue
    case "${classes}" in *"not applicable"*|*"no class"*) continue ;; esac

    want_llm=0
    want_semgrep=0
    want_watson=0
    for c in $(printf '%s' "${classes}" | grep -oE '`[a-z0-9-]+`' | tr -d '`'); do
      fwd="$(awk -F'|' -v k="${c}" '
        /^\| `/ { gsub(/[ `]/,"",$2); if ($2 == k) { gsub(/ /,"",$5); print $5 } }' "${SKILL}")"
      case "${fwd}" in
        llm-review) want_llm=1 ;;
        semgrep:*)  want_semgrep=1 ;;
        clj-watson) want_watson=1 ;;
      esac
    done

    # All three axes, both directions. Checking only llm-review would still let a
    # row whose classes are all llm-review claim `semgrep+llm-review` and pass —
    # the same over-claim on the other axis. The clj-watson axis matters even
    # though no current CWE row uses it: without it, appending `+clj-watson` to a
    # Top 25 row fabricated a dependency-scan claim that nothing noticed.
    case "${route}" in
      *llm-review*)
        if [ "${want_llm}" -eq 0 ]; then
          bad="${bad}rank ${rank}: claims llm-review but no named class routes there"$'\n'
        fi ;;
      *)
        if [ "${want_llm}" -eq 1 ]; then
          bad="${bad}rank ${rank}: omits llm-review but a named class routes there"$'\n'
        fi ;;
    esac

    case "${route}" in
      *semgrep*)
        if [ "${want_semgrep}" -eq 0 ]; then
          bad="${bad}rank ${rank}: claims semgrep but no named class routes there"$'\n'
        fi ;;
      *)
        if [ "${want_semgrep}" -eq 1 ]; then
          bad="${bad}rank ${rank}: omits semgrep but a named class routes there"$'\n'
        fi ;;
    esac

    case "${route}" in
      *clj-watson*)
        if [ "${want_watson}" -eq 0 ]; then
          bad="${bad}rank ${rank}: claims clj-watson but no named class routes there"$'\n'
        fi ;;
      *)
        if [ "${want_watson}" -eq 1 ]; then
          bad="${bad}rank ${rank}: omits clj-watson but a named class routes there"$'\n'
        fi ;;
    esac
  done < <(cwe_rows)

  assertEquals "reverse-index routes must agree with the class index" \
    "" "$(printf '%s' "${bad}" | awk 'NF')"
}

# "<category>|<classes>|<route>" per OWASP row.
owasp_rows() {
  grep -E '^\| A(0[1-9]|10) ' "${COVERAGE}" \
    | awk -F'|' '{gsub(/^ +| +$/,"",$2); gsub(/^ +| +$/,"",$3); gsub(/^ +| +$/,"",$4);
                  print $2 "|" $3 "|" $4}'
}

test_owasp_routes_agree_with_the_forward_index() {
  # The CWE table is route-enforced; without this the OWASP half of the same file
  # was hand-verified only. Both halves feed /security-audit's Coverage rollup, so
  # an unguarded OWASP route drifts into a report that claims coverage it lacks —
  # and a future editor would reasonably assume both tables are guarded alike.
  local bad cat classes route c fwd want_llm want_semgrep want_watson
  bad=""
  while IFS='|' read -r cat classes route; do
    [ -z "${cat}" ] && continue

    want_llm=0
    want_semgrep=0
    want_watson=0
    for c in $(printf '%s' "${classes}" | grep -oE '`[a-z0-9-]+`' | tr -d '`'); do
      fwd="$(awk -F'|' -v k="${c}" '
        /^\| `/ { gsub(/[ `]/,"",$2); if ($2 == k) { gsub(/ /,"",$5); print $5 } }' "${SKILL}")"
      case "${fwd}" in
        llm-review) want_llm=1 ;;
        semgrep:*)  want_semgrep=1 ;;
        clj-watson) want_watson=1 ;;
      esac
    done

    case "${route}" in
      *llm-review*) [ "${want_llm}" -eq 1 ] || bad="${bad}${cat}: claims llm-review, unbacked"$'\n' ;;
      *)            [ "${want_llm}" -eq 0 ] || bad="${bad}${cat}: omits llm-review"$'\n' ;;
    esac
    case "${route}" in
      *semgrep*) [ "${want_semgrep}" -eq 1 ] || bad="${bad}${cat}: claims semgrep, unbacked"$'\n' ;;
      *)         [ "${want_semgrep}" -eq 0 ] || bad="${bad}${cat}: omits semgrep"$'\n' ;;
    esac
    case "${route}" in
      *clj-watson*) [ "${want_watson}" -eq 1 ] || bad="${bad}${cat}: claims clj-watson, unbacked"$'\n' ;;
      *)            [ "${want_watson}" -eq 0 ] || bad="${bad}${cat}: omits clj-watson"$'\n' ;;
    esac
  done < <(owasp_rows)

  assertEquals "OWASP routes must agree with the class index" \
    "" "$(printf '%s' "${bad}" | awk 'NF')"
}

test_no_class_rows_claim_no_route() {
  # CWE-20 and CWE-476 hit the `continue` guard in the route check, so nothing
  # otherwise asserts their route stays n/a — a row could be labelled "(no class)"
  # and still claim coverage.
  local bad
  bad="$(cwe_rows | awk -F'|' '$3 ~ /no class|not applicable/ && $4 != "n/a" {print $1 " => " $4}')"
  assertEquals "rows with no class must route to n/a" "" "${bad}"
}

test_ranks_match_mitre() {
  # The file's headline claim is "Ranks are MITRE's, not ours" — and nothing
  # enforced it. Reversing all 25 rank labels left the whole suite green, so the
  # ordering rested entirely on a one-time manual check. A transposed rank makes
  # this file actively misleading rather than merely incomplete.
  #
  # Pinned from https://cwe.mitre.org/top25/archive/2025/2025_cwe_top25.html,
  # fetched 2026-07-29. Do not edit to match the table; edit the table.
  local expected actual
  expected="1 CWE-79
2 CWE-89
3 CWE-352
4 CWE-862
5 CWE-787
6 CWE-22
7 CWE-416
8 CWE-125
9 CWE-78
10 CWE-94
11 CWE-120
12 CWE-434
13 CWE-476
14 CWE-121
15 CWE-502
16 CWE-122
17 CWE-863
18 CWE-20
19 CWE-284
20 CWE-200
21 CWE-306
22 CWE-918
23 CWE-77
24 CWE-639
25 CWE-770"
  actual="$(cwe_rows | awk -F'|' '{print $1, $2}' | sort -n)"
  assertEquals "rank -> CWE must match the MITRE 2025 Top 25" "${expected}" "${actual}"
}

test_owasp_titles_match_owasp_org() {
  # Only the A0N code was checked, never the title after it. "A01 Some Bogus
  # Title" passed. Pinned from https://owasp.org/Top10/2025/, fetched 2026-07-29,
  # and cross-checked against metadata.owasp in the CI rules.
  local expected actual
  expected="A01 Broken Access Control
A02 Security Misconfiguration
A03 Software Supply Chain Failures
A04 Cryptographic Failures
A05 Injection
A06 Insecure Design
A07 Authentication Failures
A08 Software or Data Integrity Failures
A09 Security Logging and Alerting Failures
A10 Mishandling of Exceptional Conditions"
  actual="$(owasp_rows | awk -F'|' '{print $1}' | sort)"
  assertEquals "OWASP titles must match owasp.org/Top10/2025" "${expected}" "${actual}"
}

test_each_class_carries_the_cwe_of_its_row() {
  # A class could be swapped for a different REAL class with the same route and go
  # unnoticed, because the completeness checks only require every class to appear
  # somewhere in the file. Rank 15 (CWE-502) accepted `sql-injection` in place of
  # `java-deserialization`, silently reassigning deserialization coverage to the
  # SQL-injection detector.
  #
  # `partial` rows are exempt by design: CWE-200's row names child weaknesses
  # (CWE-209/550, CWE-532/778) rather than CWE-200 itself, which is the point of
  # labelling it partial.
  local bad rank cwe classes route c id fwdcwe
  bad=""
  while IFS='|' read -r rank cwe classes route; do
    [ -z "${rank}" ] && continue
    case "${classes}" in
      *"not applicable"*|*"no class"*|*partial*) continue ;;
    esac
    id="${cwe#CWE-}"
    for c in $(printf '%s' "${classes}" | grep -oE '`[a-z0-9-]+`' | tr -d '`'); do
      fwdcwe="$(awk -F'|' -v k="${c}" '
        /^\| `/ { gsub(/[ `]/,"",$2); if ($2 == k) { gsub(/ /,"",$3); print $3 } }' "${SKILL}")"
      case ",${fwdcwe}," in
        *",${id},"*) ;;
        *) bad="${bad}rank ${rank} (${cwe}): ${c} does not carry that CWE"$'\n' ;;
      esac
    done
  done < <(cwe_rows)

  assertEquals "each class must carry its row's CWE" \
    "" "$(printf '%s' "${bad}" | awk 'NF')"
}

test_sources_are_cited() {
  # Six CWE-to-OWASP mappings in this plugin were wrong on inference before
  # being checked. Taxonomy data gets a source line or it does not go in.
  assertContains "the CWE table must cite mitre" \
    "$(cat "${COVERAGE}")" "cwe.mitre.org"
  assertContains "the OWASP table must cite owasp.org" \
    "$(cat "${COVERAGE}")" "owasp.org"
}

. "${SCRIPT_DIR}/../lib/shunit2"
```

- [ ] **Step 2: Run it to verify it fails**

```bash
bash test/taxonomy-coverage_test.sh
```

Expected: all fail — the file does not exist.

- [ ] **Step 3: Write the coverage reference**

Create `plugins/clojure-security/skills/clojure-security/references/taxonomy-coverage.md`:

```markdown
# Taxonomy coverage — the reverse index

The class index in `SKILL.md` answers "what is this finding?". This file answers
"what did we fail to look at?" — which is the question an audit run has to
answer to be usable as evidence. `checked, clean` and `never examined` are
different claims and must not print the same way.

Read by `/security-audit` for its Coverage section. Not needed to triage a
single finding.

## CWE Top 25 (2025)

Verified against `https://cwe.mitre.org/top25/archive/2025/2025_cwe_top25.html`
on 2026-07-29. Ranks are MITRE's, not ours.

19 of 25 are applicable to Clojure. The six that are not are memory-safety
weaknesses the JVM manages; they are listed rather than dropped so their absence
is a recorded judgment instead of an oversight.

| rank | CWE | class | route |
|------|-----|-------|-------|
| 1 | CWE-79 | `hiccup-injection`, `cljs-dom-xss` | semgrep |
| 2 | CWE-89 | `sql-injection` | semgrep |
| 3 | CWE-352 | `csrf` | llm-review |
| 4 | CWE-862 | `missing-authz` | llm-review |
| 5 | CWE-787 | (memory safety) | n/a |
| 6 | CWE-22 | `path-traversal` | semgrep (WARNING) |
| 7 | CWE-416 | (memory safety) | n/a |
| 8 | CWE-125 | (memory safety) | n/a |
| 9 | CWE-78 | `command-injection` | semgrep |
| 10 | CWE-94 | `read-string-rce`, `dynamic-eval`, `cljs-dom-xss`, `macro-runtime-input` | semgrep+llm-review |
| 11 | CWE-120 | (memory safety) | n/a |
| 12 | CWE-434 | `unrestricted-upload` | llm-review |
| 13 | CWE-476 | (no class) | n/a |
| 14 | CWE-121 | (memory safety) | n/a |
| 15 | CWE-502 | `java-deserialization` | semgrep |
| 16 | CWE-122 | (memory safety) | n/a |
| 17 | CWE-863 | `incorrect-authz` | llm-review |
| 18 | CWE-20 | (no class) | n/a |
| 19 | CWE-284 | `incorrect-authz` | llm-review |
| 20 | CWE-200 | `spec-malli-leak` (209, 550), `logging-failures` (532, 778) — partial | semgrep+llm-review |
| 21 | CWE-306 | `missing-authn` | llm-review |
| 22 | CWE-918 | `ssrf` | llm-review |
| 23 | CWE-77 | `command-injection` | semgrep |
| 24 | CWE-639 | `idor` | llm-review |
| 25 | CWE-770 | `resource-exhaustion` | llm-review |

**The two real gaps.** CWE-476 (NULL pointer dereference) is a correctness
concern that `clj-kondo` and `*warn-on-reflection*` address; it is not modelled
as a security class here. CWE-20 (improper input validation) is a parent
category whose Clojure-specific children — `read-string-rce`, `sql-injection`,
`mass-assignment` — each have their own class, so a CWE-20 class would only
duplicate them. Neither is covered. Report them as gaps; do not invent a class.

**CWE-200 is partial.** `spec-malli-leak` and `logging-failures` cover two
specific exposure routes. A deliberate over-broad API response that leaks fields
is neither, and is only caught by reading the handler.

## OWASP Top 10:2025

Category titles verified against `https://owasp.org/Top10/2025/` on 2026-07-29,
and cross-checked against `metadata.owasp` in the CI rules. All ten categories
have at least one class.

| category | classes | route |
|----------|---------|-------|
| A01 Broken Access Control | `missing-authz`, `incorrect-authz`, `idor`, `csrf`, `path-traversal`, `ssrf` | llm-review + semgrep (WARNING) |
| A02 Security Misconfiguration | `xxe`, `security-misconfig` | semgrep (WARNING) + llm-review |
| A03 Software Supply Chain Failures | `transitive-cve` | clj-watson |
| A04 Cryptographic Failures | `weak-crypto` | semgrep |
| A05 Injection | `read-string-rce`, `dynamic-eval`, `sql-injection`, `hiccup-injection`, `cljs-dom-xss`, `command-injection`, `macro-runtime-input` | semgrep + llm-review |
| A06 Insecure Design | `unrestricted-upload` | llm-review |
| A07 Authentication Failures | `missing-authn`, `insecure-tls-verification` | llm-review + semgrep |
| A08 Software or Data Integrity Failures | `java-deserialization`, `mass-assignment` | semgrep + llm-review |
| A09 Security Logging and Alerting Failures | `logging-failures` | llm-review |
| A10 Mishandling of Exceptional Conditions | `spec-malli-leak`, `fail-open` | semgrep (one ERROR, one WARNING) |

`atom-toctou` (CWE-367) and `resource-exhaustion` (CWE-770, 400) map to no 2025
category. That is a fact about the taxonomy, not a coverage gap.

## How to report this

Three states, and never collapse the last two:

- **`findings (n)`** — looked, found something.
- **`checked, clean`** — looked, found nothing.
- **`not reachable`** — did not look. Either no class exists, the class is
  `clj-watson` and the tool is missing, or the scope excluded the relevant files.

A category with no class and a category with a clean result must never print the
same way.
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
bash test/taxonomy-coverage_test.sh
```

Expected: `Ran 16 tests.` / `OK` — ten from the brief, plus the CWE and OWASP route checks, the no-class-route invariant, the pinned MITRE rank table, the pinned OWASP titles, and the class-carries-its-CWE check.

- [ ] **Step 5: Confirm the index-consistency test still holds**

`taxonomy-coverage.md` has no `### class-name` headings, so `ref_headings()` in `skill-index-consistency_test.sh` must not pick it up. It skips only `route-inventory`, so verify:

```bash
grep -cE '^### [a-z0-9-]+$' plugins/clojure-security/skills/clojure-security/references/taxonomy-coverage.md
bash test/skill-index-consistency_test.sh
```

Expected: `0`, then `OK`. If the count is not 0, either rename those headings or add `taxonomy-coverage` to the skip list next to `route-inventory`.

- [ ] **Step 6: Full suite and commit**

```bash
for t in test/*_test.sh; do bash "$t" >/dev/null 2>&1 || echo "FAIL $t"; done; echo done
git add plugins/clojure-security/skills/clojure-security/references/taxonomy-coverage.md \
        test/taxonomy-coverage_test.sh
git commit -m "feat(clojure-security): add the CWE/OWASP reverse index

The forward index answers 'what is this finding?'. Nothing answered 'what
did we fail to look at?', so an audit could print 'OWASP touched: A01, A05'
and a reader could not tell a clean category from an unexamined one.

19 of the 25 Top 25 entries are applicable to Clojure; 6 are memory-safety
weaknesses the JVM manages, listed rather than dropped so their absence is a
recorded judgment. CWE-20 and CWE-476 are recorded as genuine gaps and
CWE-200 as partial — the point of a reverse index is that an absence becomes
visible instead of invisible.

Both tables carry a source URL and date. Ranks come from mitre.org and
category titles from owasp.org, not from memory: six mappings in this plugin
were already wrong on inference once."
```

---

### Task 9: /security-audit alignment

**Files:**
- Modify: `plugins/clojure-security/commands/security-audit.md` — Step 5 table (lines 55-65), report template (lines 90-91, 115-119), tag note (lines 129-131)

- [ ] **Step 1: Write the failing test**

Create `test/security-audit-alignment_test.sh` — its own file, not appended to
`taxonomy-coverage_test.sh`: these assert the audit *command*, not the taxonomy
data, and a file that tests both drifts into a grab bag.

```bash
#!/usr/bin/env bash
# Tests for plugins/clojure-security/commands/security-audit.md
#
# The command is prose, so these are text assertions. They exist because an
# audit that contradicts CI is worse than no audit: it re-litigates decisions a
# developer already made and teaches them to distrust the report.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AUDIT="${SCRIPT_DIR}/../plugins/clojure-security/commands/security-audit.md"

test_audit_does_not_run_clj_holmes() {
  assertEquals "clj-holmes must be gone from the audit command" \
    "0" "$(grep -c 'clj-holmes' "${AUDIT}" || true)"
}

test_audit_semgrep_row_mirrors_ci() {
  local body; body="$(cat "${AUDIT}")"
  assertContains "must not gate semgrep on a .semgrep.yml" \
    "${body}" "cc-rules"
  assertContains "must mirror CI's registry configs" "${body}" "p/owasp-top-ten"
  assertContains "must mirror CI's registry configs" "${body}" "p/default"
  assertNotContains "the old skip-unless-.semgrep.yml rule must be gone" \
    "${body}" "Skip unless the repo has a"
}

test_audit_handles_nosemgrep_suppressions() {
  assertContains "the audit must not report suppressed findings as live" \
    "$(cat "${AUDIT}")" "nosemgrep"
}

test_audit_reads_the_reverse_index() {
  assertContains "Coverage must be driven by taxonomy-coverage.md" \
    "$(cat "${AUDIT}")" "taxonomy-coverage.md"
}

test_audit_distinguishes_clean_from_unexamined() {
  local body; body="$(cat "${AUDIT}")"
  assertContains "must have a clean state" "${body}" "checked, clean"
  assertContains "must have an unexamined state" "${body}" "not reachable"
}

. "${SCRIPT_DIR}/../lib/shunit2"
```

- [ ] **Step 2: Run it to verify it fails**

```bash
bash test/security-audit-alignment_test.sh
```

Expected: all five tests fail.

- [ ] **Step 3: Replace the Step 5 tool table**

In `plugins/clojure-security/commands/security-audit.md`, replace the table body (lines 57-61) with:

```markdown
| `clj-kondo` | `clj-kondo --lint <scope>` — capture warnings + errors |
| `semgrep` | **The primary Clojure engine — run it whenever it is installed.** Resolve the cleancoders rules the way the hooks do: `$CC_SEMGREP_RULES_DIR` if set, else `/tmp/cc-semgrep-rules-v1` if non-empty, else fetch it (see `hooks/lib/semgrep-rules.sh`). Then mirror CI: `semgrep scan --json --config <cc-rules> --config p/owasp-top-ten --config p/default <scope>`. Add `--config .security-rules` when that directory exists — CI passes it as a fourth config (`extra-rules-dir`, default `.security-rules`), so skipping it audits blind to rules the PR enforces |
| `gitleaks` | `gitleaks detect --no-banner --redact --source <scope>` (use `--no-git` for non-git paths) |
| `clj-watson` | Only on `all` scope: `clj-watson scan -p deps.edn -o stdout` (or the project's `:clj-watson` deps alias) — SCA against `deps.edn` |
```

Immediately after the table, before the `If a tool is missing` line, insert:

```markdown
**Severity from semgrep.** 13 `cc-*` rules are `ERROR` and gate CI. Three —
`cc-path-traversal`, `cc-generic-catch`, `cc-clojure-xml-xxe` — are `WARNING` and
deliberately do **not** gate: without dataflow they cannot be precise enough.
Report them, but never as blocking.

**What actually blocks a PR.** CI's gate is not limited to the `cc-*` set.
`bin/report-sarif.sh` counts every unsuppressed `error`-level result across *all*
configs, so an ERROR from `p/owasp-top-ten` or `p/default` blocks a PR too. What
decides blocking is a rule's severity, not which pack it came from.

**Suppressions.** A finding suppressed in source with a `nosemgrep` annotation is
absent from `--json` output and excluded from CI's table and exit code. Do not
resurrect it. Reporting a suppressed finding as live contradicts CI and
re-litigates a decision a developer already made — list it under **False
positives considered** with `suppressed in source` as the reason, if at all.

**No namespace-alias resolution.** Semgrep enumerates aliases per rule; an
unusual alias is a silent miss. When the pattern sweep in Step 3 finds a sink
that semgrep did not report, trust the sweep.
```

- [ ] **Step 4: Rewrite the Coverage section of the report template**

Replace lines 115-119 with:

```markdown
## Coverage
  Classes checked:  <n> of 27
  Classes skipped:  <list with one-clause reasons>

  CWE Top 25 (2025) — 19 of 25 applicable to Clojure
    findings:        <#rank CWE-<id> list>
    checked, clean:  <#rank CWE-<id> list>
    not reachable:   <#rank CWE-<id> list, with a one-clause reason each>
    no class:        CWE-476 (#13), CWE-20 (#18)
    not applicable:  CWE-787, 416, 125, 120, 121, 122 (memory safety)

  OWASP Top 10:2025
    A01  <findings (n) | checked, clean | not reachable — reason>
    A02  …
    A03  …
    A04  …
    A05  …
    A06  …
    A07  …
    A08  …
    A09  …
    A10  …
```

And line 90-91:

```markdown
  Tools run:     clj-kondo (v…)  semgrep (v…)  gitleaks (v…)
  Tools missing: clj-watson
```

- [ ] **Step 4b: Add a de-duplication rule**

Step 3's pattern sweep and Step 5's semgrep run overlap on several sinks, so the
same `file:line` can surface from both. The command already says what to do when
the sweep finds a sink semgrep missed; it says nothing about the reverse overlap.
Immediately after the existing `**Severity tone:**` paragraph, add:

```markdown
**One sink, one line.** Step 3's pattern sweep and Step 5's semgrep run overlap on
several sinks, so the same `file:line` can surface from both. Report it once. A
duplicated finding inflates the count and makes the report read as padded.
```

- [ ] **Step 5: Update the tag-sourcing note**

Replace lines 129-131 with:

```markdown
**CWE / OWASP tags** come from the class index table in `SKILL.md` — read them
from that table, never from memory.

**The Coverage rollup** comes from `references/taxonomy-coverage.md`. Load it and
use its three states literally: `findings (n)`, `checked, clean`, `not reachable`.
Never collapse the last two. A category with no class and a category with a clean
result must not print the same way — that distinction is what makes an audit run
usable as evidence rather than a list, and the current report is the only place a
reader can learn that 10 of the applicable Top 25 entries need human eyes.
```

- [ ] **Step 6: Run the test to verify it passes**

```bash
bash test/security-audit-alignment_test.sh
```

Expected: `Ran 5 tests.` / `OK`

- [ ] **Step 7: Full suite and commit**

```bash
for t in test/*_test.sh; do bash "$t" >/dev/null 2>&1 || echo "FAIL $t"; done; echo done
git add plugins/clojure-security/commands/security-audit.md test/security-audit-alignment_test.sh
git commit -m "feat(clojure-security): /security-audit mirrors CI and rolls up taxonomy

Step 5 told the auditor to skip semgrep unless the repo had a .semgrep.yml.
Semgrep is now the only Clojure engine in CI, so that instruction produced
an audit blind to everything a PR would catch. It now resolves the cc-* rules
the way the hooks do and runs CI's full config set.

Suppression handling is explicit: nosemgrep findings are excluded from CI's
table and exit code, and an audit that reports them as live re-litigates a
decision a developer already made.

Coverage becomes a three-state rollup over the reverse index. 'checked,
clean' and 'not reachable' were previously indistinguishable, which let a
report imply coverage it did not have."
```

---

### Task 10: Remaining stale references

**Files:**
- Modify: `plugins/clojure-security/skills/clojure-security/references/config-and-ops.md:179,225`
- Modify: `plugins/clojure-security/README.md:6,27,37,42,52,55`

- [ ] **Step 1: Write the failing test**

Create `test/no-clj-holmes_test.sh` — its own file. This is a plugin-wide
invariant, not a fact about the taxonomy data or the audit command, and it is the
one test that will still be meaningful years from now.

```bash
#!/usr/bin/env bash
# Definition of done #1 from the handoff brief: no file in the plugin claims
# clj-holmes is part of CI. A stale attribution is worse than silence — it tells
# the reader a finding will be caught by something that no longer runs, and it
# points them at software abandoned since October 2022.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN="${SCRIPT_DIR}/../plugins/clojure-security"

test_no_plugin_file_credits_clj_holmes_for_ci() {
  # Two deliberate exemptions:
  #   - CHANGES is history and must keep its record of why the tool was dropped.
  #   - clj-watson genuinely lives at github.com/clj-holmes/clj-watson. That URL
  #     is correct and must not be "fixed"; strip the substring before matching
  #     rather than weakening the invariant for every other file.
  local hits f body
  hits=""
  for f in $(find "${PLUGIN}" -type f ! -name CHANGES); do
    body="$(sed 's|clj-holmes/clj-watson||g' "${f}" 2>/dev/null)"
    case "${body}" in
      *clj-holmes*) hits="${hits}${f}"$'\n' ;;
    esac
  done
  assertEquals "these files still reference clj-holmes" "" "$(printf '%s' "${hits}" | awk 'NF')"
}

test_detected_in_ci_lines_name_real_cc_rules() {
  # Every "Detected in CI by" line must name a cc-* rule. injection.md already
  # used this form; config-and-ops.md credited clj-holmes rules by name.
  local bad
  bad="$(grep -rhn 'Detected in CI by' "${PLUGIN}/skills" 2>/dev/null \
    | grep -v 'cc-' || true)"
  assertEquals "CI attributions must name a cc-* rule" "" "${bad}"
}

. "${SCRIPT_DIR}/../lib/shunit2"
```

- [ ] **Step 2: Run it to verify it fails**

```bash
bash test/no-clj-holmes_test.sh
```

Expected: both tests fail, listing `config-and-ops.md` and `README.md`.

- [ ] **Step 3: Fix config-and-ops.md**

Replace lines 179-182:

```
Detected in CI by upstream clj-holmes rules: `weak-hash-function-md5`,
`weak-hash-function-sha1`, `deprecated-blowfish`, `deprecated-desede`, and
`ecb-mode-of-operation`. This class exists so those findings can be triaged rather
than merely reported.
```

with:

```
**Detected in CI by:** `cc-weak-crypto` (semgrep). One `pattern-regex` rule
covers MD2/MD4/MD5/SHA-1 digests and DES, DESede, Blowfish, RC2, RC4 and ECB-mode
ciphers. Being a regex, it can match inside a comment — and it cannot see a
weak algorithm assembled from a variable.
```

Replace lines 225-226:

```
Detected in CI by upstream clj-holmes rules `clojure-weak-ssl-context` and
`insecure-hostname-verifier`.
```

with:

```
**Detected in CI by:** `cc-insecure-tls` (semgrep). Covers obsolete
`SSLContext/getInstance` protocol strings, a `HostnameVerifier` that returns
`true`, `setDefaultHostnameVerifier`, and `{:insecure? true}` in a client opts
map.
```

- [ ] **Step 4: Fix README.md**

- Line 6: `\`clj-holmes\`, \`gitleaks\`, \`clj-watson\`, and Semgrep.` → `Semgrep, \`gitleaks\`, \`clj-watson\`, and \`clj-kondo\`.`
- Line 27: `**\`Stop\` hook (clj-holmes + gitleaks)**` → `**\`Stop\` hook (semgrep + gitleaks + LLM review)**`, and extend its description: the semgrep scan uses the 16 cleancoders `cc-*` rules with `ERROR` blocking and `WARNING` advisory, and the LLM review covers the 13 classes no scanner reaches, scoped to the files edited that turn.
- Line 37: `\`clj-holmes\`, \`clj-holmes\` rules dir, \`gitleaks\`, \`clj-watson\`, \`jq\`` → `\`semgrep\`, \`gitleaks\`, \`clj-watson\`, \`jq\``
- Line 42: `and clj-holmes against the staged index` → `and semgrep against the staged index`
- Line 52: replace the whole clj-holmes bullet with:

```markdown
- [`semgrep`](https://semgrep.dev) — the Clojure engine. The hooks run the 16
  first-party `cc-*` rules from
  [`cleancoders/github-actions`](https://github.com/cleancoders/github-actions)
  at tag `v1` — the same rules and the same ref your PR check uses, so a local
  scan and a PR cannot disagree. They are fetched and cached on first scan; set
  `CC_SEMGREP_RULES_DIR` to a `cleancoders/github-actions` checkout to skip the
  fetch. `ERROR` findings block; `cc-path-traversal`, `cc-generic-catch` and
  `cc-clojure-xml-xxe` are `WARNING` and advisory, exactly as in CI.
```

- Line 55: delete the now-duplicate `- [\`semgrep\`](https://semgrep.dev) — pattern-based SAST` bullet.

Then add a section documenting the review and its opt-out:

```markdown
### Per-turn review of the scanner-blind classes

13 of the skill's 27 vulnerability classes have no scanner: access control, SSRF,
mass assignment, logging failures and the rest need dataflow, namespace-alias
resolution or whole-route reasoning that semgrep cannot do. Nine are CWE Top 25
entries. They used to be reachable only by running `/security-audit` by hand.

`turn-ledger.sh` records which Clojure files each turn edited; the `Stop` hook
reviews exactly those, once, and reports through the `clojure-security` skill.
Scope is the turn's edits rather than the session diff, so nothing is reviewed
twice.

Set `CC_SKIP_DIFF_REVIEW=1` to turn it off. Files changed by `Bash` rather than
by an edit tool do not enter the ledger; semgrep still scans those.
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
bash test/no-clj-holmes_test.sh
```

Expected: `Ran 2 tests.` / `OK`

- [ ] **Step 6: Full suite and commit**

```bash
for t in test/*_test.sh; do bash "$t" >/dev/null 2>&1 || echo "FAIL $t"; done; echo done
git add plugins/clojure-security/skills/clojure-security/references/config-and-ops.md \
        plugins/clojure-security/README.md test/no-clj-holmes_test.sh
git commit -m "docs(clojure-security): CI attributions name the rules that run

weak-crypto and insecure-tls-verification credited five clj-holmes rules
between them. Two of those five — deprecated-blowfish and deprecated-desede —
never matched anything even when clj-holmes ran, which is part of why it was
replaced. Both classes are now cc-weak-crypto and cc-insecure-tls, with their
pattern-regex limits stated so a reader knows what the rule cannot see.

A test now fails the build if any plugin file outside CHANGES mentions
clj-holmes, or if a 'Detected in CI by' line names something that is not a
cc-* rule."
```

---

### Task 11: Release

**Files:**
- Modify: `plugins/clojure-security/VERSION`, `plugins/clojure-security/CHANGES`

- [ ] **Step 1: Final full-suite run**

```bash
for t in test/*_test.sh; do echo "== $t"; bash "$t" 2>&1 | tail -3; done
```

Expected: every file ends `OK`. Read the counts — a file reporting `Ran 0 tests` means a `startSkipping` guard fired and that file proved nothing.

- [ ] **Step 2: Prove the hooks work against a real repo**

The suite stubs semgrep. Prove the real thing once, end to end:

```bash
cd ~/current-projects/poker 2>/dev/null || cd ~/current-projects/c3kit-apron
printf '{"cwd":"%s","stop_hook_active":false}' "$PWD" \
  | CC_SEMGREP_RULES_DIR=~/current-projects/github-actions/security-rules/semgrep \
    CC_SKIP_DIFF_REVIEW=1 \
    bash ~/current-projects/agent-plugins/plugins/clojure-security/hooks/security-stop.sh
echo "exit: $?"
```

Expected: exit 0 on a clean repo, or a readable report with bare `cc-*` rule
names and repo-relative paths. A stack trace, a `jq` parse error, or a rule name
containing `.Users.` means something in Task 2 is wrong.

- [ ] **Step 3: Bump the version**

```bash
printf '0.12.0\n' > plugins/clojure-security/VERSION
```

- [ ] **Step 4: Prepend the CHANGES entry**

Add at the top of `plugins/clojure-security/CHANGES`, above `## 0.11.0`:

```
## 0.12.0
  * The hooks now scan with semgrep and the 16 cleancoders `cc-*` rules instead
    of clj-holmes, matching what CI actually runs. Local enforcement had become a
    strictly weaker subset: clj-holmes reads only `*.clj`, silently skipping
    `.cljs` and `.cljc` — and its edamame call omits `:read-cond`, so `.cljc`
    fails to parse even when renamed, with the failure swallowed. That is where
    CWE-79 (#1 on the CWE Top 25) and c3kit's shared domain logic live, so a
    `.cljc`-heavy repo scanned clean. All 10 upstream clj-holmes security rules
    are subsumed by the replacements; the only rule left behind is a Prismatic
    schema require typo, which is not security.
  * Severity mirrors CI exactly. The 13 ERROR rules block; `cc-path-traversal`,
    `cc-generic-catch` and `cc-clojure-xml-xxe` are advisory. Those three are
    non-blocking in CI on purpose — without dataflow they cannot be precise
    enough to gate a build, and `cc-generic-catch` fires on ordinary
    `(catch Exception e ...)`. A local gate stricter than the pipeline gets
    muted, which costs more than it buys.
  * Rules are resolved at run time rather than vendored: `CC_SEMGREP_RULES_DIR`,
    then a `/tmp` cache, then a fetch of tag `v1` — the same ref the four
    consumer repos pin, so local and CI cannot drift to different rule versions.
    Vendoring a copy would have meant two sources of truth for the rule set,
    with no way to detect divergence offline. Every failure degrades to skipping
    the Clojure scan; an unreachable GitHub never fails a turn.
  * **New: the Stop hook now reviews the 13 classes no scanner can reach.**
    Access control, SSRF, mass assignment, logging failures, TOCTOU and the rest
    need dataflow, namespace-alias resolution or whole-route reasoning that
    semgrep cannot do. Nine of them are CWE Top 25 entries — CWE-352, 862, 434,
    863, 284, 306, 918, 639, 770 — and they were reachable only by running
    `/security-audit` by hand, which nothing triggers. Being an agent plugin
    rather than a CI config is precisely what makes this possible, and it was
    the capability the plugin was not using.
  * Review scope is the turn's edits, not the session diff. A new `PostToolUse`
    ledger records which Clojure files each turn changed, because the Stop hook's
    diff is cumulative and reviewing it would re-review turn 3's files again on
    turn 40, forever. The ledger is drained unconditionally before the decision
    to review, so a suppressed turn cannot bank work into the next one, and the
    directive is one-shot per turn since it has no findings to clear.
    `CC_SKIP_DIFF_REVIEW=1` opts out. Files changed by `Bash` rather than an edit
    tool do not enter the ledger; semgrep still scans those.
  * The class index records how each class is detected — `semgrep:<rule>`,
    `llm-review`, or `clj-watson`. A reader could not previously tell which
    classes CI gates from which need human eyes. Tests assert the column against
    the 16 `cc-*` rule names in both directions, so a class naming a rule that
    does not exist, or a CI rule no class can triage, fails the build.
  * Adds `references/taxonomy-coverage.md`, the reverse index. The forward index
    answered "what is this finding?"; nothing answered "what did we fail to look
    at?", so an audit could print `OWASP touched: A01, A05` and leave a reader
    unable to distinguish a clean category from an unexamined one.
    `/security-audit`'s Coverage section is now a three-state rollup —
    `findings (n)`, `checked, clean`, `not reachable`. CWE-20 and CWE-476 are
    recorded as real gaps and CWE-200 as partial: making an absence visible is
    the entire point. Ranks come from cwe.mitre.org and category titles from
    owasp.org with the URL and date in the file, because six CWE-to-OWASP
    mappings in this plugin were already wrong on inference once.
  * `/security-audit` no longer tells the auditor to skip semgrep unless the repo
    has a `.semgrep.yml`. Semgrep is the only Clojure engine in CI now, so that
    instruction produced audits blind to everything a PR would catch. It runs
    CI's full config set, and it must not resurrect `nosemgrep`-suppressed
    findings — CI excludes those from its table and its exit code, and reporting
    them as live re-litigates a decision a developer already made.
```

- [ ] **Step 5: Verify no synced file was touched**

```bash
git status --short
```

Expected: no `package.json`, `plugin.json`, `marketplace.json`, or `index.ts` in the list. CI syncs those from `VERSION`; hand-editing them causes a conflict on the sync commit.

- [ ] **Step 6: Commit, push, and confirm the tag**

```bash
git add plugins/clojure-security/VERSION plugins/clojure-security/CHANGES
git add -f docs/superpowers/plans/2026-07-29-clojure-security-semgrep-alignment.md
git commit -m "release(clojure-security): 0.12.0"
git push origin master
```

Then wait for CI and confirm:

```bash
gh run list --limit 3
git fetch --tags && git tag -l 'clojure-security/v0.12.0'
```

Expected: the `build-plugins` run is green and the tag `clojure-security/v0.12.0` exists. If CI is red, read the log before re-pushing — the sync step edits `package.json`/`plugin.json`/`marketplace.json` and commits them, so a local edit to those files is the usual cause.

---

## Post-release note for the human

The one structural weakness this work does **not** close: `/security-audit` still
has no enforced cadence. It is better positioned than before — nine Top 25
entries moved into the per-turn review — but the remaining audit-only surface is
real: CWE-20 and CWE-476 have no class at all, CWE-200 is partial, and
`transitive-cve` needs `clj-watson` on `all` scope, which no hook runs.

Deliberately out of scope per the design discussion. Worth revisiting as its own
spec: who triggers it, how often, and whether anything blocks.
