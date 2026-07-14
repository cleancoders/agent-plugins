#!/usr/bin/env bash
# PostToolUse hook: enforce writing-migrations placement/naming rules after an
# Edit / Write / MultiEdit touches a c3kit migration or its spec.
#
# Why a hook and not just the skill: in a fan-out / subagent workflow the agent
# that writes the migration (or its spec) may never load the writing-migrations
# skill, so its rules never enter that agent's context. A PostToolUse hook fires
# regardless of who wrote the file or which skills are active — it is the
# enforcement layer, the skill is the teaching layer. (Mirrors
# spec-describe-check.sh.)
#
# Flags (exit 2 = feedback to Claude; the edit already succeeded, this only asks
# Claude to fix placement on its next turn — it does not revert):
#   1. a Speclj spec under a `migrations/` dir — its namespace lands under
#      :migration-ns, so the migrator will try to call `up` on the spec. Specs
#      belong in a sibling `migration_specs/` dir (ns `<project>.migration-specs.*`).
#   2. a migration SOURCE file requiring a test-only namespace (speclj/beatles) —
#      migration source is on the production classpath.
#   3. two migrations sharing a date without `a`/`b`/`c` letter suffixes —
#      the migrator sorts by filename string comparison, so order is undefined.
#
# Degrades to a silent no-op without `jq`. Bash 3.2 compatible (macOS). No set -u.

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

ISSUES=()

for p in "${PATHS[@]}"; do
  base="$(basename "$p")"
  dir="$(dirname "$p")"

  # 1. spec under a migrations/ dir (not migration_specs/ — that has no /migrations/ segment)
  case "$p" in
    */migrations/*_spec.clj|*/migrations/*_spec.cljc|*/migrations/*_spec.cljs)
      ISSUES+=("$p — a migration spec must NOT live under a 'migrations/' dir: its namespace falls under :migration-ns, so the migrator treats it as a migration and calls (up) on it. Move it to a sibling 'migration_specs/' dir (namespace '<project>.migration-specs.*'), add (tags :migration), reference the migration via :as sut, and run it with 'clj -M:test:migration'.")
      continue ;;
  esac

  # remaining rules apply only to migration SOURCE files: under migrations/,
  # basename starting with 8 digits, a .clj(c) that is not a spec.
  case "$p" in
    */migrations/*) ;;
    *) continue ;;
  esac
  case "$base" in
    *_spec.clj|*_spec.cljc|*_spec.cljs) continue ;;
  esac
  # only Clojure migration source — keep this hook a no-op on non-Clojure
  # files even when they live under a migrations/ dir (matches the plugin's
  # extension-gated convention).
  case "$base" in
    *.clj|*.cljc) ;;
    *) continue ;;
  esac
  echo "$base" | grep -Eq '^[0-9]{8}' || continue

  # 2. test-only requires in migration source (production classpath)
  if [ -f "$p" ] && grep -Eq '(\[speclj|speclj\.core|\.beatles|/beatles)' "$p"; then
    ISSUES+=("$p — migration source requires a test-only namespace (speclj/beatles). Migration source is on the PRODUCTION classpath; keep only c3kit.bucket.* / production requires. Put tests in a '<project>.migration-specs.*' spec instead.")
  fi

  # 3. same-date sibling without a letter suffix
  date8="$(echo "$base" | grep -Eo '^[0-9]{8}')"
  after="$(echo "$base" | sed -E 's/^[0-9]{8}//' | cut -c1)"
  if [ -n "$date8" ] && ! echo "$after" | grep -Eq '[a-z]'; then
    for sib in "$dir/$date8"*; do
      [ -e "$sib" ] || continue
      sibbase="$(basename "$sib")"
      [ "$sibbase" = "$base" ] && continue
      case "$sibbase" in
        *.clj|*.cljc)
          ISSUES+=("$p — another migration shares date $date8 ($sibbase) but this file has no letter suffix. Same-date migrations need 'a'/'b'/'c' suffixes (e.g. ${date8}a_..., ${date8}b_...) so the string-sorted run order is deterministic.")
          break ;;
      esac
    done
  fi
done

[ "${#ISSUES[@]}" -eq 0 ] && exit 0

{
  echo "writing-migrations convention violation(s) — see the clojure plugin's writing-migrations skill:"
  for i in "${ISSUES[@]}"; do
    echo "  - $i"
  done
} >&2

exit 2
