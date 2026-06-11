#!/usr/bin/env bash
# PostToolUse hook: auto-format Clojure files with `cljfmt` after an
# Edit / Write / MultiEdit, then tell Claude which file(s) were rewritten
# so the next Edit doesn't operate on stale content.
#
# Design notes:
#   - Auto-format-with-notice: the file is modified in place. This avoids
#     burning model tokens having Claude re-emit the same code in canonical
#     form. The notice is the only message Claude receives; the user does
#     not see anything unless they look at the diff.
#   - Exit 2 with stderr feeds the notice back to Claude through the
#     PostToolUse channel so it knows to Re-Read the file before its next
#     Edit. Exit 2 is the "feedback-to-Claude" lever in this protocol, not
#     a "block" in the destructive sense — the Edit has already succeeded.
#   - Degrades to a silent no-op when `cljfmt` or `jq` is absent. Per-edit
#     hooks must never break workflows on machines that haven't installed
#     the tool yet.
#   - Bash 3.2 compatible (macOS default).

# Defensive: no `set -u` (bash 3.2 treats empty arrays as unbound).

INPUT="$(cat)"

command -v jq     >/dev/null 2>&1 || exit 0
command -v cljfmt >/dev/null 2>&1 || exit 0

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

if [ "${#PATHS[@]}" -eq 0 ]; then
  exit 0
fi

CLJ_PATHS=()
for p in "${PATHS[@]}"; do
  case "$p" in
    *.clj|*.cljs|*.cljc|*.edn|*.bb)
      [ -f "$p" ] && CLJ_PATHS+=("$p")
      ;;
  esac
done

if [ "${#CLJ_PATHS[@]}" -eq 0 ]; then
  exit 0
fi

# --- format each file, track which were modified ---------------------------

CHANGED=()
ERRORS=""

hash_file() {
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 1 "$1" 2>/dev/null | awk '{print $1}'
  else
    sha1sum "$1" 2>/dev/null | awk '{print $1}'
  fi
}

# cljfmt discovers cljfmt.edn from the CURRENT WORKING DIRECTORY, not the
# formatted file's path. The hook's cwd is the session's, which may be an
# unrelated repo when editing across repos. Run cljfmt from each file's own
# repo root so that repo's cljfmt.edn applies.
repo_root_of() {
  local dir
  dir="$(cd "$(dirname "$1")" 2>/dev/null && pwd)" || return 1
  git -C "$dir" rev-parse --show-toplevel 2>/dev/null || printf '%s' "$dir"
}

for p in "${CLJ_PATHS[@]}"; do
  BEFORE="$(hash_file "$p")"
  OUT="$(cd "$(repo_root_of "$p")" && cljfmt fix "$p" 2>&1)"
  RC=$?
  if [ "$RC" -ne 0 ]; then
    # Trim cljfmt's noisy JVM stack to the first 5 lines — the leading
    # "Unexpected EOF" / parse-error line is all Claude needs to act.
    SHORT_OUT="$(printf '%s' "$OUT" | head -5)"
    ERRORS="${ERRORS}${p}:"$'\n'"${SHORT_OUT}"$'\n'
    continue
  fi
  AFTER="$(hash_file "$p")"
  if [ -n "$BEFORE" ] && [ -n "$AFTER" ] && [ "$BEFORE" != "$AFTER" ]; then
    CHANGED+=("$p")
  fi
done

# --- emit results ----------------------------------------------------------

if [ -n "$ERRORS" ]; then
  {
    echo "cljfmt failed on one or more files. Fix the syntax / read errors below before continuing:"
    echo
    printf '%s' "$ERRORS"
  } >&2
  exit 2
fi

if [ "${#CHANGED[@]}" -eq 0 ]; then
  exit 0
fi

{
  echo "cljfmt reformatted the file(s) you just edited:"
  for p in "${CHANGED[@]}"; do
    echo "  $p"
  done
  echo
  echo "Your stored content for these files is now stale. Re-Read each one before your next Edit, or the Edit will mismatch."
} >&2
exit 2
