---
name: writing-tests
description: Use when writing or modifying Speclj tests for Clojure or ClojureScript. Covers test file structure (describe/context/it), test data setup, wire helpers for CLJS, selectors, element IDs, and recovering from a stuck test autorunner.
---

# Writing Clojure / ClojureScript Tests

## Test File Structure

**One `describe` per file, named after the namespace under test.** Group related tests with nested `(context ...)` forms — never a second top-level `describe`.

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

## Running Tests

Backend Clojure tests: `clj -M:test:spec` (one-time) or `clj -M:test:spec -a` (autorunner).

Frontend ClojureScript tests: `clj -M:test:cljs once` (one-time) or `clj -M:test:cljs` (autorunner).

It is **MUCH FASTER** to use the autorunners in the background during TDD — especially for ClojureScript, since a fresh run recompiles the entire project instead of just changed files.

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
