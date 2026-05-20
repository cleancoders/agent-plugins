#!/usr/bin/env bash
# SessionStart hook: in a Clojure project, audit the tools the `clojure`
# plugin's hooks rely on (`cljfmt`, `jq`) and inject a one-shot notice
# listing anything missing. Silent no-ops were the worst failure mode:
# a user could keep editing Clojure files believing cljfmt was running
# when in fact it had never been installed. Fix by surfacing the state
# once per session — no per-edit nag.
#
# Contract:
#   stdin  — JSON with .cwd
#   stdout — JSON {hookSpecificOutput: {hookEventName, additionalContext}}
#            injected into the conversation if anything is missing
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

is_clojure_project() {
  [ -f "$CWD/deps.edn" ] || [ -f "$CWD/project.clj" ] || \
    [ -f "$CWD/shadow-cljs.edn" ] || [ -f "$CWD/build.boot" ] || \
    [ -f "$CWD/bb.edn" ]
}

is_clojure_project || exit 0

MISSING=""
note_missing() {
  # $1 = tool, $2 = role, $3 = install hint
  MISSING="${MISSING}- **${1}** (${2}): ${3}"$'\n'
}

command -v jq     >/dev/null 2>&1 || note_missing "jq" \
  "required to parse hook input" \
  "\`brew install jq\` / \`apt install jq\`"

command -v cljfmt >/dev/null 2>&1 || note_missing "cljfmt" \
  "auto-formats Clojure files after Claude edits them" \
  "\`brew install cljfmt\` — without it, every edit leaves whatever formatting Claude produced (no auto-fix)"

if [ -n "$MISSING" ]; then
  CONTEXT="$(printf 'clojure plugin — toolchain status\n\nThis is a Clojure project but some tools the clojure plugin'\''s hooks rely on are missing. Hooks that depend on them are degrading to a silent no-op until installed. Tell the user once if they ask why formatting is not running, and otherwise carry on.\n\nMissing:\n\n%s\nThe PostToolUse cljfmt hook will resume working automatically once the missing tools are installed. Restart the session to re-check.\n' "$MISSING")"

  if command -v jq >/dev/null 2>&1; then
    jq -n --arg ctx "$CONTEXT" \
      '{hookSpecificOutput: {hookEventName: "SessionStart", additionalContext: $ctx}}'
  else
    # Bare-minimum fallback when jq itself is the missing tool: emit raw
    # text on stderr so the user at least sees something.
    {
      echo "clojure plugin: \`jq\` is not installed."
      echo "The plugin's hooks cannot parse input without it; they are running as no-ops."
      echo "Install with \`brew install jq\` and restart the session."
    } >&2
  fi
fi

exit 0
