# Handoff: align the clojure-security plugin with the semgrep-over-clj-holmes decision

Work in `/Users/alex-root-roatch/current-projects/agent-plugins` (repo
`cleancoders/agent-plugins`, plugin `plugins/clojure-security`, currently at
version **0.11.0**).

Read this whole brief before touching anything. Start with
`superpowers:brainstorming` — there is one genuine design fork below that needs a
decision from your human partner before implementation, and it changes the shape
of the work.

## What changed upstream, and why

`cleancoders/github-actions` (the reusable `security.yml`, consumed at `@v1` by
c3kit-apron, c3kit-bucket, c3kit-wire, c3kit-scaffold and cleancoders.com)
**removed clj-holmes entirely** and replaced it with 16 custom semgrep rules.

The reasoning, all measured rather than assumed:

- **clj-holmes reads only `*.clj`.** It silently skips `.cljs` and `.cljc`, and
  its edamame call omits `:read-cond`, so `.cljc` fails to parse even when
  renamed — with the failure swallowed. A `.cljc`-heavy repo scanned clean. That
  matters disproportionately: CWE-79 is #1 on the CWE Top 25 and is largely a
  ClojureScript problem, and `.cljc` is where c3kit puts shared domain logic.
- **Unmaintained since October 2022**, with open PRs from 2022 and 2023. It
  produced three failures in one week of real use: `--fail-on-result` with
  `-t sarif` exiting 3 on *zero* findings; findings written to a file so a red
  build printed no reason; and a `progrock` integer overflow computing an ETA
  that crashed the scan with exit 255 and no SARIF, blocking a production deploy
  on cleancoders.com.
- **The replacement rules measurably outperform it.** On a fixture covering all
  eight sink types clj-holmes claims: replacements 8/8, clj-holmes 6/8 — it ships
  rules for Blowfish and DESede and matches neither. Zero false positives on the
  safe corpus for both.
- **The reason clj-holmes was originally chosen no longer applies.** It resolves
  namespace aliases; semgrep cannot. But every detection being replaced is Java
  interop (`Cipher`, `MessageDigest`, `SSLContext`, `HostnameVerifier`) or
  `clojure.core`/`clojure.xml`, where there is no alias to resolve.

Full record: `cleancoders/github-actions` →
`docs/superpowers/specs/2026-07-27-cwe-owasp-coverage-design.md` (see
"REVISION 2"), plus PRs #4–#9 in that repo.

### The 16 rules now in CI

In `cleancoders/github-actions` → `security-rules/semgrep/*.yaml`. Each carries
`metadata.class` matching this plugin's class index, plus `metadata.cwe`,
`metadata.owasp`, and `metadata.confidence`.

| rule | class | severity |
|---|---|---|
| `cc-read-string` | `read-string-rce` | ERROR |
| `cc-load-string` | `dynamic-eval` | ERROR |
| `cc-sql-string-concat` | `sql-injection` | ERROR |
| `cc-hiccup-raw` | `hiccup-injection` | ERROR |
| `cc-cljs-innerhtml` / `cc-cljs-eval` / `cc-dangerously-set-html` | `cljs-dom-xss` | ERROR |
| `cc-shell-exec` | `command-injection` | ERROR |
| `cc-nippy-thaw` / `cc-snakeyaml-unsafe` | `java-deserialization` | ERROR |
| `cc-explain-data-response` | `spec-malli-leak` | ERROR |
| `cc-weak-crypto` | `weak-crypto` | ERROR |
| `cc-insecure-tls` | `insecure-tls-verification` | ERROR |
| `cc-path-traversal` | `path-traversal` | **WARNING** |
| `cc-generic-catch` | `fail-open` | **WARNING** |
| `cc-clojure-xml-xxe` | `xxe` | **WARNING** |

The three WARNING rules are non-blocking on purpose: without dataflow they cannot
be precise enough to gate a build. That promise is enforced by
`bin/report-sarif.sh` in the other repo and documented in its README. Do not
describe them as blocking.

## The design fork — resolve this first

**The plugin's local enforcement now disagrees with CI.** Three hooks run
clj-holmes on the developer's machine:

- `hooks/session-start-marker.sh` (SessionStart) — checks for clj-holmes, warns
  when missing, tells the user to download it
- `hooks/commit-backstop.sh` (PreToolUse/Bash) — scans staged Clojure files
  before a commit
- `hooks/security-stop.sh` (Stop) — scans touched files with gitleaks +
  clj-holmes

So a developer's Stop hook and their PR check now apply different rule sets. The
hooks enforce upstream clj-holmes rules; CI enforces 16 `cc-*` semgrep rules that
cover more, and cover `.cljs`/`.cljc` which the hooks cannot see at all.

Note the CI crash does **not** automatically condemn local use: the progress-bar
overflow needed ~1300 files, and these hooks scan only touched/staged files. The
argument for migrating is consistency and coverage, not that clj-holmes is
locally broken.

If the hooks move to semgrep, the `cc-*` rules live in a *different repo*, so
they need a delivery mechanism. Options to put to your human partner:

1. **Fetch on first use** into a cache dir, mirroring what the hooks already do
   with `clj-holmes fetch-rules` into `/tmp/clj-holmes-rules`. Keeps one source
   of truth. Cost: network dependency on a Stop hook, and a staleness question.
2. **Vendor a copy** in the plugin. No network, fully self-contained. Cost: two
   copies of the rules — exactly the drift the generated coverage matrix exists to
   prevent. If chosen, it needs a sync check with teeth.
3. **Configurable local path** (e.g. `CC_SEMGREP_RULES_DIR`) pointing at a
   checkout. Simple and honest. Cost: only works for people who have that
   checkout, so hooks silently do less for everyone else.
4. **Keep clj-holmes locally, document the divergence.** Least work. Cost: the
   hooks keep enforcing a strictly weaker rule set from abandoned software, and
   the local/CI gap is permanent.

Recommend against deciding this yourself. It trades network behaviour on a Stop
hook against rule drift, and both are the human's call.

## What is factually wrong today (independent of the fork)

These are stale regardless of which option wins. Exact current text given so you
can find it.

### 1. `skills/clojure-security/SKILL.md` — tool table

```
| **clj-holmes** | known-bad Clojure idioms (`read-string`, `eval`, deserialize sinks) | dataflow; small rule set |
| **Semgrep** | pattern-based source matches (Clojure via experimental tree-sitter) | deep dataflow; semantic equivalence |
```

Both rows are now misleading. clj-holmes is not in CI. The Semgrep row
understates it — it is the *only* Clojure engine now, carries 16 first-party
rules, and reads all three extensions. Its real blind spots are: no dataflow, and
**no namespace-alias resolution** (each rule enumerates aliases; an unusual alias
is a silent miss). Add that the two `pattern-regex` rules (`cc-weak-crypto`,
`cc-insecure-tls`) match text and can fire inside a comment.

### 2. `skills/clojure-security/SKILL.md` — frontmatter `description`

Lists `clj-holmes` among the tools whose findings this skill interprets. Update
the tool list. Keep the description's trigger phrasing otherwise intact — it is
what makes the skill fire.

### 3. `skills/clojure-security/references/config-and-ops.md`

Two lines credit clj-holmes for CI detection:

- line ~179: ``Detected in CI by upstream clj-holmes rules: `weak-hash-function-md5`, ...``
- line ~225: ``Detected in CI by upstream clj-holmes rules `clojure-weak-ssl-context` and ...``

Should now be `cc-weak-crypto` and `cc-insecure-tls` (semgrep) respectively.
`references/injection.md` already uses the correct form — copy its style:
`**Detected in CI by:** \`cc-shell-exec\` (semgrep).`

### 4. `commands/security-audit.md` — Step 5 tool table

Two problems:

```
| `clj-holmes` | `clj-holmes scan --rules-repository git@github.com:clj-holmes/clj-holmes-rules.git --path <scope>` |
| `semgrep`    | Skip unless the repo has a `.semgrep.yml`. If present: `semgrep scan --config .semgrep.yml <scope>` |
```

The clj-holmes row should go or be marked optional/legacy. The semgrep row is
actively wrong — semgrep is now the primary engine and should run with the
cleancoders rules whenever available, not be skipped for want of a
`.semgrep.yml`. Its invocation should mirror CI closely enough that an audit and
a PR agree.

Also worth adding to that command: findings suppressed in source with a
`nosemgrep` annotation appear in SARIF with `suppressions:[{kind:"inSource"}]`.
CI excludes those from both the table and the exit code. An audit that reports
them as live findings will contradict CI and re-litigate decisions a developer
already made.

### 5. Classes needing no work

The class index is already correct — `read-string-rce`, `weak-crypto`,
`insecure-tls-verification`, `xxe`, `command-injection`, `fail-open`,
`path-traversal` all exist with verified CWE/OWASP mappings, and all 16 rule
`metadata.class` values cross-check clean against it. Do not renumber or rename
classes; the CI rules key on those names and a rename silently breaks the join.

### 6. `hooks/session-start-marker.sh` tool check

Whatever the fork decision, this needs to stop telling users to install a tool
the pipeline no longer uses, or to start also checking for semgrep.

## Constraints

- **Tests are bash + shunit2**, `test/*_test.sh` at the repo root, sourcing
  `lib/shunit2` at the end. CI runs `for test_file in test/*_test.sh`.
- **Existing hook tests will need updating**: `security-stop-holmes_test.sh`,
  `holmes-autofetch_test.sh`, `non-clojure-gating_test.sh`,
  `session-start-toolcheck_test.sh`. Do not delete coverage to make a change
  pass — if a behaviour goes away, its test should assert the new behaviour.
- **Two shunit2 tests guard the skill index**:
  `skill-index-consistency_test.sh` (index rows ↔ reference headings, both
  directions) and `skill-taxonomy-ids_test.sh` (CWE/OWASP token format plus seven
  pinned mappings). Both must stay green. The pinned mappings were each verified
  against owasp.org per-category lists and six of them contradict the obvious
  guess — do not "correct" them.
- **Release process**: bump `plugins/clojure-security/VERSION`, prepend a
  `CHANGES` entry (prose bullets explaining *why*, matching existing style), then
  push to `master`. CI syncs `package.json` / `plugin.json` / `marketplace.json`
  and tags `clojure-security/v<version>`. **Never hand-edit those synced files.**
- `docs/` is gitignored in that repo but specs and plans are tracked; use
  `git add -f` for anything under `docs/`.
- Global instruction in force: **TDD**. Run existing tests before changing
  anything.

## Explicit non-goals

- Do not re-litigate the semgrep decision. It shipped, it is measured, and four
  consumer repos are on it.
- Do not add new vulnerability classes. The index is complete for the current
  rule set.
- Do not touch `cleancoders/github-actions`. If you find a CI-side bug, report it
  rather than fixing it from this session.
- Do not weaken the three WARNING rules' description into "blocking".

## Definition of done

1. No file in the plugin claims clj-holmes is part of CI.
2. Every `Detected in CI by:` line names a real `cc-*` rule.
3. The SKILL.md tool table describes semgrep's actual coverage *and* its two real
   blind spots (no dataflow, no alias resolution).
4. `/security-audit`'s semgrep invocation mirrors CI, including suppression
   handling, so an audit and a PR do not contradict each other.
5. The hook/local-enforcement fork is resolved and implemented per the human's
   choice, with tests updated rather than removed.
6. All `test/*_test.sh` green.
7. `VERSION` bumped, `CHANGES` entry written, pushed, and the
   `clojure-security/v<version>` tag confirmed.

## One thing worth surfacing to the human

The unchanged structural weakness: **10 of 19 applicable CWE Top 25 entries are
reachable only by a manual `/security-audit` run** — access control above all,
which no scanner covers. CI cannot invoke it, and nothing enforces a cadence.
That was a deliberate call (document, don't enforce), but this work touches the
audit command directly, so it is a natural moment to ask whether that should
change.
