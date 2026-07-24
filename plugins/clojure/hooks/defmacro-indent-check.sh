#!/usr/bin/env bash
# PostToolUse hook: nudge Claude to register new body-macros in cljfmt.edn.
#
# cljfmt (with :function-arguments-indentation :cursive, the house standard)
# deep-indents the body of any macro it doesn't know — it aligns the body under
# the macro's first argument instead of the 2-space block indent a `defn`-style
# body wants. The fix is a `macro-name [[:block N]]` entry in the repo's
# cljfmt.edn :extra-indents (N = the number of fixed params before `& body`).
# That step is manual and easy to forget, so this hook flags it.
#
# When an Edit/Write adds a variadic `defmacro` (params contain `&`, i.e. a
# body-macro) whose UNqualified name is not yet a key in the repo's cljfmt.edn
# :extra-indents, the hook exit-2s with the exact rule to add. Notify-only: it
# does not edit cljfmt.edn — Claude judges whether it is really a body-macro
# (some variadic macros aren't) and adds the rule. The teaching layer is the
# `cljfmt-body-macros` skill.
#
# Degrades to a silent no-op without `jq`, on non-Clojure files, and in repos
# with no cljfmt.edn. Single-line arglist detection (best-effort). Bash 3.2
# compatible (macOS default). No `set -u`.

INPUT="$(cat)"

command -v jq >/dev/null 2>&1 || exit 0

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

# locate the nearest cljfmt.edn at or above a directory
find_cljfmt() {
  local d="$1"
  while [ -n "$d" ] && [ "$d" != "/" ]; do
    if [ -f "$d/cljfmt.edn" ]; then
      printf '%s' "$d/cljfmt.edn"
      return 0
    fi
    d="$(dirname "$d")"
  done
  return 1
}

# escape a macro name for use in an extended regex
regex_escape() {
  printf '%s' "$1" | sed 's/[][\.*^$(){}+?|]/\\&/g'
}

ISSUES=()

for p in "${PATHS[@]}"; do
  case "$p" in
    *.clj|*.cljc|*.cljs) ;;
    *) continue ;;
  esac
  [ -f "$p" ] || continue

  dir="$(cd "$(dirname "$p")" 2>/dev/null && pwd)" || continue
  cljfmt="$(find_cljfmt "$dir")" || continue

  # variadic defmacro lines: (defmacro NAME [ ... & ... ]  on a single line
  while IFS= read -r line; do
    [ -n "$line" ] || continue
    name="$(printf '%s' "$line" | sed -E 's/.*\(defmacro[[:space:]]+([^][:space:]()]+).*/\1/')"
    [ -n "$name" ] || continue

    # already registered as a cljfmt :extra-indents key?
    esc="$(regex_escape "$name")"
    if grep -Eq "(^|[[:space:]])${esc}[[:space:]]+\[\[" "$cljfmt"; then
      continue
    fi

    # suggest N = fixed params before `&` in the (single-line) arglist
    arglist="$(printf '%s' "$line" | sed -E 's/^[^[]*\[([^]]*)\].*/\1/')"
    before="$(printf '%s' "$arglist" | sed -E 's/&.*//')"
    n="$(printf '%s' "$before" | wc -w | tr -d ' ')"

    ISSUES+=("${name}  (defined in ${p}): add \`${name} [[:block ${n}]]\` to cljfmt.edn :extra-indents so cljfmt block-indents its body instead of aligning under the first arg. N is the count of fixed params before \`& body\` — verify it fits this macro.")
  done < <(grep -En '\(defmacro[[:space:]]+[^][:space:]()]+[[:space:]]*\[[^]]*&[^]]*\]' "$p" | sed -E 's/^[0-9]+://')
done

[ "${#ISSUES[@]}" -eq 0 ] && exit 0

{
  echo "New body-macro(s) not registered in cljfmt.edn — cljfmt will deep-indent their call-site bodies (see the clojure plugin's cljfmt-body-macros skill):"
  for i in "${ISSUES[@]}"; do
    echo "  - $i"
  done
} >&2

exit 2
