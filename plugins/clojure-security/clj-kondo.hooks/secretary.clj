(ns hooks.secretary
  (:require [clj-kondo.hooks-api :as api]))

(defn defroute
  "secretary.core/defroute is `(defroute path binding & body)` (the path-first
   arity). The binding is a destructuring form for the route params — either a
   vector (`[id]`) or a map (`{:as params}`). clj-kondo can't resolve it through
   the macro, so rewrite the call to a `fn` whose single parameter IS that
   binding: `(fn [binding] & body)`. Wrapping the binding in the fn arg vector
   handles both the vector and map destructure forms, resolving the params in
   the body with no behaviour change."
  [{:keys [node]}]
  (let [[_ _path binding & body] (:children node)
        new-node (api/list-node
                  (list* (api/token-node 'clojure.core/fn)
                         (api/vector-node [binding])
                         body))]
    {:node (with-meta new-node (meta node))}))
