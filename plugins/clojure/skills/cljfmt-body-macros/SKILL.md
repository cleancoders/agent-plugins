---
name: cljfmt-body-macros
description: Use when writing a new Clojure macro that takes a `& body` (a body-macro — auth guards, `with-*`/`ensure-*` wrappers, DSL blocks), or when the defmacro-indent-check hook flags an unregistered body-macro. Explains how to register the macro in the repo's cljfmt.edn so cljfmt block-indents its call-site bodies instead of deep-aligning them under the first argument.
---

# cljfmt body-macro indentation

These repos format with `:function-arguments-indentation :cursive` (see the
plugin's `cljfmt.edn`). cljfmt **cannot tell a macro from a function**, so for
any macro it doesn't recognize it falls back to function-call indentation and
aligns a wrapped body **under the macro's first argument** — deep and ugly:

```clojure
;; NOT what you want — body aligned under `request`
(validation/ensure-org-admin request [_ org]
                             (let [member (param-entity request)]
                               (ajax/ok (present member))))
```

A body-macro wants its body at the normal 2-space block indent, like a `defn`:

```clojure
;; what you want
(validation/ensure-org-admin request [_ org]
  (let [member (param-entity request)]
    (ajax/ok (present member))))
```

cljfmt only does this once the macro is registered in `:extra-indents`.

## When this applies

A **body-macro** is a `defmacro` whose parameter list ends in `& body` (or
otherwise takes a trailing body that should read like a `defn`/`let` body):
auth guards (`ensure-*`, `api-*`), `with-*` wrappers, DSL blocks, etc. A
variadic macro that instead *returns a value* (threading-style, data-building)
is **not** a body-macro — leave it alone.

## The rule to add

Add one entry to the repo's root `cljfmt.edn` under `:extra-indents`:

```clojure
{:function-arguments-indentation :cursive
 :extra-indents
 {…
  ensure-org-admin [[:block 2]]}}
```

- **Key = the UNqualified macro name.** cljfmt matches on the name alone, so one
  entry covers every call site regardless of alias (`validation/ensure-org-admin`,
  `v/ensure-org-admin`, …). Do **not** add fully-qualified duplicates.
- **`N` in `[[:block N]]` = the number of fixed params before `& body`.** It is
  the count of "header" args that stay on the macro's opening line; everything
  after them is the body, indented 2 spaces.

| defmacro arglist | N | entry |
|---|---|---|
| `[request & body]` | 1 | `name [[:block 1]]` |
| `[request bindings & body]` | 2 | `name [[:block 2]]` |
| `[a b c & body]` | 3 | `name [[:block 3]]` |

`N` must match the arity — `[:block 0]` and `[:block 1]` do **not** produce the
2-space body when there are extra header args (verified against cljfmt 0.16).
For a destructured header param (`[{:keys [x]} & body]`) still count it as one
param.

After adding the entry, the plugin's `cljfmt fix` hook reindents the call sites
on the next edit.

## No global default is possible

There is no cljfmt switch to make *all* macros block-indent: it can't
distinguish macros from functions (a catch-all would wreck function-call
alignment), `:extra-indents` has no `:default`/catch-all key, regex keys don't
parse in the auto-discovered `cljfmt.edn` (strict EDN), and `[:block N]` is
arity-specific. So each body-macro needs its own entry. The
`defmacro-indent-check` PostToolUse hook is the backstop — it flags a new
variadic `defmacro` whose name isn't registered so this step isn't forgotten.
