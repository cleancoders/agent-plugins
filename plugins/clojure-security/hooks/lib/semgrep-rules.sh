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
# the retired scanner's own rule fetch on a cold cache, in the same place.

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
