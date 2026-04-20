---
name: writing-reagent-components
description: Use when writing or refactoring Reagent components. Covers with-let over form-2, after-render for mount setup, ccc/for-all, nix-n-do for click handlers, extracting complex handlers, avoiding atom indirection, and other Reagent style conventions.
---

# Writing Reagent Components

## Render subcomponents with brackets `[component]`, not parens `(component)`

Two ways to place a subcomponent in a parent's hiccup tree:

- `(foo-section)` — plain function call. Inlines the returned hiccup into the parent's render. Reagent sees raw data, not a component.
- `[foo-section]` — Reagent component form. Reagent gives `foo-section` its own component boundary, identity, and render scope.

**Always use brackets.** Paren form sneaks through for stateless pure-hiccup helpers because the rendered DOM is identical, but it breaks in three ways as complexity grows:

1. **Lifecycle hooks don't bind correctly.** `r/with-let`, `r/after-render`, form-2/form-3 components need Reagent's render cycle. Called as parens, they execute in the parent's render context, so `with-let` bindings don't persist across re-renders, `after-render` may fire on every parent render instead of once, and the `finally` cleanup block never runs. This is also why form-2 components silently break with parens — see the next section.
2. **Re-renders lose scope.** When a subcomponent derefs a ratom/cursor, bracket form localizes the subscription to that component — only it re-renders when the deref changes. Paren form flattens the deref into the parent's render, so the whole parent tree re-renders on every change.
3. **Can't leverage memoization.** Each `[component]` gets a React identity; React can skip re-rendering it when props are equal. Paren form has no component, so there's nothing for React to memoize.

```clojure
;; Good — bracket form; each section is a real component
(defn page []
  [:main
   [hero-section]
   [article-list]         ; derefs @articles, re-renders only when that changes
   [scroll-watcher]])     ; r/with-let + r/after-render bind correctly

;; Bad — parens inline the hiccup into page's render
(defn page []
  [:main
   (hero-section)
   (article-list)         ; deref leaks into parent; whole page re-renders on any change
   (scroll-watcher)])     ; with-let/after-render won't attach to this call
```

Same rule for subcomponents with props:

```clojure
;; Good
[item-card {:href "#alpha" :label "Alpha" :description "..."}]

;; Bad
(item-card {:href "#alpha" :label "Alpha" :description "..."})
```

### Static siblings don't need keys; dynamic sequences do

Static bracket-form siblings in a hiccup vector need no keys. React only requires keys for sequences produced at runtime (`map`, `for`, etc.).

```clojure
;; Good — static siblings, no keys needed
[:div
 [item-card {:label "Alpha" ...}]
 [item-card {:label "Beta" ...}]
 [placeholder-card {:id "coming-soon" ...}]]

;; Good — dynamic sequence, keys required via ^{:key ...} (use ccc/for-all, see below)
(ccc/for-all [article articles]
  ^{:key (:slug article)}
  [article-card article])

;; Bad — map returns a seq of raw hiccup from function calls. No keys, no component identity.
(map article-card articles)
```

## Pass hiccup children as positional args, not as map keys

When designing a component that wraps content — a section scaffold, a card, a modal, a terminal — **props go in the options map, but children (hiccup slots) are separate positional args.** This mirrors how hiccup itself works: `[:div props child1 child2 child3]`. Keeping children outside the map means callers read like hiccup, not like a config blob with hiccup buried inside.

**Convention:**
1. First arg: options map — data, config, ids, classes, URLs, callbacks.
2. Next args: named positional slots for each required child.
3. Trailing `& body` or `& extras`: variadic tail for flexible/optional content.

```clojure
;; Good — children are positional; options map holds only data
(defn- subsection [{:keys [id classes title subtitle link-url]} sidebar body & extras]
  [:section (cond-> {:id id} classes (assoc :class classes))
   (into [:div.container
          [:div.row
           [:div.column
            [:h2 title] [:p.note subtitle]
            body
            [:a.button {:href link-url} "Learn more"]]
           sidebar]]
         extras)])

(defn- alpha-section []
  [subsection
   {:id "alpha" :classes "border-bottom"
    :title "Alpha" :subtitle "Short tagline"
    :link-url "/features/alpha"}
   [alpha-sidebar]
   [:<>
    [:p "Body paragraph describing the feature."]
    [:p "More detail about how it works."]
    [:div.interpunct [:span "Tag"] [:span "Tag"] [:span "Tag"]]]])

;; Bad — children stuffed into the options map as :body / :sidebar / :extras keys
(defn- subsection [{:keys [id classes title subtitle link-url body sidebar extras]}]
  ...)

(defn- alpha-section []
  [subsection
   {:id "alpha" :classes "border-bottom"
    :title "Alpha" :subtitle "Short tagline"
    :link-url "/features/alpha"
    :sidebar [alpha-sidebar]
    :body [[:p "Body paragraph..."]
           [:p "More detail..."]
           [:div.interpunct ...]]}])
```

The bad version reads awkwardly — hiccup vectors nested inside a map — and it obscures the component's "shape" (which slots exist, which are required). Positional args make the component's API visible in the signature: `[opts sidebar body & extras]` says "takes props, one sidebar child, one body child, zero-or-more extras."

### Multiple children in one slot → wrap in `[:<>]`

When a single named slot needs to render multiple sibling hiccup elements, wrap them in a React Fragment `[:<>]` rather than turning the slot into a vector of vectors. The fragment keeps the slot's value shape uniform (one hiccup value in, one hiccup value out) while rendering as plain siblings in the DOM (no wrapper element).

```clojure
;; Good — body is a single hiccup value that happens to be a fragment
[subsection opts
 [sidebar]
 [:<>
  [:p "paragraph 1"]
  [:p "paragraph 2"]
  [:div.interpunct ...]]]

;; Good — body is a single element, no fragment needed
[subsection opts
 [sidebar]
 [:p "the whole body"]]

;; Bad — body as a vector of vectors. Ambiguous (is it one hiccup element or a collection?)
;; and forces the callee to distinguish at runtime.
[subsection opts
 [sidebar]
 [[:p "p1"] [:p "p2"] [:div ...]]]
```

### Optional trailing content → variadic `& name`

Trailing content that only some callers need (e.g., an `extras` slot one section uses and others don't) fits naturally as variadic `& extras`. Callers that don't need it pass nothing — no `nil` placeholder needed.

```clojure
(defn- subsection [opts sidebar body & extras]
  ...)

;; Without extras — just don't pass any
[subsection {:id "alpha" ...} [alpha-sidebar] [:<> ...]]

;; With one extras block
[subsection {:id "beta" ...} [beta-sidebar] [:<> ...] [beta-related-links]]
```

If you have multiple optional slots, prefer varargs only for the last one; the rest should be required positionals with explicit `nil` when unused — similar to `[arg-map button instructions body]` where `button` is commonly `nil`.

## NEVER use form-2 components — always use `reagent/with-let`

Form-2 components (outer `let` + inner `fn`) are error-prone: they silently break when called with parens instead of brackets, and have subtle re-render issues. `with-let` handles the same use cases correctly.

```clojure
;; Good — reagent/with-let
(defn my-component []
  (reagent/with-let [expanded? (reagent/atom false)]
    [:div {:on-click #(swap! expanded? not)}
     (when @expanded? [:p "Details"])]))

;; BAD — NEVER DO THIS — form-2 pattern
(defn my-component []
  (let [expanded? (reagent/atom false)]
    (fn []
      [:div {:on-click #(swap! expanded? not)}
       (when @expanded? [:p "Details"])])))
```

## Prefer `with-let` + `after-render` over `:f>` + `use-effect` for one-time setup

When you need to run setup once after mount (e.g., adding event listeners), use `r/with-let` + `r/after-render` instead of creating a `:f>` component just to call `use-effect`. Use `with-let`'s `finally` block for cleanup.

```clojure
;; Good — with-let + after-render + finally for cleanup
(defn my-component []
  (r/with-let [handler-ref (atom nil)
               _           (r/after-render #(setup-listeners! handler-ref))]
    [:div "content"]
    (finally (cleanup-listeners! handler-ref))))

;; Bad — creating a :f> component just to run use-effect
(defn my-effect [handler-ref]
  (core/use-effect
    (fn [] (setup-listeners! handler-ref))
    (fn [] (cleanup-listeners! handler-ref))
    [])
  nil)

(defn my-component []
  (r/with-let [handler-ref (atom nil)]
    [:<>
     [:f> my-effect handler-ref]
     [:div "content"]]))
```

## Use `ccc/for-all` instead of `(doall (for ...))`

When rendering lists in Reagent, use `ccc/for-all` (from `c3kit.apron.corec`) instead of wrapping `for` with `doall`:

```clojure
;; Good
(ccc/for-all [item items]
  ^{:key (:id item)}
  [:li (render-item item)])

;; Bad
(doall
  (for [item items]
    ^{:key (:id item)}
    [:li (render-item item)]))
```

## Use `wjs/nix-n-do` for click handlers that need preventDefault + stopPropagation

When a click handler needs to prevent default behavior and stop propagation (e.g., buttons inside anchor tags), use `wjs/nix-n-do` from `c3kit.wire.js`:

```clojure
;; Good — clean and concise
[:button {:on-click (wjs/nix-n-do add-to-list/install! item)} "Add"]

;; Bad — verbose inline lambda
[:button {:on-click (fn [e]
                      (.preventDefault e)
                      (.stopPropagation e)
                      (add-to-list/install! item))} "Add"]
```

Similarly, use `wjs/nod-n-do` when you only need `preventDefault` without `stopPropagation`.

## Extract complex click handlers into named functions

Don't put multi-step logic inline in `:on-click` handlers. Extract to a `defn-`:

```clojure
;; Good — named function, hiccup stays readable
(defn- submit-item! [item]
  (ajax/post! "/api/v1/items/submit"
              {:slug (:slug item) :kind :item}
              items/install!))

(defn- card [item]
  [:button {:on-click (wjs/nix-n-do submit-item! item)} "Submit"])

;; Bad — complex logic inline in hiccup
(defn- card [item]
  [:button {:on-click (fn [e]
                        (.preventDefault e)
                        (.stopPropagation e)
                        (ajax/post! "/api/v1/items/submit"
                                    {:slug (:slug item) :kind :item}
                                    items/install!))} "Submit"])
```

## Don't deeply nest anonymous functions — extract to `defn-`

When `r/with-let` + `r/after-render` setup involves complex logic (e.g., `requestAnimationFrame` loops), extract the logic into named `defn-` functions instead of nesting `letfn` inside lambdas:

```clojure
;; Good — extracted named functions
(defn- spin [angle animation-frame-id]
  (swap! angle #(mod (+ % 1.2) 360))
  ;; ... update DOM ...
  (reset! animation-frame-id (js/requestAnimationFrame spin)))

(defn- init-spin! [angle animation-frame-id]
  (fn [] (reset! animation-frame-id (js/requestAnimationFrame (partial spin angle animation-frame-id)))))

(defn- animated-component [content]
  (r/with-let [angle              (atom 0)
               animation-frame-id (atom nil)
               _setup             (r/after-render (init-spin! angle animation-frame-id))]
    content
    (finally (when @animation-frame-id (js/cancelAnimationFrame @animation-frame-id)))))

;; Bad — deeply nested anonymous functions
(defn- animated-component [content]
  (r/with-let [angle (atom 0)
               raf-id (atom nil)
               _setup (r/after-render
                        (fn []
                          (letfn [(spin []
                                    (swap! angle ...)
                                    (reset! raf-id (js/requestAnimationFrame spin)))]
                            (reset! raf-id (js/requestAnimationFrame spin)))))]
    content
    (finally (when @raf-id (js/cancelAnimationFrame @raf-id)))))
```

## Avoid atom indirection for component references

Don't use atoms to hold component references for indirect rendering. Require the namespace directly and render the component:

```clojure
;; Good — direct require and render
(ns my-app.page
  (:require [my-app.widget :as widget]))

(defn my-page []
  [:div [widget/featured]])

;; Bad — atom indirection
(def featured-component (atom nil))
;; In another file: (reset! page/featured-component featured-widget)
;; In page: (when @featured-component [@featured-component])
```

## Extract repeated expressions into private helpers

When an expression appears 3+ times, extract it into a `defn-`. Common candidates:
- Filter predicates (e.g., `(filter #(and (= :license (:kind %)) (= :video (:type %))))` → use/create a named predicate)
- Default value patterns (e.g., `(or (:field x) #{})` repeated everywhere)
- Multi-step data derivations computed identically in several functions
