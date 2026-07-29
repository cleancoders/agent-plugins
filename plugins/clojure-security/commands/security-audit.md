---
description: Run a Clojure / ClojureScript security audit on the current repo (or a scope arg) and produce a structured findings report.
argument-hint: "[scope] [--write] — scope: <path>|diff|staged|all (default: all); --write saves the report to docs/security-audits/"
---

# /security-audit

You are running a Clojure / ClojureScript security audit. Your job is to surface findings with reasoning — **never auto-fix**. The human (or a follow-up turn) decides what to change.

## Step 1 — Load the judgment layer

Invoke the `clojure-security` skill via the `Skill` tool **before doing anything else**. Every severity call, false-positive judgment, and fix-direction recommendation in this audit must come from that skill's vulnerability-class reference. Do not improvise severity or substitute generic OWASP framing.

## Step 2 — Resolve scope

Argument: `$ARGUMENTS` (may be empty).

| Arg | Scope |
|-----|-------|
| empty / `all` | Whole repo, excluding `.git`, `target`, `node_modules`, `dist`, `out`, `.cpcache`, `.shadow-cljs` |
| `staged` | Files in `git diff --staged --name-only` |
| `diff` | Files in `git diff --name-only HEAD` (uncommitted + staged) |
| `<path>` | A single file or directory passed as the argument |

For diff/staged scopes, only audit Clojure-shaped files: `*.clj`, `*.cljs`, `*.cljc`, `*.edn`. Skip the rest silently.

If the repo doesn't look like a Clojure project (no `deps.edn` / `project.clj` / `shadow-cljs.edn` at the root), stop and say so — don't audit a non-Clojure repo.

## Step 3 — Pattern sweep

Run the `## Quick-wins audit` grep block from `SKILL.md` against the scope, plus the
**Grep:** block from each reference file relevant to the scope. Use `rg` with
`--type clojure` and `--type edn` for whole-repo scope; otherwise pass explicit paths.

Do not restate the patterns here — they live in the skill, and a copy would drift.

Note: `\bread-string\b` matches both `clojure.core/read-string` (vulnerable) and `clojure.edn/read-string` (safe by default). Inspect each hit's namespace prefix before classifying.

## Step 4 — Route inventory sweep

Load `references/route-inventory.md` and run the procedure.

Run it always on `all` scope. On `diff` / `staged`, run it only if the diff touches
a route-defining file (matches `route`, `handler`, `middleware`, `api`, or `main` in
the path, or contains `defroutes` / `defroute` / a reitit route vector). Otherwise
state `route sweep: skipped (no route files in scope)` in the report.

The resulting matrix goes in its own report section. Rows with a `?` in the authn or
authz column are provisional findings, not confirmed gaps.

## Step 5 — Tool invocation (best effort, skip missing)

Run each tool only if it is installed (`command -v <tool>` returns 0). For each, report the version you ran and the count of findings.

| Tool | How to run (audit mode) |
|------|------------------------|
| `clj-kondo` | `clj-kondo --lint <scope>` — capture warnings + errors |
| `semgrep` | **The primary Clojure engine — run it whenever it is installed.** Resolve the cleancoders rules the way the hooks do: `$CC_SEMGREP_RULES_DIR` if set, else `/tmp/cc-semgrep-rules-v1` if non-empty, else fetch it (see `hooks/lib/semgrep-rules.sh`). Then mirror CI: `semgrep scan --json --config <cc-rules> --config p/owasp-top-ten --config p/default <scope>` |
| `gitleaks` | `gitleaks detect --no-banner --redact --source <scope>` (use `--no-git` for non-git paths) |
| `clj-watson` | Only on `all` scope: `clj-watson scan -p deps.edn -o stdout` (or the project's `:clj-watson` deps alias) — SCA against `deps.edn` |

If a tool is missing, list it under **Tools not run** in the report — don't pretend it ran.

**Severity from semgrep.** 13 `cc-*` rules are `ERROR` and gate CI. Three —
`cc-path-traversal`, `cc-generic-catch`, `cc-clojure-xml-xxe` — are `WARNING` and
deliberately do **not** gate: without dataflow they cannot be precise enough.
Report them, but never as blocking.

**Suppressions.** A finding suppressed in source with a `nosemgrep` annotation is
absent from `--json` output and excluded from CI's table and exit code. Do not
resurrect it. Reporting a suppressed finding as live contradicts CI and
re-litigates a decision a developer already made — list it under **False
positives considered** with `suppressed in source` as the reason, if at all.

**No namespace-alias resolution.** Semgrep enumerates aliases per rule; an
unusual alias is a silent miss. When the pattern sweep in Step 3 finds a sink
that semgrep did not report, trust the sweep.

For each tool finding, look up the matching vulnerability class in the skill and apply the skill's severity heuristic. Don't take the tool's severity at face value; map to the skill's three-axis model (reachability × impact × prerequisites).

## Step 6 — Triage every candidate

For each pattern hit and tool finding, run the skill's investigation order:

1. Source of tainted value — walk back to the entry point. If you can't, mark **provisional**.
2. Trust boundary crossed.
3. Existing sanitization on the path.
4. Whether removing the sink would break legitimate use.
5. Other call sites with the same sink shape.

Annotate any finding you've ruled out as a false positive with the reason in one short clause. Don't drop it silently — readers should see what you considered.

## Step 7 — Produce the report

Write the report to stdout (the conversation). Do **not** create a file unless the user follows up asking for one.

```
# Clojure security audit — <scope>
# <repo name> @ <git short SHA>
# <ISO date>

## Summary
  Critical: N    High: N    Medium: N    Low: N    Provisional: N
  Tools run:     clj-kondo (v…)  semgrep (v…)  gitleaks (v…)
  Tools missing: clj-watson

## Critical
  path/to/file.clj:42  [class-name]  CWE-89 · A05  <one-line problem>. <fix direction>.
  …

## High
  …

## Medium
  …

## Low
  …

## Provisional (provenance not traced)
  path/to/file.clj:101  [class-name]  CWE-639 · A01  <reason it could not be confirmed>.

## Route matrix
  | route | method | handler | authn | authz | owns-check | notes |
  |-------|--------|---------|-------|-------|------------|-------|
  …
  (or: route sweep: skipped (no route files in scope))

## Coverage
  Classes checked:  <n> of 27
  Classes skipped:  <list with one-clause reasons>

  CWE Top 25 (2025) — 19 of 25 applicable to Clojure
    findings:        <#rank CWE-<id> list>
    checked, clean:  <#rank CWE-<id> list>
    not reachable:   <#rank CWE-<id> list, with a one-clause reason each>
    no class:        CWE-476 (#13), CWE-20 (#18)
    not applicable:  CWE-787, 416, 125, 120, 121, 122 (memory safety)

  OWASP Top 10:2025
    A01  <findings (n) | checked, clean | not reachable — reason>
    A02  …
    A03  …
    A04  …
    A05  …
    A06  …
    A07  …
    A08  …
    A09  …
    A10  …

## False positives considered
  path/to/file.clj:7  read-string on constant build-config string — safe.
  …

## Out of scope (flagged for follow-up)
  - <items the skill explicitly defers — see its "Out of scope here" section>
```

**CWE / OWASP tags** come from the class index table in `SKILL.md` — read them
from that table, never from memory.

**The Coverage rollup** comes from `references/taxonomy-coverage.md`. Load it and
use its three states literally: `findings (n)`, `checked, clean`, `not reachable`.
Never collapse the last two. A category with no class and a category with a clean
result must not print the same way — that distinction is what makes an audit run
usable as evidence rather than a list, and the current report is the only place a
reader can learn that 10 of the applicable Top 25 entries need human eyes.

**Class names** must come verbatim from the class index table in `SKILL.md`, so findings can be grouped over time. Do not invent a class name; if a finding fits none of the listed classes, report it under **Out of scope (flagged for follow-up)** instead.

**Severity tone:** terse, factual, action-oriented. One line per finding. No paragraphs. No praise. If the audit is clean, the body of each section is the literal text `clean`.

## Step 7b — Optional file output

Default is stdout only. If the arguments contain `--write`, additionally save the
report to `docs/security-audits/YYYY-MM-DD-<git short SHA>.md`, creating the
directory if needed, and print the path.

Writing a file is the only side effect this command may ever have, and only on
explicit request. Everything else in Step 8 still applies: do not edit code, do not
stage, do not commit.

## Step 8 — Stop

Do not edit code. Do not stage anything. Do not commit. Hand the report back and stop.

If the user follows up asking for fixes, treat that as a new task — load the affected file(s), let the user pick which findings to address, then apply TDD per the project's normal workflow.
