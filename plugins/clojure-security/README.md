# clojure-security

Security skill for Clojure / ClojureScript codebases. Encodes the
vulnerability-class judgment that off-the-shelf SAST tools miss for Clojure,
and gives Claude the framing it needs to triage findings from Semgrep,
`gitleaks`, `clj-watson`, and `clj-kondo`.

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
- **`Stop` hook (semgrep + gitleaks + LLM review)** — runs against the
  session diff when Claude attempts to end its turn. Diff scope is tiered:
  feature branch → merge-base with `origin/<default>`; default branch →
  session-start SHA marker; no marker → uncommitted + untracked; non-git →
  skip. The semgrep scan uses the 16 cleancoders `cc-*` rules, with `ERROR`
  findings blocking and `WARNING` findings advisory; the LLM review covers
  the 13 vulnerability classes no scanner reaches, scoped to the files
  edited that turn. Blocking findings block the Stop (exit 2) so Claude must
  address them before finishing.
- **`SessionStart` / `SessionEnd` hooks** — manage the diff-base marker
  at `.claude/.security-session-start-sha` (auto-added to `.gitignore`
  on creation so it is never committed), and (in Clojure projects)
  audit the security toolchain once per session. Missing tools (`clj-kondo`,
  `semgrep`, `gitleaks`, `clj-watson`, `jq`)
  are reported as a session-context notice so silent no-ops don't go
  unnoticed.
- **`PreToolUse` backstop on `git commit`** — final defense if the
  PostToolUse and Stop hooks were bypassed. Runs gitleaks (native
  `protect --staged`) and semgrep against the staged index. Blocks
  the commit (exit 2) on any finding. Humans can override by running
  the commit themselves.

## Dependencies

The hook and the `/security-audit` command are best-effort — each tool is
optional, missing tools are skipped without failure:

- [`clj-kondo`](https://github.com/clj-kondo/clj-kondo) — fast linter (required for the PostToolUse hook to do anything)
- [`semgrep`](https://semgrep.dev) — the Clojure engine. The hooks run the 16
  first-party `cc-*` rules from
  [`cleancoders/github-actions`](https://github.com/cleancoders/github-actions)
  at tag `v1` — the same rules and the same ref your PR check uses, so a local
  scan and a PR cannot disagree. They are fetched and cached on first scan; set
  `CC_SEMGREP_RULES_DIR` to a `cleancoders/github-actions` checkout to skip the
  fetch. `ERROR` findings block; `cc-path-traversal`, `cc-generic-catch` and
  `cc-clojure-xml-xxe` are `WARNING` and advisory, exactly as in CI.
- [`gitleaks`](https://github.com/gitleaks/gitleaks) — secret scanning
- [`clj-watson`](https://github.com/clj-holmes/clj-watson) — dependency CVEs
- `jq` — required to parse hook input (shipped on most systems; install if absent)

### Per-turn review of the scanner-blind classes

13 of the skill's 27 vulnerability classes have no scanner: access control, SSRF,
mass assignment, logging failures and the rest need dataflow, namespace-alias
resolution or whole-route reasoning that semgrep cannot do. Nine are CWE Top 25
entries. They used to be reachable only by running `/security-audit` by hand.

`turn-ledger.sh` records which Clojure files each turn edited; the `Stop` hook
reviews exactly those, once, and reports through the `clojure-security` skill.
Scope is the turn's edits rather than the session diff, so nothing is reviewed
twice.

**Expect one extra round-trip per turn that touches Clojure.** The review is not
gated on findings — the hook blocks in order to *ask* for it, so a turn editing a
`.clj`, `.cljs` or `.cljc` file ends with one more exchange even when semgrep and
gitleaks are clean. That tradeoff is what makes the 13 scanner-blind classes reachable at all.

Two limits worth knowing rather than discovering. Files changed by `Bash` — a
script, `sed`, `git checkout` — never enter the ledger, so semgrep still scans them
but the review does not see them. And the hook cannot verify the review actually
happened: it blocks once and trusts Claude, as every `Stop` directive does.

Set `CC_SKIP_DIFF_REVIEW=1` to turn the whole thing off.

## Background

This plugin is part of Clean Coders Studio's path toward SSDLC maturity and
SOC 2 Type 2. CSSLP-aligned principles translated to a Clojure stack.
