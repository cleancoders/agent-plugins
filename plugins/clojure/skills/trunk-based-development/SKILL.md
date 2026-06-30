---
name: trunk-based-development
description: Use when adding a new feature, page, route, or endpoint to a Clojure/ClojureScript project that deploys continuously. Ensures every change is mergeable to master and deployable to production without being *released* — gated behind a feature flag, an environment darklaunch (when-not production?), or branch-by-abstraction. Separates release from deploy. Applies even on feature branches/worktrees: merging to master must not release the feature to production.
---

# Trunk-Based Development

## Core Principle: Deploy ≠ Release

**Deploying** ships code to a running environment. **Releasing** makes a feature
reachable by users. Keep them separate.

Every change must be mergeable to master and deployable to production *without
being released there*. Pushing to master may deploy production, but the new
feature stays dark in production until explicitly turned on. The same code is
fully demo-able in staging.

This holds **even on a feature branch or worktree**: after merging to
master/main, pushing to origin releases the feature to staging only — never to
production — even though the push deploys production.

If you are about to write a feature that becomes reachable the moment it merges,
stop and gate it.

## Decision Flow: How to Gate

When adding a feature, pick the gating mechanism in this order:

1. **Feature-flag system exists?** → put the release-gating feature behind a
   flag (default off).
2. **Else environment awareness exists?** → darklaunch via `when-not
   production?` / a `darklaunch?` predicate.
3. **Pure abstraction implementation?** (a new `defmethod` on an extensible
   `defmulti`, a `defprotocol` impl) → branch-by-abstraction. The impl is inert
   until something dispatches to it, so it needs **no gate of its own**. Gate
   only the *integration point* — the route, link, or menu entry that makes it
   reachable.

The third case is the common one and the easiest to over-gate. A new SPA page
implements `page/render`, which is extensible — adding the method releases
nothing. Only the **route** that lets a user reach the page is the release.
Flag/darklaunch the route, not the `defmethod`.

## Feature Flags

Backend checks a per-user flag; short-circuit with `or` and an extracted guard
(see `writing-clojure-code`):

```clojure
(defn- maybe-flag-off [request]
  (when-not (flag/flag-is-on? (user/current request) "my-feature")
    (ajax/fail nil "Not found")))

(defn api-handler [request]
  (or (maybe-flag-off request)
      (ajax/ok (do-the-thing request))))
```

Frontend gates rendering on the flag:

```clojure
(when (config/flag-is-on? "my-feature")
  [my-feature/section])
```

A flag defaults **off**. Turning it on is the release.

## Environment Darklaunch

When there is no flag system, gate on environment. Predicates are read from an
env var at startup.

Backend (CLJ) — plain values:

```clojure
;; src/clj/<project>/config.clj
(def environment (app/find-env "<config-key>" "<ENV_VAR>"))
(def production? (= "production" environment))
(def staging?    (= "staging" environment))
(def darklaunch? (not= "production" environment))
```

```clojure
;; gate a handler / behavior off production
(when config/darklaunch?
  (enable-experimental-thing!))
```

Frontend (CLJS) — reagent tracks, so **deref** to read:

```clojure
;; src/cljs/<project>/config.cljs
(def production? (reagent/track environment? "production"))
(def darklaunch? (reagent/track not-environment? "production"))
```

```clojure
(when @config/darklaunch?
  [experimental/panel])
```

## Branch-by-Abstraction & Routes

Gate the integration point, not the implementation.

```clojure
;; backend route table — the route is the release point
(if-not config/production? darklaunch-page-handler (fn [_] nil))
```

For a new page (see `creating-pages`): the `defmethod page/render` and the
namespace registration in `main.cljs` release nothing on their own. Gate the
**frontend and backend routes** that reach the page — by flag or darklaunch —
so the page is demo-able in staging and dark in production until released.

## What NOT to Gate

- Internal helpers / pure functions with no live caller
- Additive schema migrations (additive changes are safe to deploy)
- Abstraction impls (`defmethod`, protocol impls) with no live integration
  point — only their integration point gets gated

Over-gating buries flags in code that was never reachable anyway. Gate at the
single point where a user gains access.
