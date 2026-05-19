---
description: Run a Clojure / ClojureScript security audit on the current repo (or a scope arg) and produce a structured findings report.
argument-hint: "[scope] — optional. One of: <path>, diff, staged, all (default: all)"
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

Run the quick-wins grep block from the skill against the scope. Use `rg` (ripgrep) with `--type clojure` plus `--type edn` when the scope is the whole repo; otherwise pass the specific paths.

Patterns (from skill — keep in sync):

```
\bread-string\b
\beval\b
\bload-string\b|\bload-file\b
\brequiring-resolve\b
ObjectInputStream
XMLDecoder
new\s+Yaml\s*\(\s*\)
:readers\s*\{
data_readers\.cljc?
clojure\.xml/parse|data\.xml/parse|SAXParserFactory|DocumentBuilderFactory
\(str\s+"[^"]*\b(SELECT|INSERT|UPDATE|DELETE)\b
ORDER BY\s+"\s*\)
jdbc/execute!\s+\S+\s+\(str
hiccup\.(core|util)/raw|\braw-string\b
selmer/render-file
\{%\s*(include|safe)
javascript:
\bjs/eval\b|\bjs/Function\b|:dangerouslySetInnerHTML|\.-innerHTML
\bset-html!\b
explain-data|me/humanize
```

Note: `\bread-string\b` matches both `clojure.core/read-string` (vulnerable) and `clojure.edn/read-string` (safe by default). Inspect each hit's namespace prefix before classifying.

## Step 4 — Tool invocation (best effort, skip missing)

Run each tool only if it is installed (`command -v <tool>` returns 0). For each, report the version you ran and the count of findings.

| Tool | How to run (audit mode) |
|------|------------------------|
| `clj-kondo` | `clj-kondo --lint <scope>` — capture warnings + errors |
| `clj-holmes` | `clj-holmes scan --rules-repository git@github.com:clj-holmes/clj-holmes-rules.git --path <scope>` (or installed equivalent) |
| `gitleaks` | `gitleaks detect --no-banner --redact --source <scope>` (use `--no-git` for non-git paths) |
| `nvd-clojure` | Only on `all` scope: dependency-check against `deps.edn` / `project.clj` (use the project's documented invocation) |
| `semgrep` | Skip unless the repo has a `.semgrep.yml`. If present: `semgrep scan --config .semgrep.yml <scope>` |

If a tool is missing, list it under **Tools not run** in the report — don't pretend it ran.

For each tool finding, look up the matching vulnerability class in the skill and apply the skill's severity heuristic. Don't take the tool's severity at face value; map to the skill's three-axis model (reachability × impact × prerequisites).

## Step 5 — Triage every candidate

For each pattern hit and tool finding, run the skill's investigation order:

1. Source of tainted value — walk back to the entry point. If you can't, mark **provisional**.
2. Trust boundary crossed.
3. Existing sanitization on the path.
4. Whether removing the sink would break legitimate use.
5. Other call sites with the same sink shape.

Annotate any finding you've ruled out as a false positive with the reason in one short clause. Don't drop it silently — readers should see what you considered.

## Step 6 — Produce the report

Write the report to stdout (the conversation). Do **not** create a file unless the user follows up asking for one.

```
# Clojure security audit — <scope>
# <repo name> @ <git short SHA>
# <ISO date>

## Summary
  Critical: N    High: N    Medium: N    Low: N    Provisional: N
  Tools run:     clj-kondo (v…)  clj-holmes (v…)  gitleaks (v…)
  Tools missing: nvd-clojure, semgrep

## Critical
  path/to/file.clj:42  [class-name]  <one-line problem>. <fix direction>.
  …

## High
  …

## Medium
  …

## Low
  …

## Provisional (provenance not traced)
  path/to/file.clj:101  [class-name]  <reason it could not be confirmed>.

## False positives considered
  path/to/file.clj:7  read-string on constant build-config string — safe.
  …

## Out of scope (flagged for follow-up)
  - No CSP header configured in <handler ns> — application-config concern; not in this skill.
  - <other items the skill explicitly defers>
```

**Class names** must come from the skill's section headings (e.g., `read-string-rce`, `dynamic-eval`, `java-deserialization`, `xxe`, `sql-injection`, `hiccup-injection`, `cljs-dom-xss`, `atom-toctou`, `reflection`, `spec-malli-leak`, `macro-runtime-input`, `transitive-cve`). Use them verbatim so findings can be grouped over time.

**Severity tone:** terse, factual, action-oriented. One line per finding. No paragraphs. No praise. If the audit is clean, the body of each section is the literal text `clean`.

## Step 7 — Stop

Do not edit code. Do not stage anything. Do not commit. Hand the report back and stop.

If the user follows up asking for fixes, treat that as a new task — load the affected file(s), let the user pick which findings to address, then apply TDD per the project's normal workflow.
