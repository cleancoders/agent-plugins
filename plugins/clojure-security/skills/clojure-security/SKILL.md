---
name: clojure-security
description: Use when reviewing Clojure or ClojureScript code for security issues, auditing for RCE via read-string / eval, unsafe Java deserialization, SQL injection through string concatenation, XXE in clojure.xml or data.xml, Hiccup / Selmer template injection, CLJS DOM XSS, atom check-then-act races, spec or Malli error-message data leaks, or interpreting clj-kondo / Semgrep / gitleaks / clj-watson findings on a Clojure codebase.
---

# Clojure Security

## Overview

Clojure is safer than many ecosystems for memory-safety and state-mutation bugs, but inherits the JVM's attack surface and adds a handful of language-specific footguns. Most vulnerabilities below come from useful features fed untrusted input.

**This skill is the judgment layer.** The mechanical layer — `clj-kondo`, Semgrep, `gitleaks`, `clj-watson` — reports raw findings. This skill interprets them: pattern, false-positive notes, severity floor, fix direction.

## When to apply

- Reviewing a diff or PR in a Clojure / ClojureScript codebase
- Running an audit on demand (e.g. `/security-audit`)
- Triaging a finding from any of the tools listed above
- Designing or modifying code that touches: input parsing, deserialization, dynamic dispatch, SQL, HTML/template rendering, XML / YAML, secrets, auth state

## Investigation order (when triaging a single finding)

1. **What is the source of the tainted value?** Walk from sink back to the request handler / entry point. If you can't, finding is provisional.
2. **What trust boundary does it cross?** Network / disk / IPC / same-JVM. No boundary → not a vuln.
3. **What sanitization already exists on the path?** Don't assume none; don't assume sufficient.
4. **Would removing the sink break legitimate use?** If yes, propose an allowlist or safer API, not deletion.
5. **What other call sites share the sink shape?** Grep the codebase — findings are rarely unique.

## Severity heuristic

Three axes; combine by judgment, don't compute:

| Axis | Levels (worst → best) |
|------|----------------------|
| **Reachability** | unauthenticated network → authenticated user → admin tool → internal job |
| **Impact** | RCE / auth bypass → data exfil / SSRF / SQLi → XSS / CSRF → info disclosure |
| **Prerequisites** | none → timing window → specific config → attacker-on-host |

Per-class severity floors are listed in each class's entry under `references/`. Override down only with explicit reachability evidence.

## Vulnerability classes

Classes live in `references/`. Load only the file you need — do not read them all.

| class | CWE | OWASP 2025 | route | ref |
|-------|-----|------------|-------|-----|
| `read-string-rce` | 94 | A05 | semgrep:cc-read-string | injection |
| `dynamic-eval` | 94 | A05 | semgrep:cc-load-string | injection |
| `sql-injection` | 89 | A05 | semgrep:cc-sql-string-concat | injection |
| `hiccup-injection` | 79 | A05 | semgrep:cc-hiccup-raw | injection |
| `cljs-dom-xss` | 79, 94 | A05 | semgrep:cc-cljs-innerhtml,cc-cljs-eval,cc-dangerously-set-html | injection |
| `command-injection` | 78, 77 | A05 | semgrep:cc-shell-exec | injection |
| `macro-runtime-input` | 94 | A05 | llm-review | injection |
| `xxe` | 611 | A02 | semgrep:cc-clojure-xml-xxe | injection |
| `java-deserialization` | 502 | A08 | semgrep:cc-nippy-thaw,cc-snakeyaml-unsafe | deserialization |
| `transitive-cve` | varies | A03 | clj-watson | deserialization |
| `atom-toctou` | 367 | (none) | llm-review | access-control |
| `spec-malli-leak` | 209, 550 | A10 | semgrep:cc-explain-data-response | exceptional-conditions |
| `missing-authn` | 306 | A07 | llm-review | access-control |
| `missing-authz` | 862 | A01 | llm-review | access-control |
| `incorrect-authz` | 863, 284 | A01 | llm-review | access-control |
| `idor` | 639 | A01 | llm-review | access-control |
| `csrf` | 352 | A01 | llm-review | access-control |
| `path-traversal` | 22 | A01 | semgrep:cc-path-traversal | access-control |
| `ssrf` | 918 | A01 | llm-review | access-control |
| `mass-assignment` | 915 | A08 | llm-review | access-control |
| `fail-open` | 636, 396 | A10 | semgrep:cc-generic-catch | exceptional-conditions |
| `security-misconfig` | 16, 614, 1004 | A02 | llm-review | config-and-ops |
| `logging-failures` | 778, 532 | A09 | llm-review | config-and-ops |
| `unrestricted-upload` | 434 | A06 | llm-review | config-and-ops |
| `resource-exhaustion` | 770, 400 | (none) | llm-review | config-and-ops |
| `weak-crypto` | 327, 328 | A04 | semgrep:cc-weak-crypto | config-and-ops |
| `insecure-tls-verification` | 295 | A07 | semgrep:cc-insecure-tls | config-and-ops |

`route` is how a finding in that class reaches you: `semgrep:<rule>` gates CI and
the local hooks; `llm-review` is covered by the Stop hook's per-turn review and
`/security-audit`; `clj-watson` runs only in `/security-audit`. 13 classes are
semgrep-detectable, 13 are `llm-review`, 1 is `clj-watson`.

`cc-path-traversal`, `cc-generic-catch` and `cc-clojure-xml-xxe` are **WARNING**
severity — advisory in CI and in the hooks. Without dataflow they cannot be
precise enough to gate a build.

Note `xxe` is **A02 Security Misconfiguration**, not A05 — XXE is a parser-hardening
failure in the 2025 taxonomy. `atom-toctou` (CWE-367) maps to no 2025 category.

Access-control findings come from a route sweep rather than pattern matching — see
`references/route-inventory.md`. No scanner covers this; it is the skill's
highest-value output.

### Reflection — a practice note, not a class

Reflection is not a vulnerability. It is an auditability smell that occasionally
surfaces unexpected method resolution under adversarial input. Set
`(set! *warn-on-reflection* true)` at the top of any namespace handling auth, authz,
or input parsing, and add type hints to clear the warnings.

## Quick-wins audit

First hour on any unfamiliar Clojure codebase:

```
rg -n '\bread-string\b'                  # not edn/read-string
rg -n '\beval\b'
rg -n '\bload-string\b|\bload-file\b'
rg -n 'ObjectInputStream'
rg -n ':readers\s*\{'
rg -n 'data_readers\.cljc?'
rg -n '\(str\s+"[^"]*\b(SELECT|INSERT|UPDATE|DELETE)\b'
rg -n '\bjs/eval\b|\bjs/Function\b|:dangerouslySetInnerHTML|\.-innerHTML'
rg -n 'hiccup\.\w+/raw|\braw-string\b'
rg -n 'clojure\.xml/parse|data\.xml/parse|new\s+Yaml\s*\(\s*\)'
rg -n 'explain-data|me/humanize'
```

Most Clojure codebases yield at least one real finding from this set.

## Tool findings — coverage and blind spots

| Tool | Covers | Blind to |
|------|--------|----------|
| **clj-kondo** | unresolved syms, arity, shadowed locals, reflection warnings | semantics, taint, deserialization, SQLi |
| **clj-watson** | transitive deps vs. GitHub Advisory DB / NVD | source-level bugs, runtime config |
| **gitleaks** | secrets matching regex / entropy heuristics | custom-encoded secrets; keys referenced by path |
| **Semgrep** | the only Clojure engine in CI: 16 first-party `cc-*` rules over `.clj`, `.cljs` and `.cljc` | no dataflow; **no namespace-alias resolution** — each rule enumerates aliases, so an unusual one is a silent miss. `cc-weak-crypto` and `cc-insecure-tls` are `pattern-regex` and can match inside a comment |
| **CodeQL / Snyk Code** | Java bytecode after AOT — JVM-shaped issues | Clojure idioms |

If every tool reports clean, that means none of them looked at the code the way an attacker would. Read it.

## False-positive discipline

Noisy rules teach Claude and reviewers to route around the skill. When in doubt:

- Provenance unknown → mark **provisional**, don't auto-block
- Sink reachable only via internal-only network → downgrade
- Already-fixed call site flagged again → adjust the pattern, not the finding

Annotate intentional safe calls inline so the next reviewer doesn't relitigate them:

```clojure
;; clojure-security: read-string OK — constant string from build config
(read-string +build-version-edn+)
```

## Out of scope here

- Auth protocol design (OAuth / SAML / OIDC) — separate skill; link from there when written

## Common mistakes when applying this skill

| Mistake | Reality |
|---------|---------|
| Reporting every `eval` hit as Critical | Most `eval` is inside macros on compile-time forms — trace provenance first |
| Treating `clojure.edn/read-string` as fully safe | Custom `:readers` and `data_readers.cljc` still execute code |
| Assuming `next.jdbc` is injection-proof | Parameterized statements are; dynamic identifiers (`ORDER BY`, table names) are not |
| Calling every Hiccup template injection High | Severity depends on whether output crosses to another user (stored XSS) or only back to the originator (reflected) |
| Auto-fixing findings | Don't. Surface the finding with reasoning; let the human decide. Auto-fix hides the analysis and becomes a silent side effect |
