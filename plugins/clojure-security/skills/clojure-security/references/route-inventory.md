# Route inventory sweep

A procedure, not a pattern class. Load when auditing access control — the
`missing-authn`, `missing-authz`, `incorrect-authz`, `idor`, and `csrf` classes are
all found this way. No scanner can do this: "this handler is missing an authz
check" requires knowing the application's route table and its own conventions.

## Why comparison, not rules

There is no universal signature for "should have been protected." Instead, compare
each route against its siblings and let the codebase state its own intent. An
application where *every* route is unauthenticated yields no findings — correctly,
since it may be a public API. The signal is **inconsistency**, not absence.

## Step 1 — Locate routes

```
rg -n 'defroutes|context\s+"|GET\s+"|POST\s+"|PUT\s+"|DELETE\s+"'   # compojure
rg -n '\["/' --type clojure                                          # reitit vectors
rg -n ':handler\s|:middleware\s'                                     # reitit route data
rg -n 'defroute'                                                     # secretary (CLJS — client-side, see caveat)
rg -n 'wrap-|ring.middleware'                                        # middleware stack
```

**Caveat:** secretary `defroute` is client-side routing. It is never an
authorization boundary. Record CLJS routes only to find server endpoints they call;
never report a missing guard on one.

## Step 2 — Per route, record

- path and method
- handler var
- **authn guard in effect** — walk the middleware stack outward from the handler,
  including `context`-level and router-level `:middleware`. A guard applied at the
  router covers every child route; missing that is the most common false positive.
- **authz guard** — role or permission check, wherever it appears
- **ownership check** — if the handler accepts an entity id, is that id constrained
  to the caller?

## Step 3 — Emit the matrix

```
| route | method | handler | authn | authz | owns-check | notes |
|-------|--------|---------|-------|-------|------------|-------|
| /api/invoices/:id | GET | show-invoice | wrap-auth | — | no | reads by params id |
```

Use `—` for absent, `?` for could-not-trace. Never leave a cell blank.

## Step 4 — Flag by sibling comparison

| condition | class | CWE |
|-----------|-------|-----|
| no authn guard, siblings under the same prefix have one | `missing-authn` | 306 |
| no authz guard, siblings under the same prefix have one | `missing-authz` | 862 |
| authn present, accepts an entity id, no ownership check | `idor` | 639 |
| guard weaker than siblings (logged-in where siblings check role) | `incorrect-authz` | 863 |
| mutating verb, no anti-forgery middleware, cookie session | `csrf` | 352 |

## Step 5 — Severity and provisionality

Apply the skill's three-axis heuristic. Any route with a `?` in the authn or authz
column is **provisional** — report it as "guard could not be traced," not as a
missing guard. Overstating an untraced guard is the failure mode that makes
reviewers stop trusting the sweep.

## Cost control

This sweep is token-heavy on large route tables. On `diff` / `staged` scopes, run it
only when a route-defining file is in the diff. On `all` scope, run it always.
