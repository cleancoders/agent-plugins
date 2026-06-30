# clojure

Clojure / ClojureScript skills for the cleancoders stack (c3kit, Reagent, Speclj, and cleancoders forms).

## Skills

| Skill | When to use |
|---|---|
| `/clojure:creating-pages` | Creating a new page/route in a ClojureScript SPA |
| `/clojure:writing-migrations` | Writing a c3kit bucket/migrator database migration |
| `/clojure:using-forms` | Creating or modifying forms that use `cleancoders.forms.core` |
| `/clojure:writing-tests` | Writing Speclj tests (structure, selectors, wire helpers, autorunner recovery) |
| `/clojure:writing-reagent-components` | Writing or refactoring Reagent components (`with-let`, `after-render`, event handlers) |
| `/clojure:using-c3kit-bucket` | Working with c3kit bucket (entity lookups, pushing filters into queries, keeping logic in CLJC) |
| `/clojure:writing-clojure-code` | Writing backend Clojure code — formatting (cond->, as->, continuation args, let alignment) and handler idioms (short-circuit with or, extract guard helpers, extract reusable predicates) |
| `/clojure:trunk-based-development` | Adding a feature/page/route to a continuously-deployed project — gate behind a feature flag, environment darklaunch, or branch-by-abstraction so it deploys to prod without releasing |

## Hooks

| Event | Hook | Purpose |
|---|---|---|
| `SessionStart` | `session-start-toolcheck.sh` | In a Clojure project, surfaces a one-shot notice listing any missing tools (`cljfmt`, `jq`) with install hints. Skipped in non-Clojure projects. |
| `PostToolUse` (`Edit` / `Write` / `MultiEdit`) | `cljfmt-postedit.sh` | Auto-formats `.clj` / `.cljs` / `.cljc` / `.edn` / `.bb` with `cljfmt fix`. If a file was rewritten, notifies Claude on stderr so it re-Reads before the next Edit. Silent no-op when `cljfmt` or `jq` is not installed (the SessionStart notice already warned about it). |

### Bundled cljfmt config

The plugin ships a baseline `cljfmt.edn` with Speclj / Reagent / c3kit `:extra-indents`. Run `/clojure:setup-cljfmt` to copy it into your project so the auto-format hook matches the documented style rather than cljfmt defaults. If a `cljfmt.edn` already exists the skill shows a diff and asks whether to overwrite, skip, or merge. The `SessionStart` hook suggests this once when no cljfmt config is present.

### Tool dependencies

- [`cljfmt`](https://github.com/weavejester/cljfmt) — needed for the format hook. Install with `brew install --cask cljfmt` or grab the standalone binary from the releases page. The hook silently no-ops without it.
- `jq` — needed to parse hook input. Almost always already installed; `brew install jq` if not.

## Installation

With the cleancoders marketplace already added:

```
/plugin install clojure@cleancoders-agent-plugins
```

Or via `.claude/settings.json`:

```json
{
  "enabledPlugins": {
    "clojure@cleancoders-agent-plugins": true
  }
}
```
