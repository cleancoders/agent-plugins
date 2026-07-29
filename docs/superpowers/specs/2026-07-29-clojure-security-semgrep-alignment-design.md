# Design: align clojure-security with semgrep, and add an LLM diff review

Plugin `plugins/clojure-security` in `cleancoders/agent-plugins`, currently
0.11.0 → target **0.12.0**.

Supersedes the fork left open in
`docs/superpowers/specs/2026-07-28-clojure-security-semgrep-alignment-handoff.md`.
That brief is the record of *why* CI dropped clj-holmes; this is the record of
what the plugin does about it.

## Problem

`cleancoders/github-actions` replaced clj-holmes with 16 first-party semgrep
rules (`cc-*`). The plugin's three hooks still run clj-holmes, so a developer's
Stop hook and their PR check enforce different rule sets — and the local one
cannot see `.cljs` or `.cljc` at all, which is where CWE-79 (#1 on the Top 25)
and c3kit's shared domain logic live.

A second, larger gap was surfaced while resolving the first: **13 of the
plugin's 27 vulnerability classes have no scanner at all.** They were reachable
only by a manual `/security-audit` that nothing triggers. Semgrep cannot reach
them — they need dataflow, alias resolution, or whole-route reasoning. An LLM
with the session diff can. That capability is the plugin's actual advantage over
CI, and it was unused.

## Decisions taken

| Question | Decision |
|---|---|
| How do local hooks get the `cc-*` rules? | Fetch + cache at a pinned ref, with `CC_SEMGREP_RULES_DIR` override |
| WARNING-severity rules locally? | Mirror CI — `ERROR` blocks, `WARNING` reports |
| clj-holmes | Removed from all hooks |
| LLM review venue | `Stop`, scoped by a per-turn edit ledger |
| Which classes does the LLM review? | All 13 scanner-blind classes, no grep routing table |
| Enforced audit cadence | Out of scope — the Stop-hook review covers 9 of the 10 audit-only Top 25 entries, which was the real complaint |

## Verified facts this design rests on

Established by running the tools, not from memory:

- `semgrep 1.157.0` runs the `cc-*` rules on `.clj` with **no experimental
  flag** and zero parse errors.
- `nosemgrep`-suppressed findings are **absent from `--json` output entirely** —
  no extra handling needed to match CI's suppression behaviour.
- Per-finding severity is at `.extra.severity`; `check_id` is path-prefixed when
  `--config` is an absolute path, so display must strip to the last dot-segment.
- `cleancoders/github-actions` is **public** and tag `v1` exists → unauthenticated
  HTTPS fetch works; rules are 64K across 16 files.
- All 10 upstream clj-holmes **security** rules are subsumed by `cc-*`:
  `cc-weak-crypto` matches ECB/Blowfish/DESede/RC2/RC4/DES/MD2-5/SHA1;
  `cc-insecure-tls` covers `SSLContext` + `HostnameVerifier`; `read-string` and
  XXE have direct counterparts. The only orphan is
  `correctness/schema-require-typo.yml`, which is not security.
- `Stop` fires at the end of **every turn** (`SessionEnd` is the session-end
  event, handled by `session-end-cleanup.sh`), and `security-stop.sh` computes a
  **cumulative** diff (`${BASE_SHA}...HEAD` + uncommitted + untracked). Both
  facts drive the ledger design below.
- `SessionEnd` cannot host the LLM review: it can neither block nor inject
  context, so Claude could not act on anything it produced.
- CWE Top 25 (2025) verified against
  `https://cwe.mitre.org/top25/archive/2025/2025_cwe_top25.html` on 2026-07-29.
- OWASP Top 10:2025 category titles verified against `https://owasp.org/Top10/2025/`
  on 2026-07-29, and cross-checked against the seven already pinned in the CI
  rules' `metadata.owasp`.

## Component A — rule delivery

New `plugins/clojure-security/hooks/lib/semgrep-rules.sh`, sourced by
`security-stop.sh` and `commit-backstop.sh`. One function,
`resolve_semgrep_rules`, echoing a rules directory or nothing:

1. `CC_SEMGREP_RULES_DIR` set and non-empty → echo it, no network.
2. Cache `/tmp/cc-semgrep-rules-v1` non-empty → echo it, no network.
3. Cold cache → `curl -fsSL` the `v1` tarball from the public repo, extract
   `security-rules/semgrep/` into the cache, echo it. Best-effort: any failure
   echoes nothing and the caller skips the Clojure scan.

`/tmp/cc-semgrep-rules-v1` deliberately mirrors the existing
`/tmp/clj-holmes-rules` convention, and the ref is in the directory name so a
future `v2` cannot be served from a `v1` cache.

Pinning to `v1` — the same ref the four consumer repos resolve — is what
prevents local and CI drifting to different rule versions. This is why the
option of vendoring a copy in the plugin was rejected: two copies is the drift
the generated coverage matrix exists to prevent, and an offline drift-check has
no way to detect it.

Network on a Stop hook is not a new cost: `security-stop.sh:152` already runs
`clj-holmes fetch-rules` on a cold cache today.

## Component B — semgrep in the hooks

Both scanning hooks replace their clj-holmes block with:

```
semgrep scan --json --quiet --config "$RULES_DIR" <files…>
```

Findings partition on `.extra.severity`:

- **`ERROR`** (13 rules) → blocks, exactly as clj-holmes findings do today.
  `security-stop.sh` exits 2; `commit-backstop.sh` exits 2.
- **`WARNING`** (`cc-path-traversal`, `cc-generic-catch`, `cc-clojure-xml-xxe`)
  → printed under a separate advisory heading, does **not** gate.

The WARNING rules are non-blocking in CI on purpose — without dataflow they
cannot be precise enough to gate a build, and `cc-generic-catch` fires on
ordinary `(catch Exception e …)`. Local and CI must agree, and a local gate
stricter than CI gets muted, which costs more than it buys.

Report line format keeps the existing shape so the triage instructions still
read correctly:

```
path:line:col  ERROR  [cc-sql-string-concat]  <message>
```

Only the local cc-rules directory is used — not CI's additional
`--config p/owasp-top-ten --config p/default`. Those are registry configs that
fetch per run, and they contribute no Clojure rules. `/security-audit` mirrors
CI in full; the per-turn hooks stay fast and offline-after-first-fetch.

`session-start-marker.sh` drops its clj-holmes check and its trailing
rules-dir note, and adds:

```
semgrep — Clojure security-pattern SAST in the Stop and PreToolUse hooks
  `brew install semgrep` — the hooks fetch the cleancoders rule set on first
  scan; set CC_SEMGREP_RULES_DIR to a github-actions checkout to skip the fetch
```

`clj-watson`'s note keeps its URL but stops describing clj-holmes as a sibling
tool.

## Component C — the LLM diff review

Covers the 13 classes no scanner reaches: `missing-authn`, `missing-authz`,
`incorrect-authz`, `idor`, `csrf`, `ssrf`, `mass-assignment`, `atom-toctou`,
`macro-runtime-input`, `security-misconfig`, `logging-failures`,
`unrestricted-upload`, `resource-exhaustion`.

### C1 — turn ledger

New `plugins/clojure-security/hooks/turn-ledger.sh`, added to the existing
`PostToolUse` / `Edit|Write|MultiEdit` matcher alongside
`clj-kondo-postedit.sh`. It reads `.tool_input.file_path` or
`.tool_input.file_paths[]`, keeps `*.clj|*.cljs|*.cljc`, and appends each to
`.claude/.security-turn-files`. Always `exit 0`.

A separate script rather than five lines inside `clj-kondo-postedit.sh`: that
hook's contract is precise about exit codes 0/1/2, a ledger write must never
perturb them, and it gates on `command -v clj-kondo` at line 66 — a machine
without clj-kondo would silently write no ledger. Separate also means its own
shunit2 test.

`.edn` and `.bb` are excluded here, unlike the lint hook — the 13 classes are
about handlers, routes and dataflow, not config files.

### C2 — review directive

`security-stop.sh`, after the semgrep and gitleaks blocks:

1. Read `.claude/.security-turn-files`.
2. **Delete it unconditionally** — before deciding whether to review, so a
   review that fails to fire cannot leave the ledger to accumulate across turns.
3. If it was empty or absent → no review.
4. If `stop_hook_active` is `true` → no review. The directive is one-shot per
   turn; without this the hook re-blocks forever, since a directive has no
   findings to clear.
5. Otherwise block, listing exactly those files and instructing:
   - review **only** these files, do not sweep the repo;
   - load `references/access-control.md` and `references/route-inventory.md`;
   - the 13 class names verbatim;
   - apply the skill's investigation order and severity heuristic;
   - report findings and stop — do not auto-fix.

This is why a cache of content hashes is not needed. The problem a cache would
have solved — turn 40 re-reviewing the files it reviewed on turn 3, because the
diff is cumulative — is solved by scoping to what the ledger says changed *this
turn*. No hashing, no staleness, no cross-session lifetime question.

No grep routing table maps diff content to a class subset. The LLM judges
relevance better than marker patterns do, and a missing marker would be a silent
skip — the exact failure mode that made clj-holmes untrustworthy.

### C3 — known limits, to be stated in the hook's comment header

- **Files changed by `Bash`** (`sed`, a script, `git checkout`) never enter the
  ledger. Semgrep still scans them via the cumulative diff; only the LLM review
  is ledger-scoped.
- **The hook cannot verify the review happened.** It blocks once and trusts
  Claude to comply — the same weakness every Stop-hook directive has.
- Opt-out: `CC_SKIP_DIFF_REVIEW=1` skips step 5 while still draining the ledger.

`session-end-cleanup.sh` removes `.claude/.security-turn-files` alongside the
SHA marker.

## Component D — `/security-audit` taxonomy awareness

### D1 — Step 5 tool table

Drop the clj-holmes row. Replace the semgrep row — it currently says to skip
unless a `.semgrep.yml` exists, which is now backwards — with the CI-mirroring
invocation:

```
semgrep scan --config <cc-rules-dir> --config p/owasp-top-ten --config p/default <scope>
```

resolving `<cc-rules-dir>` through the same `CC_SEMGREP_RULES_DIR` → cache →
fetch order as the hooks. Add: findings suppressed with `nosemgrep` are excluded
from both CI's table and its exit code, so the audit must not report them as
live findings — doing so contradicts CI and re-litigates a decision a developer
already made.

Line 90's `Tools run: … clj-holmes (v…)` becomes `semgrep (v…)`.

### D2 — `route` column on the SKILL.md class index

One of `semgrep:<rule-id>` (comma-separated if several), `llm-review`,
`clj-watson`, or `audit-only`. Roughly 12 characters per row, and it makes the
local / CI / audit split legible at the point of use — which class is caught
when, without cross-referencing another repo.

### D3 — new `references/taxonomy-coverage.md`

The reverse index. Lives in `references/` so it loads only for `/security-audit`
and does not re-inflate SKILL.md, which the 0.11.0 refactor shrank from 341
lines to 148 for that reason.

**CWE Top 25 (2025)** — rank, ID, applicability, class, route. 19 of 25 are
applicable to Clojure; the 6 excluded are memory-safety weaknesses the JVM
manages:

| rank | CWE | class | route |
|---|---|---|---|
| 1 | 79 | hiccup-injection, cljs-dom-xss | semgrep |
| 2 | 89 | sql-injection | semgrep |
| 3 | 352 | csrf | llm-review |
| 4 | 862 | missing-authz | llm-review |
| 5 | 787 | — not applicable (memory safety) | — |
| 6 | 22 | path-traversal | semgrep (WARNING) + llm-review |
| 7 | 416 | — not applicable (memory safety) | — |
| 8 | 125 | — not applicable (memory safety) | — |
| 9 | 78 | command-injection | semgrep |
| 10 | 94 | read-string-rce, dynamic-eval, cljs-dom-xss, macro-runtime-input | semgrep + llm-review |
| 11 | 120 | — not applicable (memory safety) | — |
| 12 | 434 | unrestricted-upload | llm-review |
| 13 | 476 | **no class** — NPE is a clj-kondo concern, not a security class here | — |
| 14 | 121 | — not applicable (memory safety) | — |
| 15 | 502 | java-deserialization | semgrep |
| 16 | 122 | — not applicable (memory safety) | — |
| 17 | 863 | incorrect-authz | llm-review |
| 18 | 20 | **no class** | — |
| 19 | 284 | incorrect-authz | llm-review |
| 20 | 200 | **partial** — spec-malli-leak (209, 550), logging-failures (532, 778) | semgrep + llm-review |
| 21 | 306 | missing-authn | llm-review |
| 22 | 918 | ssrf | llm-review |
| 23 | 77 | command-injection | semgrep |
| 24 | 639 | idor | llm-review |
| 25 | 770 | resource-exhaustion | llm-review |

**OWASP Top 10:2025** — all ten categories have at least one class:

| category | classes | route |
|---|---|---|
| A01 Broken Access Control | missing-authz, incorrect-authz, idor, csrf, path-traversal, ssrf | llm-review + semgrep (WARNING) |
| A02 Security Misconfiguration | xxe, security-misconfig | semgrep (WARNING) + llm-review |
| A03 Software Supply Chain Failures | transitive-cve | clj-watson |
| A04 Cryptographic Failures | weak-crypto | semgrep |
| A05 Injection | read-string-rce, dynamic-eval, sql-injection, hiccup-injection, cljs-dom-xss, command-injection, macro-runtime-input | semgrep + llm-review |
| A06 Insecure Design | unrestricted-upload | llm-review |
| A07 Authentication Failures | missing-authn, insecure-tls-verification | llm-review + semgrep |
| A08 Software or Data Integrity Failures | java-deserialization, mass-assignment | semgrep + llm-review |
| A09 Security Logging and Alerting Failures | logging-failures | llm-review |
| A10 Mishandling of Exceptional Conditions | spec-malli-leak, fail-open | semgrep (one ERROR, one WARNING) |

`atom-toctou` (CWE-367) and `resource-exhaustion` (CWE-770, 400) map to no 2025
category — already noted in the class index and pinned by test.

The file carries a `Verified against <url> on 2026-07-29` line for each table.

**Do not add classes for CWE-20, CWE-476, or CWE-200.** The brief's non-goal
holds. Recording them as gaps is the point of a reverse index: it makes an
absence visible instead of invisible.

### D4 — Coverage section rollup

Replace the current two `touched: <ids>` lines with a three-state verdict per
taxonomy entry, driven by `taxonomy-coverage.md`:

```
## Coverage
  Classes checked:  <n> of 27
  Classes skipped:  <list with one-clause reasons>

  CWE Top 25 (2025) — 19 of 25 applicable to Clojure
    findings:        <rank/id list>
    checked, clean:  <rank/id list>
    no class:        CWE-476 (#13), CWE-20 (#18)
    not applicable:  CWE-787, 416, 125, 120, 121, 122 (memory safety)

  OWASP Top 10:2025
    A01  findings (3)
    A02  checked, clean
    A03  not run (clj-watson missing)
    …
```

`checked, clean` and `not reachable by this audit` are different claims, and the
current report cannot distinguish them. That distinction is the whole value of
an audit run as evidence.

### D5 — stale CI attributions

`references/config-and-ops.md` line ~179 and ~225 credit clj-holmes for CI
detection. Rewrite in the form `references/injection.md` already uses:

- `**Detected in CI by:** \`cc-weak-crypto\` (semgrep).`
- `**Detected in CI by:** \`cc-insecure-tls\` (semgrep).`

`SKILL.md` frontmatter `description` and line 12 drop `clj-holmes` from the tool
list. Trigger phrasing otherwise untouched — it is what makes the skill fire.

`SKILL.md` tool table — both stale rows replaced by one honest one:

| Tool | Covers | Blind to |
|---|---|---|
| **Semgrep** | the only Clojure engine in CI; 16 first-party `cc-*` rules across `.clj`, `.cljs`, `.cljc` | no dataflow; **no namespace-alias resolution** — each rule enumerates aliases, so an unusual one is a silent miss. `cc-weak-crypto` and `cc-insecure-tls` are `pattern-regex` and can fire inside a comment |

`README.md` lines 6, 27, 37, 42, 52, 55 updated the same way, and gain the
`CC_SEMGREP_RULES_DIR` documentation plus a section on the Stop-hook LLM review.

## Testing

Bash + shunit2, `test/*_test.sh`, sourcing `lib/shunit2` at the end. No test may
touch the network — the fetch path is exercised with a stub `curl` earlier on
`PATH`, and the happy paths set `CC_SEMGREP_RULES_DIR` to a fixture directory.

**Updated, not deleted** — where a behaviour goes away its test asserts the
replacement:

| existing | becomes |
|---|---|
| `security-stop-holmes_test.sh` | `security-stop-semgrep_test.sh` — ERROR blocks, WARNING reports without gating, missing semgrep skips silently, `check_id` prefix stripped |
| `holmes-autofetch_test.sh` | `semgrep-rules-fetch_test.sh` — env override wins, cold cache fetches, warm cache does not, fetch failure skips silently |
| `non-clojure-gating_test.sh` | tool-presence gate keys on semgrep, not clj-holmes |
| `session-start-toolcheck_test.sh` | semgrep noted when missing; asserts clj-holmes is **not** mentioned |
| `skill-index-consistency_test.sh` | row parser tolerates the new `route` column; both-direction check unchanged |
| `skill-taxonomy-ids_test.sh` | adds `route`-column format validation and asserts every `semgrep:` value names a real `cc-*` rule. The seven pinned CWE→OWASP mappings are untouched — each was verified against owasp.org and six contradict the obvious guess |

**New:**

- `turn-ledger_test.sh` — appends `.clj/.cljs/.cljc`, ignores others, handles
  MultiEdit's `file_paths` array, exits 0 with clj-kondo absent, exits 0 with jq
  absent.
- `security-stop-review_test.sh` — non-empty ledger blocks with a directive
  naming those files; ledger deleted whether or not the review fired;
  `stop_hook_active=true` suppresses re-issue; `CC_SKIP_DIFF_REVIEW=1` drains
  without blocking.
- `taxonomy-coverage_test.sh` — reverse index and forward class index agree in
  both directions; all 25 ranks present exactly once; every row is classified as
  applicable, not-applicable, or no-class.

## Release

`VERSION` → `0.12.0` (new capability plus a behaviour change in three hooks),
`CHANGES` entry in the existing prose-bullet style explaining *why*, push to
`master`. CI syncs `package.json` / `plugin.json` / `marketplace.json` and tags
`clojure-security/v0.12.0`. Those synced files are never hand-edited.

`docs/` is gitignored; commit this spec with `git add -f`.

## Result

The headline, and the reason this is worth 0.12.0 rather than a doc patch:
**9 of the 19 Clojure-applicable CWE Top 25 entries move from
manual-audit-only to per-turn local review** — CWE-352, 862, 434, 863, 284, 306,
918, 639 and 770. Local enforcement stops being a weaker subset of CI and
becomes a superset: the same 16 rules, plus the 13 classes no scanner can reach.
