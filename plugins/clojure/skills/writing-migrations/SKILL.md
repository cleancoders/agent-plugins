---
name: writing-migrations
description: Use when creating database migrations in Clojure projects using c3kit bucket/migrator. Covers naming, attribute ordering, Datomic type constraints, scoped DB for entity queries, and common patterns.
---

# Writing Clojure Migrations (c3kit bucket/migrator)

## How Migrations Work

Migrations live in the namespace specified by `:migration-ns` in the bucket config (e.g., `poker.migrations`). The migration runner:

1. Scans the migration namespace directory for files matching `[0-9]{8}.*\.clj`
2. Sorts filenames by string comparison
3. Runs `up` functions for new migrations, `down` functions when rolling back
4. Records each applied migration by name in a `:migration` entity in the database

Each migration file must define `up` and `down` functions (no args).

## CRITICAL: Migration tests go in a sibling directory, not under `:migration-ns`

Two constraints collide:

1. The migrator scans **every** namespace under `:migration-ns` (e.g., `<project>.migrations.*`) and calls `up` on each. A spec file at `spec/clj/<project>/migrations/20260417_foo_spec.clj` puts its namespace under `<project>.migrations.*` — the migrator would try to call `up` on it and crash startup (or worse, execute test side effects on a real DB).
2. The migration source lives under `src/clj/`, which **is on the production classpath**. If the migration file requires test-only namespaces (`<project>.beatles`, `speclj.core`, etc. — living under `spec/` paths only available under the `:test` alias), production startup fails at namespace load with `FileNotFoundException`. Inlining the `describe` block in the migration file triggers exactly this.

**Put migration tests in a separate spec file, in a sibling directory whose namespace prefix is NOT `:migration-ns`.** Suggested: `spec/clj/<project>/migration_specs/` with namespace `<project>.migration-specs.*`. Tag the tests `:migration` and run via `clj -M:test:migration`.

```clojure
;; src/clj/<project>/migrations/20260417_foo.clj  (production classpath)
(ns <project>.migrations.20260417-foo
  (:require [c3kit.bucket.api :as db]
            [c3kit.bucket.migrator :as m]))

(defn backfill! [] ...)

(defn up []
  (m/add-attribute! :foo :bar {:type :boolean})
  (backfill!))

(defn down []
  (m/remove-attribute! :foo :bar))
```

```clojure
;; spec/clj/<project>/migration_specs/20260417_foo_spec.clj  (test classpath only)
(ns <project>.migration-specs.20260417-foo-spec
  (:require [c3kit.bucket.api :as db]
            [<project>.beatles :as beatles]
            [<project>.migrations.20260417-foo :as sut]
            [speclj.core :refer [describe context it should= tags]]))

(describe "20260417 Foo Migration"
  (tags :migration)
  (beatles/with-schemas)

  (context "backfill!"
    (it "flips existing X to Y"
      (let [x (db/tx {:kind :x})]
        (sut/backfill!)
        (should= :y (:state (db/entity (:id x))))))))
```

Key points:
- **Directory name must not match `:migration-ns`** — check `resources/config/bucket.edn`. For `:migration-ns <project>.migrations`, any spec folder named `migrations` (making its ns `<project>.migrations.*`) will be picked up by the migrator. `migration_specs` / `<project>.migration-specs.*` sidesteps this.
- **Migration source stays lean** — only `c3kit.bucket.*` requires. No `speclj`, no test helpers, no schema-building test namespaces. Anything in `src/clj/` must load cleanly in production.
- **`(tags :migration)`** — the default speclj runner (`:spec` alias with `-t=~migration`) excludes these; run them via `clj -M:test:migration`.
- **`sut/` alias** — the spec lives in a different namespace, so refer to the migration via `[<project>.migrations.20260417-foo :as sut]` and call `sut/backfill!`, `sut/up`, etc.

## Naming Convention

**Format:** `YYYYMMDD_description.clj` with underscores in the filename (hyphens in the namespace).

```
src/clj/<project>/migrations/20260409_add_user_role.clj
;; namespace: <project>.migrations.20260409-add-user-role
```

**Multiple migrations on the same date:** Append a lowercase letter suffix for sort ordering:

```
20260409a_admin_flag.clj      ;; runs first
20260409b_token_to_string.clj ;; runs second
```

The migration runner sorts by string comparison, so `a` < `b` < `c` ensures correct ordering. Without the suffix, two migrations with the same date have undefined ordering.

## Critical Rules

### 1. Add attributes BEFORE using them

Datomic (and c3kit's bucket abstraction) requires attributes to exist in the schema before they can be used in transactions. Always call `m/add-attribute!` or `m/install-schema!` **before** any `db/tx` or `db/tx*` that references the new attribute.

```clojure
;; CORRECT
(defn up []
  (m/add-attribute! :user :admin? {:type :boolean})  ;; schema first
  (db/tx* (map #(assoc % :admin? true) (db/find :user))))  ;; then data

;; WRONG - will crash in Datomic
(defn up []
  (db/tx* (map #(assoc % :admin? true) (db/find :user)))  ;; attribute doesn't exist yet!
  (m/add-attribute! :user :admin? {:type :boolean}))
```

### 2. Remove attributes AFTER clearing data

In `down`, clear the attribute values first, then remove the attribute:

```clojure
(defn down []
  (db/tx* (map #(dissoc % :admin?) (db/find :user)))  ;; clear data first
  (m/remove-attribute! :user :admin?))  ;; then remove schema
```

### 3. Datomic attribute types are IMMUTABLE

You **cannot** change an existing attribute's type (e.g., `:long` to `:string`). Datomic will reject the transaction. To change a type:

1. Create a **new** attribute with the desired type
2. Migrate data from old attribute to new
3. Clear old attribute values
4. Remove old attribute from managed schema (remove it from the schema map in `schema/<kind>.cljc`)

```clojure
(defn up []
  ;; Don't: (m/add-attribute! :client-app :token {:type :string}) -- can't change :long to :string
  ;; Do: create a new attribute
  (m/add-attribute! :client-app :token-str {:type :string})
  (let [apps (db/find :client-app)]
    (db/tx* (map #(assoc % :token-str (str (:token %))) apps))))
```

### 4. Schema file must match migration

After a migration adds/removes attributes, the schema definition file (`src/cljc/<project>/schema/<kind>.cljc`) must be updated to match. The schema sync process compares the schema file against the database on startup and warns about mismatches.

- **Adding an attribute:** Add it to the schema map in the `.cljc` file
- **Removing an attribute:** Remove it from the schema map
- **Renaming an attribute:** Remove old, add new in both migration and schema file

### 5. Use a migration-scoped DB for entity queries

**CRITICAL:** `db/find :kind` (and other global `db/` functions) build queries from the current legend schema, which includes ALL attributes — even ones added by future migrations that haven't run yet. If the database is behind on migrations, these queries will fail with `:db.error/not-an-entity` because Datomic can't resolve attributes that haven't been installed yet.

**The fix:** Define schema snapshots in each migration that only include the attributes that exist at that point in time. Create a migration-scoped DB impl and use `db/find-`, `db/tx-`, and other `-` suffixed variants that operate on the scoped DB instead of the global one.

**Migration helper setup** (create once per project at `src/clj/<project>/migrations/migration_helper.clj`):

```clojure
(ns <project>.migrations.migration-helper
  (:require [<project>.schema.full :as full]))

(defn schema-with-target-schemas [target-schemas]
  (let [target-kinds    (set (map #(-> % :kind :value) target-schemas))
        backend-schemas (remove #(contains? target-kinds (-> % :kind :value)) full/full-schema)]
    (concat backend-schemas target-schemas)))
```

This takes migration-local schema snapshots, swaps them in for the matching kinds in the full schema, and returns a combined schema list. Kinds not overridden keep their current (full) schema. Kinds you override get your snapshot — which excludes attributes that don't exist at migration time.

**Pattern for each migration:**

```clojure
(ns <project>.migrations.20260409a-admin-flag
  (:require [c3kit.apron.schema :as s]
            [c3kit.bucket.api :as db]
            [c3kit.bucket.migrator :as m]
            [<project>.migrations.migration-helper :as mhelper]))

;; Schema snapshot: only attributes that exist BEFORE this migration runs.
;; Does NOT include :admin? (being added here) or :token-version (added later).
(def user
  {:kind            (s/kind :user)
   :id              s/id
   :ccid            {:type :string :db [:unique-value]}
   :email           {:type :string :db [:unique-value]}
   :name            {:type :string}
   :picture         {:type :string}
   :room-limit      {:type :long}
   :merged-accounts {:type [:string]}})

(def m-db (delay (db/create-db (db/load-config) (mhelper/schema-with-target-schemas [user]))))

(defn up []
  (m/add-attribute! :user :admin? {:type :boolean})
  ;; Use db/find- with @m-db, NOT db/find
  (when-let [users (seq (db/find- @m-db :user))]
    (db/tx* (map #(assoc % :admin? true) (filter admin-email? users)))))
```

**Key rules:**
- `db/find-`, `db/find-by-`, `db/entity-`, `db/tx-` — the `-` suffixed variants take an explicit DB impl as the first arg
- `db/tx*` and `m/add-attribute!` operate globally (no scoped variant needed) — they write to the actual database
- The `m-db` delay ensures the DB impl is created lazily (at migration runtime, not at namespace load time)
- Schema snapshots should omit validation specs (`:validate`, `:message`, `:present`) — migrations don't need them

### 6. Batch `:id IN` lookups and large tx*s on backfills — and log progress

c3kit's datomic query builder turns `(db/find-by :kind :id [id1 id2 …])` into a nested `(reduce (fn [clauses v] (concat clauses …)) nil values)`. Each value in the IN list adds a lazy `concat` frame; thousands of ids produce a seq that overflows the stack when realized. Dev data rarely hits this — staging/production data does. Symptom: `StackOverflowError` in `clojure.core$concat$fn` / `LazySeq.force` during migration, server restarts in a loop.

**Rule:** when backfilling against real data, partition entity-id lookups AND the writes into batches (~100), and log progress so staging failures tell you which batch died.

```clojure
(ns <project>.migrations.20260417-example
  (:require [c3kit.apron.log :as log]
            [c3kit.bucket.api :as db]
            [c3kit.bucket.migrator :as m]))

(def ^:private batch-size 100)
(defn- n-batches [n] (long (Math/ceil (/ (double n) batch-size))))

(defn- backfill-records! []
  (let [records (db/find :record)
        total   (count records)
        batches (n-batches total)]
    (log/report (str "backfill: " total " records -> :active in " batches " batches"))
    (doseq [[i batch] (map-indexed vector (partition-all batch-size records))]
      (log/info (str "  record batch " (inc i) "/" batches))
      (db/tx* (map #(assoc % :status :record.status/active) batch)))
    (log/report "backfill: records done")))

(defn backfill! []
  (backfill-records!)
  ;; …and similarly for other kinds — one fn per phase, each with its own report/info
  )
```

**Logging pattern:**
- `log/report` at the start of each phase with the total count and batch count — so you know up front whether the migration has any work to do, and what "done" looks like.
- `log/info` per batch with `(inc i) "/" batches` — narrow enough to localize a failure without drowning the logs. If something throws mid-backfill, the last `info` line names the batch that blew up.
- `log/report` at the end of each phase — confirmation that the phase finished.
- Split backfills into one private `-!` fn per phase. Pinpointing failures and reading logs both get easier.

Also batch the `db/tx*`s themselves — a single tx with tens of thousands of datoms can exhaust transactor memory even when the query builds fine.

## Common Patterns

### Add a new attribute with default value

```clojure
(ns project.migrations.20260409-add-std
  (:require [c3kit.apron.schema :as s]
            [c3kit.bucket.api :as db]
            [c3kit.bucket.migrator :as m]
            [project.migrations.migration-helper :as mhelper]))

(def room
  {:kind      (s/kind :room)
   :id        s/id
   :name      {:type :string}
   :permalink {:type :string}})

(def m-db (delay (db/create-db (db/load-config) (mhelper/schema-with-target-schemas [room]))))

(defn up []
  (m/add-attribute! :room :std {:type :long})
  (db/tx* (map #(assoc % :std 0) (db/find- @m-db :room))))

(defn down []
  (m/remove-attribute! :room :std))
```

### Move an attribute from one kind to another

```clojure
(defn up []
  (m/add-attribute! :client-app :api-key {:type :string})
  (let [rooms       (db/find- @m-db :room)
        client-apps (db/find-by- @m-db :client-app :room (map :id rooms))
        updated-apps  (map #(assoc % :api-key (:api-key (first (filter (fn [r] (= (:id r) (:room %))) rooms)))) client-apps)
        updated-rooms (map #(assoc % :api-key nil) rooms)]
    (db/tx* (concat updated-apps updated-rooms)))
  (m/remove-attribute! :room :api-key))
```

### Install an entirely new entity kind

```clojure
(ns project.migrations.20250705-01-secrets
  (:require [c3kit.apron.schema :as s]
            [c3kit.bucket.migrator :as m]))

(defn up []
  (m/install-schema!
    {:kind (s/kind :secret)
     :id   s/id
     :name {:type :string :validate s/present? :message "must be present"}
     :val  {:type :string :validate s/present? :message "must be present"}}))

(defn down []
  (m/remove-attribute! :secret :val)
  (m/remove-attribute! :secret :name)
  (m/remove-attribute! :secret :id))
```

### Rename an attribute

```clojure
(defn up []
  (m/rename-attribute! :story :old-name :story :new-name))

(defn down []
  (m/rename-attribute! :story :new-name :story :old-name))
```

Note: SQL implementations may not allow the kind to change during rename.

## Migrator API Reference

- `(m/add-attribute! kind attr spec)` -- Add a new attribute to an existing kind
- `(m/remove-attribute! kind attr)` -- Remove an attribute and all its values
- `(m/rename-attribute! kind attr new-kind new-attr)` -- Rename an attribute
- `(m/install-schema! schema-map)` -- Install an entirely new entity kind with all attributes

## Checklist

- [ ] Filename follows `YYYYMMDD[a-z]_description.clj` format
- [ ] Namespace matches filename with hyphens: `project.migrations.YYYYMMDD[a-z]-description`
- [ ] `up` function defined (no args)
- [ ] `down` function defined (no args) -- reverses `up`
- [ ] `m/add-attribute!` called BEFORE any `db/tx` using the new attribute
- [ ] `m/remove-attribute!` called AFTER clearing data in `down`
- [ ] Schema `.cljc` file updated to match (add/remove attributes)
- [ ] If multiple migrations on same date, suffixed with `a`, `b`, `c` etc.
- [ ] No attempts to change an existing Datomic attribute's type
- [ ] If migration queries entities: uses scoped DB (`db/find-` with `m-db`) with schema snapshot — NOT global `db/find`
- [ ] Schema snapshot only includes attributes that exist at the time the migration runs
- [ ] Migration helper exists at `src/clj/<project>/migrations/migration_helper.clj`
- [ ] Migration source in `src/clj/` has only production-safe requires (no `speclj`, no test-only namespaces)
- [ ] Migration tests (if any) live in a separate spec file under a directory that is NOT `:migration-ns` (e.g., `spec/clj/<project>/migration_specs/`), tagged `(tags :migration)`
- [ ] Backfills that touch `:id IN [...]` queries or large collections partition into batches (~100) — both the lookup and the `tx*`
- [ ] Backfills log start/end totals at `log/report` and per-batch progress at `log/info` so staging failures point at the dead batch
