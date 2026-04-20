---
name: using-c3kit-bucket
description: Use when querying or transacting entities via c3kit bucket (db/entity, db/find-by, db/tx). Covers pushing filters into queries, avoiding React key warnings on entity lookups, keeping logic in CLJC, and making reusable predicates public.
---

# Using c3kit bucket

## Avoid React Key Warnings on Entity Lookups

When looking up multiple entities by a list of IDs (e.g., from a `:attachments` or `:members` field), use `db/find-by` instead of mapping `db/entity` over the list. Mapping `db/entity` over a list containing `nil` produces `nil` elements, which cause React "unique :key" warnings when rendered in a seq.

```clojure
;; Bad — nil IDs produce nil elements, causing React key warnings
(map (partial db/entity :attachment) (:attachments @current))

;; Good — db/find-by naturally skips nil/missing IDs
(db/find-by :attachment :id (:attachments @current))
```

## Push filters into DB queries

When fetching entities and immediately filtering by a field, include the field in the `db/find-by` query instead of filtering in Clojure:

```clojure
;; Good — filter at query level
(db/find-by :license :owner (:id user) :level :license.level/personal :enabled? true)

;; Bad — fetch all then filter in memory
(->> (db/find-by :license :owner (:id user) :enabled? true)
     (filter #(= :license.level/personal (:level %))))
```

## Keep logic in CLJC, not CLJS

When CLJS components need computed data (ownership counts, pricing, etc.), put the computation in a CLJC namespace and call it from CLJS. Don't reimplement the same queries/logic in CLJS.

If a utility already exists in a CLJC namespace (e.g., `licensec/owned-by`), use it — don't rewrite it.

## Make reusable predicates public

If a private predicate (e.g., `defn- video-item?`) is needed across multiple namespaces, make it `defn` (public) in the namespace that owns the concept, and reuse it.
