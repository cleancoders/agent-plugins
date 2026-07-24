---
name: setup-clj-kondo
description: Use when a Clojure project has no clj-kondo config and the user wants the plugin's security-tuned linter rules, or when the SessionStart hook suggested running it. Copies the plugin's bundled clj-kondo config into the project's .clj-kondo/config.edn (and its Speclj `with` and secretary `defroute` hooks into .clj-kondo/hooks/), with a diff + prompt if one already exists.
---

# Setting up clj-kondo config

The `clojure-security` plugin's PostToolUse hook runs `clj-kondo --lint` after
every Clojure edit. `clj-kondo` auto-discovers `.clj-kondo/config.edn` from the
project root and merges it with the hook's inline output config. Without it,
the per-edit lint uses clj-kondo defaults, which omit this plugin's
security-tuned linter levels (escalated `:type-mismatch` / `:refer-all`,
surfaced `:unused-binding` / `:shadowed-var` / `:unused-private-var`) and the
Speclj resolution excludes. This skill copies the plugin's baseline config into
the project.

The config also references two clj-kondo hooks: `hooks.speclj-with/with-binding`
(teaches the linter how Speclj's `with` / `with!` / `with-all` / `with-all!`
declare deref-able symbols `@name`) and `hooks.secretary/defroute` (teaches it
how secretary's `defroute` binds route params). Without the hook files copied
alongside the config, clj-kondo cannot resolve the hooks — `@with-binding`
derefs get flagged as `:type-mismatch` errors and `defroute` route params as
unresolved symbols. So this skill copies the config AND both hook files.

## Steps

1. **Locate the bundled files.** Three files ship with the plugin, all relative
   to `${CLAUDE_PLUGIN_ROOT}`:
   - `${CLAUDE_PLUGIN_ROOT}/clj-kondo.edn` — the config.
   - `${CLAUDE_PLUGIN_ROOT}/clj-kondo.hooks/speclj_with.clj` — the Speclj `with`
     hook the config's `:hooks {:analyze-call ...}` references.
   - `${CLAUDE_PLUGIN_ROOT}/clj-kondo.hooks/secretary.clj` — the secretary
     `defroute` hook the config's `:hooks {:analyze-call ...}` references.
   Read the config so you have its exact contents. (`CLAUDE_PLUGIN_ROOT` is set
   when the plugin's hooks run; if it is not set in your environment, the files
   live at the `clojure-security` plugin's install root next to its `hooks/`
   directory.)

2. **Determine the targets.** In the project root (the current working
   directory's repo root):
   - Config → `.clj-kondo/config.edn` (clj-kondo's canonical config location —
     note the bundle is a flat `clj-kondo.edn` but the target lives inside the
     `.clj-kondo/` directory).
   - Hooks → `.clj-kondo/hooks/speclj_with.clj` and
     `.clj-kondo/hooks/secretary.clj` (these paths must match the namespaces
     `hooks.speclj-with` / `hooks.secretary` the config references: clj-kondo
     resolves a hook ns from `<config-dir>/<munged-path>.clj`, so
     `hooks.speclj-with` → `.clj-kondo/hooks/speclj_with.clj` and
     `hooks.secretary` → `.clj-kondo/hooks/secretary.clj`).
   Create the `.clj-kondo/` and `.clj-kondo/hooks/` directories if they do not
   exist.

3. **Always copy the hook files.** Write the bundled
   `clj-kondo.hooks/speclj_with.clj` and `clj-kondo.hooks/secretary.clj` to
   `.clj-kondo/hooks/`, overwriting any existing copies (they are plugin-owned,
   not user-edited). The config is inert without them — a missing or mismatched
   hook leaves `@with-binding` derefs flagged as `:type-mismatch` errors and
   `defroute` route params flagged as unresolved symbols.

4. **If the config target does not exist:** Write the bundled config to
   `.clj-kondo/config.edn`. Tell the user both files were created and that the
   clj-kondo-postedit hook will use these linter levels on the next edit.

5. **If the config target already exists:** Do NOT overwrite silently. Show the
   user a diff between the existing `.clj-kondo/config.edn` and the bundled
   config, then ask them to choose one of:
   - **Overwrite** — replace the project file with the bundled config.
   - **Skip** — leave the project file unchanged.
   - **Merge manually** — help the user combine entries (e.g. add any
     `:lint-as`, `:linters`, or `:hooks` keys from the bundle that the project
     file is missing, preserving the project's other settings). If the project
     gains the `:hooks {:analyze-call ...}` entries, the hook file from step 3
     must also be present — confirm it was copied.
   Act on their choice. After any write, note that the clj-kondo-postedit hook
   will use the updated config on the next edit.

6. **Suggest committing.** Remind the user that `.clj-kondo/config.edn` and both
   hook files (`.clj-kondo/hooks/speclj_with.clj`, `.clj-kondo/hooks/secretary.clj`)
   belong in version control so teammates and CI lint the same way.
