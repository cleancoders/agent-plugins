---
name: setup-cljfmt
description: Use when a Clojure project has no cljfmt config and the user wants the plugin's baseline indentation rules, or when the SessionStart hook suggested running it. Copies the plugin's bundled cljfmt.edn into the project root, with a diff + prompt if one already exists.
---

# Setting up cljfmt config

The `clojure` plugin's PostToolUse hook runs `cljfmt fix` after every Clojure
edit. `cljfmt` auto-discovers `cljfmt.edn` from the project root. Without it,
formatting uses cljfmt defaults, which omit the Speclj / Reagent / c3kit
`:extra-indents` this plugin's style assumes. This skill copies the plugin's
baseline config into the project.

## Steps

1. **Locate the bundled config.** It is at `${CLAUDE_PLUGIN_ROOT}/cljfmt.edn`.
   Read it so you have its exact contents. (`CLAUDE_PLUGIN_ROOT` is set when the
   plugin's hooks run; if it is not set in your environment, the file lives at
   the `clojure` plugin's install root next to its `hooks/` directory.)

2. **Determine the target.** The target is `cljfmt.edn` in the project root
   (the current working directory's repo root).

3. **If the target does not exist:** Write the bundled config to
   `cljfmt.edn`. Tell the user the file was created and that the
   `cljfmt-postedit` hook will use these indents on the next edit.

4. **If the target already exists:** Do NOT overwrite silently. Show the user a
   diff between the existing `cljfmt.edn` and the bundled config, then ask them
   to choose one of:
   - **Overwrite** — replace the project file with the bundled config.
   - **Skip** — leave the project file unchanged.
   - **Merge manually** — help the user combine entries (e.g. add any
     `:extra-indents` keys from the bundle that the project file is missing,
     preserving the project's other settings).
   Act on their choice. After any write, note that the `cljfmt-postedit` hook
   will use the updated config on the next edit.

5. **Suggest committing.** Remind the user that `cljfmt.edn` belongs in version
   control so teammates and CI format the same way.
