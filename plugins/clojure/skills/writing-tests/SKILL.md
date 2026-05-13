---
name: writing-tests
description: Use when writing or modifying Speclj tests for Clojure or ClojureScript. Covers test file structure (describe/context/it), test data setup, wire helpers for CLJS, selectors, element IDs, and recovering from a stuck test autorunner.
---

# Writing Clojure / ClojureScript Tests

## Test File Structure

**One `describe` per file, named after the namespace under test.** Group related tests with nested `(context ...)` forms — never a second top-level `describe`. Each `context` is named after the var or behavior it covers (e.g. `(context "prompt-text" ...)`), not the namespace.

Before finishing, **verify** the file has exactly one top-level `describe`:

```bash
grep -c "^(describe " path/to/spec.clj   # must print 1
```

If the count is greater than 1, fold the extras into `(context ...)` blocks under the single top-level describe.

```clojure
;; Good
(describe "Story"
  (context "ws-add-story"
    (it "creates a story" ...))
  (context "ws-update-story"
    (it "updates the title" ...)
    (it "preserves archive refs" ...)))

;; Bad — multiple top-level describe blocks
(describe "ws-add-story"
  (it "creates a story" ...))
(describe "ws-update-story"
  (it "updates the title" ...))
```

`context` works exactly like `describe` but nests inside it. Shared setup (`with-stubs`, `lotr/with-kinds`, `before`, etc.) goes at the top of the single `describe`; context-specific setup goes inside that context.

**Use `context` only when grouping 3+ related `it` blocks.** A `context` that wraps a single `it` (or just two) is noise — promote those tests up to the `describe` level and embed the var/behavior name in the `it` string instead:

```clojure
;; Good — single test promoted, var name in the it string
(describe "c3kit-create.version"
  (it "current returns the current CLI semver as a string"
    (should= "0.1.0-SNAPSHOT" (v/current)))
  (it "semver-compare compares standard releases"
    (should= -1 (v/semver-compare "0.1.0" "0.2.0"))))

;; Bad — context wrapping a single it adds nesting for no grouping benefit
(describe "c3kit-create.version"
  (context "current"
    (it "returns the current CLI semver as a string"
      (should= "0.1.0-SNAPSHOT" (v/current))))
  (context "semver-compare"
    (it "compares standard releases"
      (should= -1 (v/semver-compare "0.1.0" "0.2.0")))))
```

If a file is small enough that every group has 1–2 tests, the file ends up with no contexts — that is fine. Reach for `context` when the grouping earns its keep (shared `before`, shared `let`, or 3+ related cases worth visually clustering).

## Running Tests

Backend Clojure tests: `clj -M:test:spec` (one-time) or `clj -M:test:spec -a` (autorunner).

Frontend ClojureScript tests: `clj -M:test:cljs once` (one-time) or `clj -M:test:cljs` (autorunner).

It is **MUCH FASTER** to use the autorunners in the background during TDD — especially for ClojureScript, since a fresh run recompiles the entire project instead of just changed files.

## Test Output Must Be Clean

**Speclj output should be nothing but green/red dots** (or green/red test names in verbose/autorunner mode). Any stray `println`, log line, stack-trace, warning, or printed banner from production code leaking into test output is a defect — fix it before the test counts as passing.

When a test exercises code that legitimately writes to stdout/stderr/logs, **capture** the output rather than letting it leak:

```clojure
(:require [c3kit.apron.log :as log]
          [speclj.core :refer [describe context it should=]])

;; Silence c3kit.apron.log output for an entire describe/context block.
;; This is the most common way to keep log lines out of test output —
;; reach for it before binding *err* or redefining println.
(describe "my-ns"
  (log/capture-logs)
  ...)

;; Inspect captured log lines inside an `it` (after capture-logs is active):
(it "logs a warning when foo is missing"
  (my.code/do-thing! {})
  (should= ["foo missing"] (log/captured-logs)))   ; or log/captured-logs-str

;; Wrap calls that print to stdout
(with-out-str (my.code/does-printing arg))

;; Capture stderr (Clojure) — rarely needed if the code uses c3kit.apron.log
(binding [*err* (java.io.StringWriter.)]
  (my.code/warns-on-err))

;; ClojureScript: capture-logs works the same way in CLJS specs.
;; For raw js/console output, with-out-str from cljs.core or redef
;; js/console.log in a before/after.
```

**Default to `(log/capture-logs)` for any spec whose code under test calls `log/info`, `log/warn`, `log/error`, `log/debug`, etc.** It is the standard, project-wide mute — preferable to bashing `*err*` or redefining the logger.

After every test run, **scan the output**. If you see anything other than dots (or named tests in verbose mode) and the final summary, treat it as a failure even if the assertion count is green:

- `WARNING:` / `Reflection warning` → fix the warning or `^:dynamic`/type-hint
- printed exceptions or stack traces → either the test should assert the throw (`should-throw`) or the production code should not be printing
- raw `println` debug output → remove it or capture it
- log lines → mute the logger in test setup, or capture

Do not declare a test green when the terminal is full of noise.

## Test Setup

**Always declare shared-test-data entity kinds** (e.g., `(bb/with-kinds :user)` or `(lotr/with-kinds :user)`) in the describe block when using them, to avoid entity warnings:

```clojure
(describe "My Feature Spec"
  (with-stubs)
  (bb/with-kinds :user)  ; <- required for test data entities
  (wire/stub-ws)
  (wire/with-root-dom)
  (helper/stub-jsc-fetch!)
  (helper/stub-goto)

  (before (page/clear!)
          (user/clear!)
          (user/install! @brian-user))
  ...)
```

**Warning to watch for:** `Using nil entity. Maybe add (with-kinds :user)` — add the appropriate `(bb/with-kinds ...)` or `(lotr/with-kinds ...)` to the describe block.

## ClojureScript Wire Helpers

```clojure
;; Check element content
(should= "expected text" (wire/text "#element-id"))

;; Check element exists
(should-select "#element-id")

;; Check element doesn't exist
(should-not-select "#element-id")

;; Click
(wire/click! "#button-id")

;; Flush pending renders
(wire/flush)
```

## Test Selectors and Element IDs / Classes

Prefer asserting on **meaningful attributes** (like `href`) rather than just existence:

```clojure
;; Bad — only checks existence, duplicates the href in the selector
(should= "/products" (.getAttribute (wire/select ".feature-card a[href='/products']") "href"))

;; Bad — equivalent to the above but less informative
(should-select ".feature-card a[href='/products']")

;; Good — test-specific id selects, assertion checks the meaningful attribute.
;; Note: wire/href returns the full URL (e.g., "file:///products" in tests),
;; so always use should-contain, not should=.
(should-contain "/products" (wire/href "#-product-card.feature-card a"))
```

**Adding IDs/classes for test selection:** It's fine to add them *solely* for test selection, but they **must be prefixed with a hyphen** to signal they are test/dev hooks, not styling hooks:

```clojure
;; Good — hyphen prefix signals test/dev purpose
[:div#-product-card.feature-card ...]
[:div.-news-section ...]

;; Bad — no hyphen, looks like a styling class
[:div#product-card.feature-card ...]
[:div.news-section ...]
```

## Clojure Backend Patterns

Short-circuit API endpoints with `or`:

```clojure
(or (maybe-validation-errors conformed)
    (ajax/ok! (db/tx conformed)))
```

## Recovering from a Stuck Autorunner

If the ClojureScript test autorunner hangs with stale JavaScript or compilation errors, do a full clean:

```bash
# Kill the test autorunner first.
# DO NOT use broad "clj.*test" — it will also kill the dev server.
pkill -f "test:cljs"

# Clean all build artifacts
rm -rf target
rm -rf tmp
rm -rf resources/public/cljs
rm -rf .cpcache
rm -f .lein-repl-history
rm -f .specljs-timestamp

# Restart
clj -M:test:cljs
```

**When a full clean is warranted:**
- Persistent compilation errors after file changes
- "Unexpected token" JavaScript errors in browser or tests
- Stale compiled code that doesn't reflect source changes
- After major refactoring or namespace reorganization
