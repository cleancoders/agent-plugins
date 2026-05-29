---
name: setup-clj-kondo
description: Use when a Clojure project has no clj-kondo config and the user wants the plugin's security-tuned linter rules, or when the SessionStart hook suggested running it. Copies the plugin's bundled clj-kondo config into the project's .clj-kondo/config.edn, with a diff + prompt if one already exists.
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

## Steps

1. **Locate the bundled config.** It is at `${CLAUDE_PLUGIN_ROOT}/clj-kondo.edn`.
   Read it so you have its exact contents. (`CLAUDE_PLUGIN_ROOT` is set when the
   plugin's hooks run; if it is not set in your environment, the file lives at
   the `clojure-security` plugin's install root next to its `hooks/` directory.)

2. **Determine the target.** The target is `.clj-kondo/config.edn` in the
   project root (the current working directory's repo root). This is clj-kondo's
   canonical config location — note the bundle is a flat `clj-kondo.edn` but the
   target lives inside the `.clj-kondo/` directory. Create the `.clj-kondo/`
   directory if it does not exist.

3. **If the target does not exist:** Write the bundled config to
   `.clj-kondo/config.edn`. Tell the user the file was created and that the
   clj-kondo-postedit hook will use these linter levels on the next edit.

4. **If the target already exists:** Do NOT overwrite silently. Show the user a
   diff between the existing `.clj-kondo/config.edn` and the bundled config,
   then ask them to choose one of:
   - **Overwrite** — replace the project file with the bundled config.
   - **Skip** — leave the project file unchanged.
   - **Merge manually** — help the user combine entries (e.g. add any
     `:lint-as` or `:linters` keys from the bundle that the project file is
     missing, preserving the project's other settings).
   Act on their choice. After any write, note that the clj-kondo-postedit hook
   will use the updated config on the next edit.

5. **Suggest committing.** Remind the user that `.clj-kondo/config.edn` belongs
   in version control so teammates and CI lint the same way.
