#!/usr/bin/env bash
# Shared semgrep invocation for the clojure-security scanning hooks.
#
# Extracted because both hooks need identical handling of three hazards, and
# fixing one of them in only one hook has already happened once:
#
#   1. `jq` exits 5 on malformed input — which is what a semgrep killed
#      mid-write leaves behind — and a bare `X="$(cmd)"` assignment is NOT
#      exempt from `set -e` the way a command in an AND-OR list is. Unguarded,
#      a hook dies with an uncontracted exit code and stderr already routed to
#      /dev/null: a silent dead gate. Note `jq` exits 0 on a zero-byte file, so
#      the `-s` test is not the fix; the `|| true` is.
#   2. `xargs` splits on whitespace, so a path containing a space would arrive
#      as two bogus arguments and the file would be silently unscanned.
#   3. `check_id` is prefixed with the config path when `--config` is absolute,
#      so it must be stripped to the last dot-segment for display.
#
# Findings suppressed in source with `nosemgrep` are absent from `--json` output
# entirely, so they need no handling — which is also what CI does.
#
# Sets SEMGREP_ERRORS, SEMGREP_WARNINGS, SEMGREP_ERROR_COUNT, SEMGREP_WARN_COUNT.
# Always returns 0.

run_semgrep_scan() {
  local rules_dir="$1"
  local file_list="$2"
  local strip_prefix="${3:-}"
  local out f
  local -a args

  SEMGREP_ERRORS=""
  SEMGREP_WARNINGS=""
  SEMGREP_ERROR_COUNT=0
  SEMGREP_WARN_COUNT=0

  if [ -z "$rules_dir" ] || [ -z "$file_list" ]; then
    return 0
  fi

  args=()
  while IFS= read -r f; do
    [ -n "$f" ] && args+=("$f")
  done <<<"$file_list"

  if [ "${#args[@]}" -eq 0 ]; then
    return 0
  fi

  out="$(mktemp 2>/dev/null)" || return 0

  semgrep scan --json --quiet --config "$rules_dir" "${args[@]}" \
    > "$out" 2>/dev/null || true

  if [ -s "$out" ]; then
    SEMGREP_ERRORS="$(jq -r --arg prefix "$strip_prefix" '
      .results[]? | select(.extra.severity == "ERROR")
      | (if $prefix == "" then .path else (.path | sub($prefix; "")) end) as $p
      | "\($p):\(.start.line):\(.start.col)  ERROR  [\(.check_id | split(".") | last)]  \(.extra.message | gsub("\\s+"; " "))"
    ' "$out" 2>/dev/null || true)"

    SEMGREP_WARNINGS="$(jq -r --arg prefix "$strip_prefix" '
      .results[]? | select(.extra.severity == "WARNING")
      | (if $prefix == "" then .path else (.path | sub($prefix; "")) end) as $p
      | "\($p):\(.start.line):\(.start.col)  WARNING  [\(.check_id | split(".") | last)]  \(.extra.message | gsub("\\s+"; " "))"
    ' "$out" 2>/dev/null || true)"
  fi

  if [ -n "$SEMGREP_ERRORS" ]; then
    SEMGREP_ERROR_COUNT="$(printf '%s\n' "$SEMGREP_ERRORS" | wc -l | tr -d ' ')"
  fi
  if [ -n "$SEMGREP_WARNINGS" ]; then
    SEMGREP_WARN_COUNT="$(printf '%s\n' "$SEMGREP_WARNINGS" | wc -l | tr -d ' ')"
  fi

  rm -f "$out"
  return 0
}
