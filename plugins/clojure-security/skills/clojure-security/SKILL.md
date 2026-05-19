---
name: clojure-security
description: Use when reviewing Clojure or ClojureScript code for security issues, auditing for RCE via read-string / eval, unsafe Java deserialization, SQL injection through string concatenation, XXE in clojure.xml or data.xml, Hiccup / Selmer template injection, CLJS DOM XSS, atom check-then-act races, spec or Malli error-message data leaks, or interpreting clj-kondo / clj-holmes / gitleaks / nvd-clojure / Semgrep findings on a Clojure codebase.
---

# Clojure Security

## Overview

Clojure is safer than many ecosystems for memory-safety and state-mutation bugs, but inherits the JVM's attack surface and adds a handful of language-specific footguns. Most vulnerabilities below come from useful features fed untrusted input.

**This skill is the judgment layer.** The mechanical layer — `clj-kondo`, `clj-holmes`, `gitleaks`, `nvd-clojure`, Semgrep — reports raw findings. This skill interprets them: pattern, false-positive notes, severity floor, fix direction.

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

Per-class severity floors are listed inline below. Override down only with explicit reachability evidence.

## Vulnerability classes

### 1. `clojure.core/read-string` on untrusted input — RCE

`clojure.core/read-string` honors the `#=` reader-eval tag → arbitrary code execution.

```clojure
;; Vulnerable
(read-string user-input)

;; Safe default
(clojure.edn/read-string user-input)
```

**Sharp edges that defeat `clojure.edn`:**
- Custom `:readers` map running on attacker-controlled tag data
- `data_readers.clj` / `data_readers.cljc` at the project root is loaded automatically — audit it
- `clojure.edn/read` wrapping an attacker-controlled stream with a non-empty `:readers`

**Grep:**
```
\bread-string\b
\bedn/read\b
:readers\s*\{
data_readers\.cljc?
```

**False positives:** `read-string` on a string literal, or on a value sourced entirely from build-time config (`deps.edn`, `resources/*.edn`) is fine. Trace provenance, not the call site.

**Severity floor:** Critical if input is network-reachable; High if local-file-reachable; Medium if reachable only via authenticated admin tooling.

### 2. Dynamic code execution — `eval`, `load-string`, `load-file`, `requiring-resolve`

Any path that resolves a symbol or form from user input and invokes it is RCE.

```clojure
;; Vulnerable
(eval (read-string body))
((requiring-resolve (symbol ns-name fn-name)) arg)
(load-string code-string)

;; Safe — hard-coded allowlist
(def handlers
  {"greet"  #'my.app/greet
   "report" #'my.app/report})
(if-let [f (handlers action)] (f arg) (throw (ex-info "unknown action" {:action action})))
```

**Grep:**
```
\beval\b
\bload-string\b
\bload-file\b
\brequiring-resolve\b
\(resolve\s+\(symbol
```

**False positives:** `eval` inside macros operating on compile-time forms is normal. `requiring-resolve` with a static symbol literal is fine. The risk is exclusively `symbol` / `resolve` / `eval` consuming runtime user data.

**Fix direction:** allowlist (map from user-facing key to resolved var), never blocklist. Reject unknown keys with a 4xx.

**Severity floor:** Critical when input is network-reachable.

### 3. Java deserialization sinks

JVM deserialization gadget chains (Apache Commons Collections, etc.) → RCE.

Sinks to flag:
- `java.io.ObjectInputStream/readObject` on untrusted bytes
- `java.beans.XMLDecoder`
- SnakeYAML pre-2.0 default `Yaml()` constructor (use `SafeConstructor` or upgrade)
- `nippy/thaw` on untrusted bytes without `:incl-class-allowlist`
- Kryo without a registered class allowlist

**Grep:**
```
ObjectInputStream
XMLDecoder
new\s+Yaml\s*\(\s*\)
nippy/thaw
\bKryo\b
```

**False positives:** Deserializing bytes you wrote on the same JVM, never network-sourced, is materially safer. Still prefer a transit/EDN/JSON envelope; lower severity.

**Severity floor:** Critical for network input; High for filesystem input that other users can write to.

### 4. Transitive JVM CVEs (Log4Shell class)

Every CVE in a transitive Java dep is your CVE. `clojure.tools.logging` delegates to whatever backend is on the classpath — a transitive Log4j carries the Log4Shell risk regardless of call site.

**Detection:** `nvd-clojure` against `deps.edn` / `project.clj`, plus Dependabot alerts.

**Severity:** Take from the NVD CVSS; don't re-score.

### 5. XML and YAML parsing — XXE

`clojure.xml/parse` and `clojure.data.xml/parse` use JVM SAX defaults that historically permit external-entity resolution. Hardening must be explicit.

```clojure
(let [factory (doto (javax.xml.parsers.SAXParserFactory/newInstance)
                (.setFeature "http://apache.org/xml/features/disallow-doctype-decl" true)
                (.setFeature "http://xml.org/sax/features/external-general-entities" false)
                (.setFeature "http://xml.org/sax/features/external-parameter-entities" false)
                (.setXIncludeAware false))]
  ...)
```

**Grep:**
```
clojure\.xml/parse
data\.xml/parse
SAXParserFactory
DocumentBuilderFactory
```

**SnakeYAML:** Same risk on pre-2.0; default `Yaml()` deserializes arbitrary classes. Use `(Yaml. (SafeConstructor.))` or upgrade to 2.0+.

**Severity floor:** High for any internet-reachable parser; Medium for authenticated input; Low for build artifacts.

### 6. SQL injection via string concatenation

Parameterized forms in `clojure.java.jdbc` and `next.jdbc` are safe. Raw-string execution isn't.

```clojure
;; Vulnerable
(jdbc/execute! db (str "SELECT * FROM users WHERE name = '" name "'"))

;; Safe
(jdbc/execute! db ["SELECT * FROM users WHERE name = ?" name])
```

**The trap is dynamic SQL where parameters can't help:**
- `ORDER BY <col>` from a query string
- `<table>` from a query string
- Dynamic `WHERE` fragments

**Fix:** allowlist columns / tables / directions to a static set. HoneySQL / HugSQL handle this idiomatically.

**Grep:**
```
\(str\s+"[^"]*\b(SELECT|INSERT|UPDATE|DELETE)\b
ORDER BY\s+"\s*\)
jdbc/execute!\s+\S+\s+\(str
```

**False positives:** `str` building a constant query template, or composing fully-parameterized clauses via HoneySQL DSL.

**Severity floor:** Critical if reachable from unauthenticated request; High otherwise.

### 7. Hiccup / Selmer template injection and unsafe HTML

Hiccup auto-escapes string content. Risks:

- `hiccup.core/raw` or `hiccup.util/raw-string` on user-controlled strings
- Selmer templates loaded from user-controlled paths, or rendering user data through tags like `{% include %}` / `{% safe %}`
- `href` / `src` attributes with user-controlled values not URL-validated → `javascript:` schemes execute

**Grep:**
```
hiccup\.(core|util)/raw
\braw-string\b
selmer/render-file
\{%\s*(include|safe)
:href\s+[^]]*\(str
javascript:
```

**Fix direction:** sanitize HTML with OWASP Java HTML Sanitizer (or equivalent). For URL attributes, validate scheme against `#{"http" "https" "mailto"}` allowlist.

**Severity floor:** High for stored XSS (rendered to other users); Medium for reflected.

### 8. ClojureScript DOM XSS surfaces

CLJS can call into JS directly. Sinks:

- `js/eval`
- `(new js/Function ...)`
- `:dangerouslySetInnerHTML` in Reagent
- `dommy/set-html!`
- `(set! (.-innerHTML el) ...)`

**Grep:**
```
\bjs/eval\b
\bjs/Function\b
:dangerouslySetInnerHTML
set-html!
\.-innerHTML
```

**Fix:** DOMPurify before any innerHTML-equivalent. No `js/eval` of user input — ever.

**Severity floor:** High when the rendered string crosses a trust boundary.

### 9. Atom / ref check-then-act races in security state

```clojure
;; Vulnerable — TOCTOU between deref and swap!
(when (authorized? @session)
  (swap! resource update-fn))

;; Safe — single transition
(swap! resource
       (fn [r] (if (authorized? @session) (update-fn r) r)))
;; or dosync across multiple refs for transactional semantics
```

Search auth-relevant namespaces for `@session` / `@auth` / `@current-user` followed by a separate mutation, especially across function boundaries. Hard to grep precisely — flag during human review of auth code.

**Severity floor:** Medium — exploitable but typically narrow timing windows. Higher when the resource is a counter, capability, token, or rate-limit bucket.

### 10. Reflection in security-sensitive code

Not a vuln itself; an auditability and performance smell that occasionally surfaces unexpected method resolution under adversarial input.

**Action:** `(set! *warn-on-reflection* true)` at the top of any ns handling auth, authz, or input parsing. Add type hints to clear warnings. Tightens the auditable surface.

### 11. Spec / Malli error messages leaking data

`s/explain-data` and Malli's humanizers include the offending value. In a 4xx response body, that's a free dump of internal structures and likely PII.

**Fix:** Strip values, generalize messages, or use a middleware that maps validation failures to a flat `{"errors": ["field is required"]}` shape. Never return raw `explain-data` to clients.

**Grep:**
```
explain-data
m/explain
me/humanize
```

### 12. Macros consuming runtime user input

A macro that builds code from a string or symbol derived from runtime input is `eval` in disguise.

**Rule:** macros consume compile-time-known data only. Runtime input goes through functions, never macros.

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
| **clj-holmes** | known-bad Clojure idioms (`read-string`, `eval`, deserialize sinks) | dataflow; small rule set |
| **nvd-clojure** | transitive deps vs. NVD | source-level bugs, runtime config |
| **gitleaks** | secrets matching regex / entropy heuristics | custom-encoded secrets; keys referenced by path |
| **Semgrep** | pattern-based source matches (Clojure via experimental tree-sitter) | deep dataflow; semantic equivalence |
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

- CSP and security headers — application-config concern; flag absence in an audit but don't pattern-match here
- TLS / crypto primitive selection — JVM-level, not Clojure-idiom
- Auth protocol design (OAuth / SAML / OIDC) — separate skill; link from there when written

## Common mistakes when applying this skill

| Mistake | Reality |
|---------|---------|
| Reporting every `eval` hit as Critical | Most `eval` is inside macros on compile-time forms — trace provenance first |
| Treating `clojure.edn/read-string` as fully safe | Custom `:readers` and `data_readers.cljc` still execute code |
| Assuming `next.jdbc` is injection-proof | Parameterized statements are; dynamic identifiers (`ORDER BY`, table names) are not |
| Calling every Hiccup template injection High | Severity depends on whether output crosses to another user (stored XSS) or only back to the originator (reflected) |
| Auto-fixing findings | Don't. Surface the finding with reasoning; let the human decide. Auto-fix hides the analysis and becomes a silent side effect |
