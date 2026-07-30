# Clojure `trunk-based-development` Skill — Design

**Date:** 2026-06-29
**Plugin:** `clojure`
**Status:** Approved, pending implementation

## Problem

The `clojure` plugin has no guidance for keeping work mergeable to master and
deployable to production *without releasing* it. Continuous-deploy projects need
every change to ride to production dark — gated behind a feature flag, an
environment darklaunch, or branch-by-abstraction — and turned on explicitly.
Claude currently writes features that release the moment they merge.

## Goal

Add a skill that teaches Claude to **separate release from deploy** when writing
Clojure/ClojureScript. Pushing to master may deploy production, but the feature
stays off in production until explicitly enabled. All code remains demo-able in
staging.

Scope: **code-gating only.** CI/deploy pipeline config is out of scope (and
proprietary); the deploy≠release split is stated as motivation, not configured
here.

## Mechanism (sanitized from real project patterns)

All examples use generic namespaces (`config/`, `flag/`) and placeholder flag
names (`"my-feature"`). No real env-var names, flag names, or proprietary
namespaces.

### Environment predicates

Keyed off an env var read at startup. Backend (CLJ) plain values; frontend
(CLJS) reagent tracks that must be deref'd.

```clojure
;; backend — src/clj/<project>/config.clj
(def environment  (app/find-env "<config-key>" "<ENV_VAR>"))
(def production?  (= "production" environment))
(def staging?     (= "staging" environment))
(def darklaunch?  (not= "production" environment))
```

```clojure
;; frontend — src/cljs/<project>/config.cljs  (reagent tracks — deref to read)
(def production? (reagent/track environment? "production"))
(def darklaunch? (reagent/track not-environment? "production"))
```

### Feature flags

Backend per-user check; frontend simple lookup.

```clojure
;; backend gate — short-circuit with or, extract guard
(defn- maybe-flag-off [request]
  (when-not (flag/flag-is-on? (user/current request) "my-feature")
    (ajax/fail nil "Not found")))

(defn api-handler [request]
  (or (maybe-flag-off request)
      (ajax/ok (do-the-thing))))
```

```clojure
;; frontend
(when (config/flag-is-on? "my-feature")
  [my-feature/section])
```

### Route gating (the integration point)

```clojure
;; backend route table — gate the route, not the abstraction impl
(if-not config/production? darklaunch-page-handler (fn [_] nil))
```

## Decision flow (the heart of the skill)

When adding a feature, pick the gating mechanism:

1. **Feature-flag system exists?** → put the release-gating feature behind a flag.
2. **Else environment awareness exists?** → darklaunch via `when-not production?` /
   `darklaunch?`.
3. **Pure abstraction implementation** (new `defmethod page/render`, a
   `defprotocol` impl)? → branch-by-abstraction. The impl is inert until
   something dispatches to it, so it needs **no gate**. Gate only the
   *integration point* — the route/link/menu entry that reaches it.

## What NOT to gate

- Internal helpers / pure functions with no live caller
- Additive schema migrations
- Abstraction impls (`defmethod`, protocol impls) with no live integration point —
  only their integration point gets gated

## Skill structure

`plugins/clojure/skills/trunk-based-development/SKILL.md`

Frontmatter:

```
name: trunk-based-development
description: Use when adding a new feature, page, route, or endpoint to a
  Clojure/ClojureScript project that deploys continuously. Ensures every change is
  mergeable to master and deployable to production without being *released* — gated
  behind a feature flag, an environment darklaunch (when-not production?), or
  branch-by-abstraction. Separates release from deploy. Applies even on feature
  branches/worktrees: merging to master must not release to production.
```

Body sections (scaled to complexity):

1. Core principle — deploy ≠ release.
2. Decision flow (above).
3. Feature flags (sanitized examples).
4. Environment darklaunch (sanitized examples; note frontend track deref).
5. Branch-by-abstraction & routes — the page/render example; cross-link
   `creating-pages`.
6. What NOT to gate.

## Cross-link

Add a pointer in `plugins/clojure/skills/creating-pages/SKILL.md`: at the
route-adding step, note the route is the release point — gate it per
`trunk-based-development`.

## Out of scope

- CI/deploy configuration
- Any real proprietary names, flags, or env vars
- Tests: skill content is prose/markdown with no test harness (the repo's
  bash/shunit2 harness covers hooks, not skill markdown).
