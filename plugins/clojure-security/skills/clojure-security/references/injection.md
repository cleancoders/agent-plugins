# Injection classes

Loaded on demand by the `clojure-security` skill. See the class index in `SKILL.md`.

### read-string-rce

`clojure.core/read-string` on untrusted input — RCE.

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

### dynamic-eval

Dynamic code execution — `eval`, `load-string`, `load-file`, `requiring-resolve`.

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

### sql-injection

SQL injection via string concatenation.

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

### hiccup-injection

Hiccup / Selmer template injection and unsafe HTML.

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

### cljs-dom-xss

ClojureScript DOM XSS surfaces.

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

Note this class carries **CWE-79 and CWE-94**: `.-innerHTML` and
`:dangerouslySetInnerHTML` are XSS, while `js/eval` and `(js/Function. ...)` are
code injection. Same sink family, two taxonomy entries.

**Detected in CI by:** `cc-cljs-innerhtml`, `cc-cljs-eval`,
`cc-dangerously-set-html` (semgrep).

### command-injection

**CWE-78, CWE-77 · OWASP A05**

`clojure.java.shell/sh` invoked through a shell interpreter runs its argument as a
command line, so any interpolated value is command injection. The tell is a `-c`
flag: that is what makes `bash`/`sh`/`zsh` parse the next argument as syntax rather
than treat it as a filename.

```clojure
;; Vulnerable — the shell parses the whole string
(sh "bash" "-c" (str "convert " path " out.png"))

;; Safe — fixed argv, the OS never parses user data as syntax
(sh "convert" path "out.png")
```

**Grep:**
```
clojure\.java\.shell
"-c"
ProcessBuilder
Runtime/getRuntime
```

**False positives:** a `-c` invocation whose command string is built entirely from
constants. Still prefer fixed argv — a later edit that interpolates one variable
turns it into a finding without changing the call shape.

**Fix direction:** pass a fixed argv vector. Where a shell is genuinely required
(pipelines, redirection), allowlist the variable portion against a static set
rather than escaping it; escaping is defeated by argument-boundary tricks.

**Severity floor:** Critical when the interpolated value is network-reachable;
High otherwise.

**Detected in CI by:** `cc-shell-exec` (semgrep).

### macro-runtime-input

Macros consuming runtime user input.

A macro that builds code from a string or symbol derived from runtime input is `eval` in disguise.

**Rule:** macros consume compile-time-known data only. Runtime input goes through functions, never macros.

### xxe

XML and YAML parsing — XXE.

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
