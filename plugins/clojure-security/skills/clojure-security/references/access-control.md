# Access-control classes

Loaded on demand by the `clojure-security` skill. See the class index in `SKILL.md`.

Most classes here are found by the route sweep in `route-inventory.md`, not by
grepping for a sink. Read that procedure first when auditing access control.

### atom-toctou

Atom / ref check-then-act races in security state.

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

### missing-authn

**CWE-306 · OWASP A07**

A route reachable without any authentication guard, while its siblings under the
same prefix have one. Usually an oversight during a route-table edit, not a
decision.

```clojure
;; Vulnerable — sibling routes are wrapped, this one slipped through
["/api/admin"
 ["/users"   {:get  {:middleware [wrap-auth] :handler list-users}}]
 ["/metrics" {:get  {:handler show-metrics}}]]

;; Safe — the guard lives on the shared parent
["/api/admin" {:middleware [wrap-auth]}
 ["/users"   {:get {:handler list-users}}]
 ["/metrics" {:get {:handler show-metrics}}]]
```

**Grep:** not greppable in isolation — found by the sweep in `route-inventory.md`.
Compare each route's effective middleware chain against its siblings.

**False positives:** genuinely public endpoints (health checks, login, webhooks with
signature verification, static assets); an app with no authentication anywhere.

**Fix direction:** hoist the guard to the shared parent route rather than repeating
it per-route — a per-route guard is one edit away from being forgotten again.

**Severity floor:** High. Critical when the unguarded route mutates state or exposes
another user's data.

### missing-authz

**CWE-862 · OWASP A01**

The caller is authenticated but nothing checks whether *this* user may perform
*this* action. Authentication answers "who are you"; authorization answers "may
you" — passing the first is not passing the second.

```clojure
;; Vulnerable — any logged-in user can delete any project
(defn delete-project [req]
  (when (authenticated? req)
    (db/delete! :project (->uuid (get-in req [:params :id])))
    (no-content)))

;; Safe — permission checked before the effect, in the same expression
(defn delete-project [req]
  (let [user (current-user req)
        proj (db/entity (->uuid (get-in req [:params :id])))]
    (if (can-delete? user proj)
      (do (db/delete! :project (:id proj)) (no-content))
      (forbidden))))
```

**Grep:** found by the sweep in `route-inventory.md`. Supporting greps:
```
\(when\s+\(authenticated\?
\(if\s+\(logged-in\?
```

**False positives:** actions where authentication genuinely is the only requirement
(updating your own profile, reading your own notifications).

**Fix direction:** make the permission check a precondition of the effect, not a
separate earlier statement — separated checks drift as handlers are edited.

**Severity floor:** High. Critical on admin surfaces or anything destructive.

### incorrect-authz

**CWE-863, CWE-284 · OWASP A01**

A guard exists but is weaker than the one its siblings use — checks
authentication where siblings check a role, or checks the wrong role. Harder to
spot than a missing guard because the code looks protected.

```clojure
;; Vulnerable — siblings require :admin, this one only requires a session
["/api/admin"
 ["/users"    {:delete {:middleware [(wrap-role :admin)] :handler delete-user}}]
 ["/billing"  {:delete {:middleware [wrap-auth]          :handler delete-invoice}}]]

;; Safe — matches the strictest sibling
["/api/admin" {:middleware [(wrap-role :admin)]}
 ["/users"   {:delete {:handler delete-user}}]
 ["/billing" {:delete {:handler delete-invoice}}]]
```

**Grep:** found by the sweep in `route-inventory.md`. Compare guard *strength*, not
guard presence.

**False positives:** a deliberately lower bar for a genuinely less sensitive
sibling — confirm against the app's own permission model before reporting.

**Fix direction:** match the strictest sibling guard, and hoist it to the shared
parent so the comparison cannot drift again.

**Severity floor:** High.

### idor

**CWE-639 · OWASP A01**

A handler that authenticates the caller but then loads a record by an ID taken
straight from the request trusts the client to only ask for its own data. Common in
c3kit bucket code, where `db/entity` happily returns any entity by id.

```clojure
;; Vulnerable — authenticated, but any user can read any invoice
(defn show-invoice [{:keys [params] :as req}]
  (when (authenticated? req)
    (ok (db/entity (->uuid (:id params))))))

;; Safe — ownership is part of the query, not a later check
(defn show-invoice [{:keys [params] :as req}]
  (when-let [user (current-user req)]
    (if-let [inv (db/ffind-by :invoice :id (->uuid (:id params)) :owner-id (:id user))]
      (ok inv)
      (not-found))))
```

**Grep:**
```
db/entity\s+\(->uuid
db/entity\s+\(:id\s+params
\(db/entity\s+[^)]*params
```

**False positives:** admin-only handlers already gated by a role check; lookups
whose id comes from the session rather than the request; reference data with no
owner (country lists, plan tiers).

**Fix direction:** push the ownership predicate into the query rather than
asserting it after the fetch — a post-fetch check still leaks existence via timing
and is easy to forget on the next handler. Return 404, not 403, so the endpoint
does not confirm the record exists.

**Severity floor:** High. Critical when the record contains PII or payment data.
Medium only when every field returned is already public.

### csrf

**CWE-352 · OWASP A01**

A state-changing route reachable with an ambient cookie session and no
anti-forgery token. The browser attaches the session cookie to a cross-site form
post automatically; without a token, the request is indistinguishable from a real
one.

```clojure
;; Vulnerable — anti-forgery explicitly disabled on a cookie-session app
(wrap-defaults handler (-> site-defaults
                           (assoc-in [:security :anti-forgery] false)))

;; Safe — token required on every mutating request
(wrap-defaults handler site-defaults)   ; anti-forgery on by default
```

**Grep:**
```
:anti-forgery\]?\s+false
wrap-anti-forgery
api-defaults
```

The `\]?` is load-bearing: the idiomatic way to disable this is
`(assoc-in [:security :anti-forgery] false)`, which puts a `]` between the key and
the value. A pattern without it misses the most common form.

**False positives:** pure token-auth APIs that never read a cookie — if the
credential must be attached explicitly by JS, a cross-site form post cannot forge
it. `api-defaults` legitimately omits anti-forgery for this reason.

**Fix direction:** `wrap-anti-forgery`, with the token in the form body or an
`X-CSRF-Token` header. If the endpoint is genuinely token-auth-only, confirm no
cookie is read anywhere on the path before dismissing.

**Severity floor:** High for cookie-session apps; Low for pure token-auth APIs with
no cookie on the request path.

### path-traversal

**CWE-22 · OWASP A01**

A filesystem path built from request data. `../` segments escape the intended
directory; on a write path this is arbitrary file overwrite.

```clojure
;; Vulnerable
(slurp (io/file "uploads" (:name params)))

;; Safe — allowlist, no user text in the path
(def ^:private +docs+ {"terms" "terms.md" "privacy" "privacy.md"})
(when-let [f (get +docs+ (:name params))]
  (slurp (io/resource (str "docs/" f))))

;; Safe — canonicalize and assert the prefix
(let [base (.getCanonicalFile (io/file "uploads"))
      target (.getCanonicalFile (io/file base (:name params)))]
  (when (.startsWith (.getPath target) (.getPath base))
    (slurp target)))
```

**Grep:**
```
io/file\s+[^)]*\(:(name|path|filename)
io/resource\s+\(str
\(slurp\s+\(str
```

**False positives:** paths built entirely from constants or from an allowlist
lookup; ids validated as UUIDs before use.

**Fix direction:** prefer indexing a static map over sanitizing a path. If a real
path is unavoidable, canonicalize first and assert the prefix — stripping `../`
textually is defeated by encoding and symlinks.

**Severity floor:** High. Critical if the path is written to rather than read.

### ssrf

**CWE-918 · OWASP A01**

The server fetches a URL the client supplied. The request originates inside your
network, so it reaches hosts the client cannot — including cloud instance metadata.

```clojure
;; Vulnerable
(http/get (:url params))

;; Safe — host allowlist, checked after resolution
(def ^:private +allowed-hosts+ #{"api.partner.com" "cdn.partner.com"})
(let [host (.getHost (java.net.URL. (:url params)))]
  (if (contains? +allowed-hosts+ host)
    (http/get (:url params))
    (bad-request "host not allowed")))
```

**Grep:**
```
http/get\s+\(:
http/post\s+\(:
hato\.client
clj-http\.client
```

**False positives:** URLs assembled entirely from configuration; fetches of a fixed
host with only the path varying.

**Fix direction:** allowlist hosts rather than blocklisting ranges. Reject
link-local and private ranges explicitly — `169.254.169.254` is the cloud metadata
endpoint and is the usual target. Beware DNS rebinding: validate the resolved
address, not just the hostname string.

**Severity floor:** High. Critical in any cloud environment with an instance
metadata service, where SSRF is a direct path to credentials.

### mass-assignment

**CWE-915 · OWASP A08**

A request map merged wholesale into an entity, letting the client write fields the
form never exposed — `:role`, `:owner-id`, `:balance`, `:verified?`.

Filed here rather than in config-and-ops because this is where a route sweep
encounters it; its taxonomy row correctly records **A08**, not A01.

```clojure
;; Vulnerable — client can set :role
(defn update-user [req]
  (db/tx (merge (db/entity (current-user-id req)) (:params req))))

;; Safe — explicit allowlist of client-writable fields
(defn update-user [req]
  (let [changes (select-keys (:params req) [:name :email :timezone])]
    (db/tx (merge (db/entity (current-user-id req)) changes))))
```

**Grep:**
```
\(merge\s+[^)]*\(:params
db/tx\s+\(merge
\(db/tx\s+\(:params
```

**False positives:** merges of a map already narrowed by `select-keys` or a spec
conformer; internal jobs where the map is server-constructed.

**Fix direction:** `select-keys` at the boundary. An explicit allowlist of writable
fields is the only form that stays correct when someone adds a privileged column
later — a blocklist silently stops covering it.

**Severity floor:** High when the entity carries a role, owner, balance, or
verification field. Medium otherwise.
