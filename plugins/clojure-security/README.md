# clojure-security

Security skill for Clojure / ClojureScript codebases. Encodes the
vulnerability-class judgment that off-the-shelf SAST tools miss for Clojure,
and gives Claude the framing it needs to triage findings from `clj-kondo`,
`clj-holmes`, `gitleaks`, `clj-watson`, and Semgrep.

Designed to shift security feedback left from CI-only into Claude Code itself:
findings surface while code is being written rather than after the fact.

## Scope

- **`clojure-security` skill** — vulnerability-class reference and audit
  methodology. Used both on demand and as the judgment layer behind any
  automated hooks.
- **`/security-audit` slash command** — on-demand structured audit of the
  current repo (or a subscope: `staged` / `diff` / `<path>`).
- **`PostToolUse` hook (clj-kondo)** — runs against Clojure files immediately
  after Claude edits them. Surfaces lint findings before the turn completes.
  Foundation layer: catches the sloppy code where security bugs hide.
  Sub-second; degrades silently if `clj-kondo` or `jq` is not installed.
  The plugin ships a baseline clj-kondo config (security-tuned linter levels +
  Speclj resolution excludes); run `/clojure-security:setup-clj-kondo` to copy
  it into your project's `.clj-kondo/config.edn` so the per-edit lint matches
  the documented posture. The SessionStart hook suggests this when no config is
  present.
- **`Stop` hook (clj-holmes + gitleaks)** — runs against the session diff
  when Claude attempts to end its turn. Diff scope is tiered: feature
  branch → merge-base with `origin/<default>`; default branch → session-start
  SHA marker; no marker → uncommitted + untracked; non-git → skip.
  Findings block the Stop (exit 2) so Claude must address them before
  finishing.
- **`SessionStart` / `SessionEnd` hooks** — manage the diff-base marker
  at `.claude/.security-session-start-sha` (auto-added to `.gitignore`
  on creation so it is never committed), and (in Clojure projects)
  audit the security toolchain once per session. Missing tools (`clj-kondo`,
  `clj-holmes`, `clj-holmes` rules dir, `gitleaks`, `clj-watson`, `jq`)
  are reported as a session-context notice so silent no-ops don't go
  unnoticed.
- **`PreToolUse` backstop on `git commit`** — final defense if the
  PostToolUse and Stop hooks were bypassed. Runs gitleaks (native
  `protect --staged`) and clj-holmes against the staged index. Blocks
  the commit (exit 2) on any finding. Humans can override by running
  the commit themselves.

## Dependencies

The hook and the `/security-audit` command are best-effort — each tool is
optional, missing tools are skipped without failure:

- [`clj-kondo`](https://github.com/clj-kondo/clj-kondo) — fast linter (required for the PostToolUse hook to do anything)
- [`clj-holmes`](https://github.com/clj-holmes/clj-holmes) — Clojure security patterns. After installing, run `clj-holmes fetch-rules` once to populate the rules directory at `/tmp/clj-holmes-rules` (or set `CLJ_HOLMES_RULES_DIR` to a persistent location). Hooks silently skip clj-holmes when the rules dir is missing.
- [`gitleaks`](https://github.com/gitleaks/gitleaks) — secret scanning
- [`clj-watson`](https://github.com/clj-holmes/clj-watson) — dependency CVEs
- [`semgrep`](https://semgrep.dev) — pattern-based SAST
- `jq` — required to parse hook input (shipped on most systems; install if absent)

## Background

This plugin is part of Clean Coders Studio's path toward SSDLC maturity and
SOC 2 Type 2. CSSLP-aligned principles translated to a Clojure stack.
