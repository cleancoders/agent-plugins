#!/usr/bin/env bash
# PostToolUse hook: enforce the writing-tests rule "one top-level `describe`
# per spec file" after an Edit / Write / MultiEdit touches a Speclj spec.
#
# Why a hook and not just the skill: in a fan-out / subagent workflow the
# agent that actually writes the spec may never load the `writing-tests`
# skill, so the rule (which otherwise lives only as skill prose) never enters
# its context. A PostToolUse hook fires regardless of who wrote the file or
# which skills are active — it is the enforcement layer, the skill is the
# teaching layer.
#
# Design notes (mirrors cljfmt-postedit.sh):
#   - Exit 2 with stderr is the "feedback-to-Claude" lever in the PostToolUse
#     protocol: the Edit already succeeded; this only tells Claude to fix the
#     structure on its next turn. It does not revert anything.
#   - Only *_spec.{clj,cljc,cljs} files are considered.
#   - Degrades to a silent no-op when `jq` is absent, so machines without the
#     toolchain are never blocked.
#   - Bash 3.2 compatible (macOS default). No `set -u`.

INPUT="$(cat)"

command -v jq >/dev/null 2>&1 || exit 0

# --- collect candidate paths ------------------------------------------------

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

[ "${#PATHS[@]}" -eq 0 ] && exit 0

# --- keep only Speclj spec files that exist --------------------------------

SPEC_PATHS=()
for p in "${PATHS[@]}"; do
  case "$p" in
    *_spec.clj|*_spec.cljc|*_spec.cljs)
      [ -f "$p" ] && SPEC_PATHS+=("$p")
      ;;
  esac
done

[ "${#SPEC_PATHS[@]}" -eq 0 ] && exit 0

# --- flag files with more than one top-level (describe ...) -----------------

OFFENDERS=()
for p in "${SPEC_PATHS[@]}"; do
  # count lines beginning (column 0) with "(describe " — top-level forms only
  count="$(grep -c '^(describe ' "$p" 2>/dev/null || echo 0)"
  if [ "$count" -gt 1 ]; then
    OFFENDERS+=("$p ($count top-level describe forms)")
  fi
done

[ "${#OFFENDERS[@]}" -eq 0 ] && exit 0

{
  echo "Speclj convention violation: a spec file must have exactly ONE top-level (describe ...), named after the namespace under test."
  echo "Fold the extra describe blocks into (context ...) forms nested under the single describe. A context wrapping fewer than 3 (it) blocks should instead be promoted to describe-level (it) forms with the behavior in the it string."
  echo "Files with multiple top-level describe blocks:"
  for o in "${OFFENDERS[@]}"; do
    echo "  - $o"
  done
  echo "Verify the fix with: grep -c '^(describe ' <file>   # must print 1"
} >&2

exit 2
