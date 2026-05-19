#!/usr/bin/env bash
# PostToolUse hook: run clj-kondo on the just-edited Clojure file.
#
# Contract (Claude Code hook protocol):
#   stdin  — JSON with .tool_input.file_path (Edit/Write) or .tool_input.file_paths (MultiEdit)
#   stdout — ignored by the harness in PostToolUse
#   stderr — surfaced to Claude when exit != 0
#   exit 0 — silent success (clean, not Clojure, or clj-kondo absent)
#   exit 1 — non-blocking warning (clj-kondo warning-level findings)
#   exit 2 — blocking error  (clj-kondo error-level findings — Claude must address)
#
# Design notes:
#   - Lints only the changed file, never the project. Must stay sub-second.
#   - Degrades to exit 0 if clj-kondo or jq is not installed — the hook never
#     breaks a workflow on a machine that hasn't installed the toolchain yet.
#   - clj-kondo is not a security tool; it is the foundation. It catches the
#     sloppy code (unresolved syms, arity, shadowed locals) where security
#     bugs hide. Security-specific scanning is the Stop-hook's job.

# Defensive: do not `set -u` — bash 3.2 (default on macOS) treats empty arrays
# as unbound, which would crash the hook before it can no-op cleanly.

# --- read hook input ----------------------------------------------------------

# Accept either a file_path (Edit / Write) or file_paths array (MultiEdit).
INPUT="$(cat)"

# Bail silently if jq is missing — the hook is opportunistic, not mandatory.
if ! command -v jq >/dev/null 2>&1; then
  exit 0
fi

# Collect candidate paths. file_paths (array) wins if present; else file_path.
# Use while-read instead of mapfile to stay compatible with bash 3.2 (macOS).
PATHS=()
while IFS= read -r line; do
  [ -n "$line" ] && PATHS+=("$line")
done < <(
  printf '%s' "$INPUT" | jq -r '
    if (.tool_input.file_paths | type) == "array"
      then .tool_input.file_paths[]
      else (.tool_input.file_path // empty)
    end
  '
)

if [ "${#PATHS[@]}" -eq 0 ]; then
  exit 0
fi

# --- filter to Clojure-shaped files ------------------------------------------

CLJ_PATHS=()
for p in "${PATHS[@]}"; do
  case "$p" in
    *.clj|*.cljs|*.cljc|*.edn|*.bb) CLJ_PATHS+=("$p") ;;
  esac
done

if [ "${#CLJ_PATHS[@]}" -eq 0 ]; then
  exit 0
fi

# --- require clj-kondo (silent skip if absent) -------------------------------

if ! command -v clj-kondo >/dev/null 2>&1; then
  exit 0
fi

# --- lint -------------------------------------------------------------------

# JSON output so we can classify by severity without parsing free text.
KONDO_OUT="$(clj-kondo --lint "${CLJ_PATHS[@]}" --config '{:output {:format :json}}' 2>/dev/null || true)"

# Empty / non-JSON output → treat as clean.
if [[ -z "$KONDO_OUT" ]] || ! printf '%s' "$KONDO_OUT" | jq -e . >/dev/null 2>&1; then
  exit 0
fi

ERR_COUNT="$(printf '%s' "$KONDO_OUT" | jq '[.findings[] | select(.level == "error")] | length')"
WARN_COUNT="$(printf '%s' "$KONDO_OUT" | jq '[.findings[] | select(.level == "warning")] | length')"

if [[ "$ERR_COUNT" -eq 0 && "$WARN_COUNT" -eq 0 ]]; then
  exit 0
fi

# --- format findings for Claude ---------------------------------------------

# One line per finding: path:row:col  level  [linter]  message
FORMATTED="$(
  printf '%s' "$KONDO_OUT" \
    | jq -r '.findings[] | "\(.filename):\(.row):\(.col)  \(.level | ascii_upcase)  [\(.type)]  \(.message)"'
)"

{
  echo "clj-kondo findings on the file you just edited:"
  echo
  echo "$FORMATTED"
  echo
  if [[ "$ERR_COUNT" -gt 0 ]]; then
    echo "Errors must be fixed before continuing. Warnings should be reviewed."
    echo "These are clj-kondo findings only — not security findings. Security"
    echo "patterns are evaluated by the Stop-hook and \`/security-audit\`."
  else
    echo "Warnings only — not blocking, but please address before completing."
  fi
} >&2

if [[ "$ERR_COUNT" -gt 0 ]]; then
  exit 2
else
  exit 1
fi
