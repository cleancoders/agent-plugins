# clojure plugin — ship cljfmt config + setup skill

Date: 2026-05-29
Status: Approved (design)

## Problem

The `clojure` plugin ships a PostToolUse hook (`cljfmt-postedit.sh`) that runs
`cljfmt fix` on every Clojure file edit. `cljfmt` auto-discovers its config from
`cljfmt.edn` in the project. Projects that have no such config get cljfmt's
**default** ruleset — which does not include the Speclj / Reagent / c3kit
`:extra-indents` the plugin's documented style depends on (describe, context,
it, with-let, for-all, it-routes, …). Result: the auto-format hook can reformat
code in a way that *fights* the style the plugin teaches.

The c3kit-jig scaffolder already ships a correct `cljfmt.edn`
(`templates/full-stack-reagent/cljfmt.edn`). The plugin should be able to put
the same config into any project that installs the plugin.

## Goals

- Bundle a baseline `cljfmt.edn` with the plugin.
- Give the user an explicit, re-runnable way to pull it into their project.
- Nudge the user toward that action when a Clojure project has no cljfmt config,
  without nagging or requiring a response.

## Non-goals

- Auto-copying config without user action.
- Referencing the bundled config directly from the hook via `--config`
  (rejected: hides the config from the repo, overrides project-local config,
  not committable/tweakable). The config must land as a real repo file.

## Components

### 1. `plugins/clojure/cljfmt.edn` (new)

Verbatim copy of `c3kit-jig/templates/full-stack-reagent/cljfmt.edn`, with the
scaffolder-specific header comment removed and replaced by a short note stating
this is the `clojure` plugin's shipped baseline (Speclj test macros, c3kit
`for-all`, Reagent `with-let`). The `:extra-indents` map is copied unchanged.

### 2. `plugins/clojure/skills/setup-cljfmt/SKILL.md` (new)

User-invoked skill `/clojure:setup-cljfmt`. Behavior:

1. Resolve bundled config at `${CLAUDE_PLUGIN_ROOT}/cljfmt.edn`.
2. Target path = `<project-root>/cljfmt.edn`.
3. If target **absent** → copy bundled config there, confirm what was written.
4. If target **present** → show a diff (existing vs bundled) and prompt the
   user to choose: **overwrite** / **skip** / **merge manually** (Claude helps
   merge entries on request).
5. After a write, note that the PostToolUse `cljfmt-postedit` hook will now use
   these indents on the next edit.

The skill is prose instructions for Claude (same shape as the other skills in
this plugin); it performs the copy/diff via the normal file tools.

### 3. `plugins/clojure/hooks/session-start-toolcheck.sh` (edit)

After the existing tool audit, still inside the Clojure-project guard, check for
an existing cljfmt config file: any of `cljfmt.edn`, `.cljfmt.edn`, `.cljfmt` in
the project root. If **none** exist, append a suggestion line to the injected
`additionalContext`:

> No cljfmt config found in this Clojure project. The plugin's cljfmt-postedit
> hook will format with cljfmt defaults, which omit the Speclj / Reagent indent
> rules this plugin's style assumes. Suggest the user run `/clojure:setup-cljfmt`
> to pull in the plugin's baseline `cljfmt.edn`. Informational only — do not
> block on it.

Details:

- Stateless. Fires every session start while config is absent. No decline
  marker, no extra state files.
- Folded into the **existing** SessionStart notice so there is at most one
  injected message per session, not two. If both tools are missing *and* config
  is absent, both appear in one payload.
- The config check is plain `[ -f ]`; needs no `jq`. The existing jq-absent
  stderr fallback is preserved for the tools-missing case.
- Non-Clojure projects: no nudge (existing `is_clojure_project` guard).

## Data flow

```
SessionStart (Clojure project, no cljfmt config)
  → additionalContext suggests /clojure:setup-cljfmt
  → user runs skill
  → cljfmt.edn copied into repo (committable, tweakable)
  → next Edit triggers cljfmt-postedit hook
  → cljfmt auto-discovers cljfmt.edn → :extra-indents applied
```

## Testing

- Bash hooks have no test harness in this repo (consistent with the existing
  hooks). Verify the SessionStart branch manually in a temp repo: config present
  → no nudge; config absent → nudge line in the payload; non-Clojure → silent.
- The skill is prose; no automated test.

## Release

- Bump `plugins/clojure/VERSION` 1.9.1 → 1.10.0 (new feature).
- CHANGES entry.
- README mention of the bundled config + setup skill.
- CI syncs version fields and tags on push (per repo CLAUDE.md).
