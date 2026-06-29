---
name: writing-clojure-code
description: Use when writing or refactoring any Clojure code — CLJ, CLJC, or CLJS (handlers, domain logic, helpers, defmethods, event handlers). Covers formatting for cond/case (same-line aligned clauses, no blank-line gutters, extract multi-line results), cond->, as->, function-call continuation args, let-binding alignment, and idiomatic patterns for API handlers (short-circuit with or, extract guard helpers, extract reusable predicates). Also applies to Clojure you write into implementation plans, design specs, scaffolding examples, or code-review prompts/comments — plan/spec code blocks get transcribed into the codebase verbatim, so they must already follow these rules (e.g. API handlers use an or-chain of maybe-* guards, never a multi-branch guard cond; cond/case clauses are same-line with no blank-gutter). For Reagent-component-specific conventions use writing-reagent-components instead.
---

# Writing Clojure Code

## Applies to plans, specs, and reviews

These rules are not only for editing `.clj`/`.cljc`/`.cljs` files. They are explicit trigger moments:

- **Writing a plan or spec** — any Clojure you put in an implementation plan, design spec, or scaffolding example must *already* satisfy every rule in this skill. Plan/spec code blocks get copied into the codebase verbatim (often by a subagent who transcribes without re-judging style), so a non-idiomatic block in the plan becomes non-idiomatic production code. Don't defer cleanup to "when it's a real file."
- **Reviewing a Clojure diff** — check the diff against these rules and flag violations as findings, not nits. In particular: multi-branch guard `cond` in an API handler instead of an or-chain of `maybe-*-response` helpers; `cond`/`case` clauses split across lines or with blank-line gutters; misaligned `let` / `cond->` / `as->`; a wire `:ok` handler whose `db/tx`/`db/tx*` (or seq vs single access) disagrees with the `ajax/ok` payload shape it consumes; and `apply`-spreading an already-parsed opts map back through a varargs fn. These are findings the review must raise.

## Formatting

### `cond->` / `cond->>` / `as->` — one clause per line, predicate and result together

Each clause goes on its own line with the predicate (test) and its result on the **same line** — the same rule as `cond`. For `as->`, each threading step is its own line. Use the standard 2-space body indent; this is what cljfmt enforces, so don't hand-align clauses under the initial expression — the formatter hook reindents them on the next edit.

```clojure
;; Good — predicate and result on one line, 2-space body indent
(cond-> record
  true (assoc :id (datomic/tempid) :created-at (:now ctx))
  true (dissoc :draft-refs)
  (external-source? record) (assoc :sync-status :pending))

(as-> (get-record request) rec
  (assoc rec :user (:id user))
  (apply update-fn rec args)
  (model/compile rec user))

;; Bad — predicate and result split across two lines (loses scannability)
(cond-> record
  true
  (assoc :id (datomic/tempid))
  (external-source? record)
  (assoc :sync-status :pending))
```

Keeping each predicate beside its result lets you scan tests on the left and transformations on the right. cljfmt does **not** join a split clause back together — write it on one line yourself. When a result is long or multi-line, extract it into a named helper (see the `cond` guidance below) rather than letting it wrap.

### Function-call continuation args align with the first arg

When a call's args wrap to new lines, align the continuation args under the first argument (not to a 2-space body indent).

```clojure
;; Good — continuation aligned with first arg
(redirect-with-update request "/dashboard" "The change has been saved."
                      workflowc/apply-update update user)

(update-response request "Item added to your list."
                 listc/add-item item)

;; Bad — 2-space body indent doesn't match where args actually start
(redirect-with-update request "/dashboard" "The change has been saved."
  workflowc/apply-update update user)
```

### Fully-wrapped call args use 1-space indent

When no args fit on the function-name line, indent args 1 space past the opening paren (not 2).

```clojure
;; Good — 1-space indent under opening paren
(audit/log-failure!
 {:ip      (request/extract-ip request)
  :user-id (:id user)
  :action  (:action op)
  :error   (:error op)
  :context (:context op)})

(reduce
 (fn [acc item]
   (if (already-processed? acc item)
     acc
     (workflowc/process-item acc item)))
 acc
 items)

;; Bad — 2-space body indent
(audit/log-failure!
  {:ip      (request/extract-ip request)
   :user-id (:id user)})
```

### `let` bindings: column-align values to the longest name

When `let` has multiple bindings, align all values in a single column past the longest binding name. This does NOT apply to data maps — see the existing "Don't column-align values in data maps" rule.

```clojure
;; Good
(let [owned-items         (db/find-by :entitlement :owner (:id user) :tier :standard)
      pending-items       (filter (comp #{:standard} :tier) inputs)
      matching-products   (corec/map-set :product (concat pending-items owned-items))
      new-products        (map :product (remove (comp matching-products :product) candidates))
      updated-workflow    (delay (-> (add-items-to-workflow acc new-products user)
                                     (model/compile user)))]
  ...)

;; Bad — mixed, harder to scan
(let [owned-items (db/find-by :entitlement :owner (:id user) :tier :standard)
      pending-items (filter (comp #{:standard} :tier) inputs)
      matching-products (corec/map-set :product ...)]
  ...)
```

### Long `cond` branches → extract helpers so each clause is one prose line

**Two hard rules for every `cond` (and `case`, `condp`):**
1. **Each test and its result go on the SAME line**, with results column-aligned. A result that sits on its own line below its predicate is wrong — fix it, don't ship it.
2. **NEVER put blank lines between clauses.** A blank-line gutter is the tell that a result grew too big to fit on its line. The fix is never the blank line — it's extracting the result.

When a clause's result is a multi-line `let`/`if`/`do`, the cond loses its scannability — the predicates drift apart and the reader has to parse each block to find the next condition. The blank lines you feel tempted to add are a symptom: you're forcing visual separation because the clauses themselves became opaque.

Fix: pull each multi-line result into a named helper (`defn`/`defn-`) that returns the value (or tuple) the cond branch needs — even a single-use helper is worth it. The cond then collapses to a list of `predicate → action-name` pairs that reads top-to-bottom like prose — including a `cond` inside a `defmethod` or event handler.

```clojure
;; Good — each branch is one line, names describe intent, no blank-line gutters
(defn- step-line [out stack line features db-choice]
  (cond
    (line-eq? line stack)    (apply-line-eq      out stack line features)
    (db-line-eq? line stack) (apply-db-line-eq   out stack line db-choice)
    (open-marker line)       (push-open          out stack line)
    (close-marker line)      (pop-close          out stack line)
    (seq stack)              (emit-inside-block  out stack line features db-choice)
    :else                    [(conj out line) stack]))

;; Bad — multi-line let bodies, blank lines between clauses, comment to label a branch
(cond
  (and (empty? stack) (re-find LINE-EQ-RE line))
  (let [r (handle-line-eq line features)]
    (recur rest (if (= r ::drop) out (conj out r)) stack))

  (and (empty? stack) (re-find DB-LINE-EQ-RE line))
  (let [r (handle-db-line-eq line db-choice)]
    (recur rest (if (= r ::drop) out (conj out r)) stack))

  ;; Inside an open block: include line iff block resolves "on"
  (seq stack)
  (let [{:keys [kind id inverse?]} (first stack)
        on? (case kind ...)]
    (recur rest (if on? (conj out line) out) stack)))
```

If branches must return multiple values (e.g. updated `out` AND `stack`), return a tuple from the helper and destructure once after the cond — keeps the recur call uniform and the branch lines tidy.

### Long functions with stage/step comments → extract helpers; names replace comments

Comments like `;; stage-1: fetch`, `;; render`, `;; cleanup` are a code smell: they're labelling sections of one giant function. The fix is not "better comments" — it's to make each section its own named helper. The helper name takes the comment's job, the top-level function reads as a sequence of intent-revealing calls, and the comments disappear with no loss of information.

```clojure
;; Good — top-level reads as ordered intent; helpers carry the detail
(defn- scaffold! [{:keys [name template yes] :as opts}]
  (let [stage (cfs/stage-dir)
        tdir  (fs/path stage template)]
    (try
      (fetch-template! opts template stage tdir)
      (let [manifest (manifest/read-manifest (str tdir))
            nm       (rn/validate-name (or name "my-app") (:tokens manifest))
            target   (target-path opts nm)]
        (die-if-target-exists! target stage)
        (let [features (effective-features manifest (:feature opts))
              db       (effective-db manifest (:db opts))
              scaffold (render-into-stage! tdir stage manifest nm features db)]
          (when-not yes (ui/info "Using defaults …"))
          (finalize! scaffold target opts)
          (ui/ok (str "Created " nm))))
      (catch Exception e (handle-scaffold-failure! e opts))
      (finally (cfs/cleanup! stage)))))

;; Bad — section comments, repeated cleanup, exit-code cond inline,
;; multiple unrelated concerns in one body
(defn- scaffold! [...]
  (let [...]
    (try
      ;; stage-1: fetch
      (ui/step "fetching template …")
      (if local ...)

      ;; manifest
      (let [...]
        (when (fs/exists? target)
          (ui/fail ...) (cfs/cleanup! stage) (exit 3))

        ;; effective features + db (CLI override > manifest default)
        (let [...]
          ;; stage-2: render
          (ui/step "rendering tokens …")
          ;; copy tdir → scaffold and render in place
          ...

          ;; stage-4: move
          (ui/step "moving into place …")
          ...

          ;; stage-5: post-scaffold
          (when (:git? opts) ...)))
      (catch Exception e
        (cfs/cleanup! stage)
        (let [data (ex-data e)]
          (ui/fail (.getMessage e))
          (cond
            (:manifest? data)     (exit 6)
            (:collision? data)    (exit 3)
            (:fetch? data)        (exit 7)
            :else                 (do (when (:debug opts) (.printStackTrace e))
                                      (exit 1)))))
      (finally (cfs/cleanup! stage)))))
```

Heuristics:
- A function long enough to need internal section labels is long enough to split.
- An inline `cond` mapping error keys to exit codes belongs in a small data-driven helper (a map + `some`).
- Redundant cleanup in both `catch` and `finally` is a hint that the catch is doing too much — let `finally` own teardown.

## API Handler Style

### Short-circuit with `or` — never a multi-branch `cond`

API handlers that need to run a series of guards should chain `maybe-*-response` helpers with `or`. Each helper returns `nil` when the guard passes and an `ajax/fail` response when it fails. The final form in the `or` is the happy path.

```clojure
;; Good — linear or-chain, each guard is its own function
(defn api-redeem-token [request]
  (let [amount (web/maybe-amount (:amount (:params request)))]
    (or (maybe-nil-or-negative amount)
        (maybe-under-minimum amount)
        (update-response request "Token redeemed."
                         tokenc/redeem amount))))

;; Bad — monolithic cond, guards tangled with response logic
(defn api-redeem-token [request]
  (let [amount (web/maybe-amount (:amount (:params request)))]
    (cond
      (or (nil? amount) (< amount 0))
      (ajax/fail :invalid "Invalid amount")

      (< amount tokenc/min-redeem-amount)
      (ajax/fail :invalid "Amount is below the minimum.")

      :else
      (update-response request "Token redeemed."
                       tokenc/redeem amount))))
```

### Each guard is its own `maybe-*-response` helper with one concern

Every guard function tests one condition and returns `nil` when satisfied, `ajax/fail` when not. Use `when` or `when-not` — never `cond` inside a guard helper.

```clojure
;; Good — one concern per helper
(defn- maybe-token-disabled-response [token]
  (when-not (and (:enabled? token) (:activated? token))
    (ajax/fail :invalid "This token is no longer valid.")))

(defn- maybe-token-pending-response [token]
  (when (= :token.status/pending (:status token))
    (ajax/fail :invalid "This token is still pending activation and can't be used yet. Please try again shortly.")))

(defn- maybe-token-depleted-response [token]
  (when-not (pos? (:balance token))
    (ajax/fail :invalid "This token has been depleted.")))

(defn- maybe-apply-token [request code]
  (when-let [token (when code (db/ffind-by :token :code code))]
    (or (maybe-token-pending-response token)
        (maybe-token-disabled-response token)
        (maybe-token-depleted-response token)
        (update-response request "Token applied."
                         tokenc/apply-token token))))

;; Bad — one helper with multi-branch cond
(defn- maybe-token-disabled-response [token]
  (cond
    (= :token.status/pending (:status token))
    (ajax/fail :invalid "...pending...")

    (not (and (:enabled? token) (:activated? token)))
    (ajax/fail :invalid "...no longer valid.")))
```

Benefits of small helpers:
- Each condition gets a descriptive name (the function name).
- Reorderable — change the `or` sequence without touching logic.
- Testable in isolation.
- New guards compose cleanly: add a helper, add a line to the `or`.

### Extract reusable predicates into public fns

When a predicate expression (especially a set-membership check) is used in more than one place, or could be, extract it to a named `defn` and call it from the guards and `cond->` clauses. Prefer public (`defn`) over private (`defn-`) when the concept is reusable across namespaces.

```clojure
;; Good — named predicate, callable from cond-> clauses and other namespaces
(defn external-source? [record]
  (contains? #{:source/gateway-a :source/gateway-b :source/gateway-c}
             (:source record)))

(defn- prep-record [record ctx]
  (cond-> record
    true (assoc :id (datomic/tempid) :created-at (:now ctx))
    true (dissoc :draft-refs)
    (external-source? record) (assoc :sync-status :sync-status/pending)))

;; Bad — set literal inline in cond-> clause, opaque at the call site
(defn- prep-record [record ctx]
  (cond-> record
    true (assoc :id (datomic/tempid) :created-at (:now ctx))
    true (dissoc :draft-refs)
    (#{:source/gateway-a :source/gateway-b :source/gateway-c} (:source record))
    (assoc :sync-status :sync-status/pending)))
```

Making the predicate public is the default — if it describes a meaningful concept in the domain (e.g., "which sources route through the external gateway?"), other namespaces will likely want it too. Only keep it private when the predicate is genuinely local (e.g., a one-off tuple check).

## Wire ajax handler/response contract

A wire `:ok` handler that **throws** never shows its real error. `c3kit.wire.api/handle-payload` wraps every handler in a `try`/`catch` and, on any exception, logs it and flashes `"Oh no!  I choked on some data.  Doh!"`. So that flash does not mean the server sent bad data — it means **a client `:ok` handler threw**, and the actual error is hidden behind the generic message. When you see it, suspect the handler, not the payload. Two recurring causes:

### Payload shape must match `db/tx` / `db/tx*` (and seq vs single access)

The backend's `ajax/ok` shape and the frontend handler must agree on whether the payload is **one entity** or a **collection**. Crossing them throws inside the handler → choked.

```clojure
;; Good — single entity both sides
;; backend
(ajax/ok user)
;; frontend handler
(fn [user] (db/tx user) (reset! current (:id user)))

;; Good — collection both sides
;; backend
(ajax/ok [user])
;; frontend handler
(fn [users] (db/tx* users) (reset! ids (map :id users)))

;; Bad — backend sends one entity, frontend treats it as a collection
;; backend
(ajax/ok user)
;; frontend handler — db/tx* / map / into expect a seq of entities, throw on a single map
(fn [payload] (db/tx* payload))
```

`db/tx` transacts one entity; `db/tx*` transacts a collection. Using `db/tx*` on a single entity map, or `db/tx` / `map` / `into` on a single map you assumed was a vector (or vice versa), throws. When you change the shape on one side, change the other.

### Don't `apply`-spread an already-parsed opts map

A varargs wrapper that has already run `ccc/->options` holds a **map**. Re-issuing the call with `(apply f url params handler opts)` spreads that map's MapEntries back into the varargs, and `->options` re-parses them with `(apply hash-map …)` — which throws on an odd count (e.g. a lone `:on-fail`). Inside a handler (such as an MFA-retry thunk) that throw surfaces as the choked flash.

```clojure
;; Good — pass the parsed map as a single leading-map arg; ->options merges it back
(let [opts  (ccc/->options opts)
      retry (fn [] (f url params handler opts))]
  ...)

;; Bad — re-spreads the parsed map through varargs, throws on re-parse
(let [opts  (ccc/->options opts)
      retry (fn [] (apply f url params handler opts))]
  ...)
```
