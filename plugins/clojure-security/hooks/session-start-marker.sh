#!/usr/bin/env bash
# SessionStart hook. Two responsibilities:
#
# 1. Record HEAD SHA into .claude/.security-session-start-sha so the
#    Stop-hook can diff against the session-start point rather than an
#    arbitrary merge-base.
#
# 2. In a Clojure project, audit the security toolchain (clj-kondo,
#    clj-holmes + rules, gitleaks, clj-watson, jq) and inject a status
#    notice into the conversation. Missing tools degrade scanning to
#    silent no-ops, so the user has to be told once per session that
#    scanning is incomplete — otherwise the absence is invisible.
#
# Contract:
#   stdin  — JSON with .cwd
#   stdout — JSON `{hookSpecificOutput: {hookEventName, additionalContext}}`
#            for SessionStart, injected into the conversation context
#   exit 0 — always

set -e

INPUT="$(cat 2>/dev/null || true)"

if command -v jq >/dev/null 2>&1; then
  CWD="$(printf '%s' "$INPUT" | jq -r '.cwd // empty')"
else
  CWD=""
fi
[ -z "$CWD" ] && CWD="${CLAUDE_PROJECT_DIR:-$PWD}"

cd "$CWD" 2>/dev/null || exit 0

# --- 1. write session-start marker if in a git repo --------------------------

# Ensure the marker is gitignored so it never gets committed. Match by
# basename (no leading slash) so the pattern works regardless of where the
# .gitignore lives relative to .claude/. Idempotent: skip if already ignored.
ensure_gitignored() {
  IGNORE_ENTRY=".security-session-start-sha"
  GITIGNORE="${CWD}/.gitignore"
  if [ -f "$GITIGNORE" ] && grep -qxF "$IGNORE_ENTRY" "$GITIGNORE" 2>/dev/null; then
    return 0
  fi
  # Append a trailing newline first if the file exists and lacks one.
  if [ -s "$GITIGNORE" ] && [ -n "$(tail -c1 "$GITIGNORE" 2>/dev/null)" ]; then
    printf '\n' >> "$GITIGNORE"
  fi
  printf '%s\n' "$IGNORE_ENTRY" >> "$GITIGNORE" 2>/dev/null || true
}

if git rev-parse --git-dir >/dev/null 2>&1; then
  MARKER_DIR="${CWD}/.claude"
  MARKER="${MARKER_DIR}/.security-session-start-sha"
  if mkdir -p "$MARKER_DIR" 2>/dev/null && [ ! -f "$MARKER" ]; then
    HEAD_SHA="$(git rev-parse HEAD 2>/dev/null || true)"
    if [ -n "$HEAD_SHA" ]; then
      printf '%s\n' "$HEAD_SHA" > "$MARKER"
      ensure_gitignored
    fi
  fi
fi

# --- 2. toolchain audit (only in Clojure projects) ---------------------------

is_clojure_project() {
  [ -f "$CWD/deps.edn" ] || [ -f "$CWD/project.clj" ] || \
    [ -f "$CWD/shadow-cljs.edn" ] || [ -f "$CWD/build.boot" ] || \
    [ -f "$CWD/bb.edn" ]
}

if ! is_clojure_project; then
  exit 0
fi

MISSING=""

note_missing() {
  # $1 = tool, $2 = role, $3 = install hint
  MISSING="${MISSING}- **${1}** (${2}): ${3}"$'\n'
}

command -v jq         >/dev/null 2>&1 || note_missing "jq" \
  "required for every hook" \
  "\`brew install jq\` / \`apt install jq\`"

command -v clj-kondo  >/dev/null 2>&1 || note_missing "clj-kondo" \
  "PostToolUse lint on Clojure edits" \
  "\`brew install borkdude/brew/clj-kondo\` — without it the per-edit lint runs no-op"

command -v gitleaks   >/dev/null 2>&1 || note_missing "gitleaks" \
  "secret scanning in the Stop and PreToolUse hooks" \
  "\`brew install gitleaks\` — without it leaked credentials will not be flagged"

if ! command -v clj-holmes >/dev/null 2>&1; then
  note_missing "clj-holmes" \
    "Clojure security-pattern SAST in the Stop and PreToolUse hooks" \
    "download from https://github.com/clj-holmes/clj-holmes/releases/latest — the hooks auto-fetch the rule set on first scan, so no separate \`fetch-rules\` step is needed"
fi
# Note: when clj-holmes is installed but the rules dir is missing/empty, the
# Stop and commit-backstop hooks now run `clj-holmes fetch-rules` themselves
# before scanning — so a missing rules dir is no longer a silent no-op and
# needs no setup note here.

command -v clj-watson >/dev/null 2>&1 || note_missing "clj-watson" \
  "dependency CVE scanning in \`/security-audit\`" \
  "see https://github.com/clj-holmes/clj-watson — without it the audit will not check transitive deps for known CVEs"

# Suggest pulling in the plugin's clj-kondo config if the project has none.
# clj-kondo auto-discovers `.clj-kondo/config.edn` from the project root;
# without one the per-edit lint runs with defaults that omit this plugin's
# security-tuned linter levels and Speclj resolution excludes.
CLJ_KONDO_SUGGESTION=""
if [ ! -f "$CWD/.clj-kondo/config.edn" ]; then
  CLJ_KONDO_SUGGESTION="No clj-kondo config found in this Clojure project (\`.clj-kondo/config.edn\`). The clj-kondo-postedit hook will lint with defaults, which omit this plugin's security-tuned linter levels (escalated :type-mismatch / :refer-all, surfaced :unused-binding / :shadowed-var / :unused-private-var) and the Speclj resolution excludes. Suggest the user run \`/clojure-security:setup-clj-kondo\` to pull in the plugin's baseline config. Informational only — do not block on it."
fi

# Build the additionalContext payload if tools are missing OR no clj-kondo config.
if [ -n "$MISSING" ] || [ -n "$CLJ_KONDO_SUGGESTION" ]; then
  CONTEXT="clojure-security plugin — toolchain status"$'\n'

  if [ -n "$MISSING" ]; then
    CONTEXT="${CONTEXT}"$'\n'"This is a Clojure project but some security-scanning tools are missing. Scanning that depends on them will degrade to a silent no-op until installed. Tell the user once if they ask why scanning is quiet, and otherwise carry on."$'\n\n'"Missing:"$'\n\n'"${MISSING}"$'\n'"All hooks still load and run; they just skip the missing tool. To verify the full toolchain after installing, restart the session so this check re-runs."$'\n'
  fi

  if [ -n "$CLJ_KONDO_SUGGESTION" ]; then
    CONTEXT="${CONTEXT}"$'\n'"${CLJ_KONDO_SUGGESTION}"$'\n'
  fi

  if command -v jq >/dev/null 2>&1; then
    jq -n --arg ctx "$CONTEXT" \
      '{hookSpecificOutput: {hookEventName: "SessionStart", additionalContext: $ctx}}'
  fi
fi

exit 0
