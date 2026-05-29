# clojure-security plugin clj-kondo config + setup skill — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a baseline clj-kondo config with the `clojure-security` plugin, a `/clojure-security:setup-clj-kondo` skill to pull it into a project, and a SessionStart suggestion when a Clojure project has no clj-kondo config.

**Architecture:** Bundle the config source at the plugin root (`clj-kondo.edn`). A user-invoked skill copies it into the project's `.clj-kondo/config.edn` (diff + prompt if one already exists). The existing SessionStart marker hook gains a stateless, informational nudge pointing at the skill when no clj-kondo config is present.

**Tech Stack:** Bash 3.2 (macOS), `jq`, `clj-kondo`, Claude Code plugin skills (Markdown), `${CLAUDE_PLUGIN_ROOT}`.

**Core constraint (drives Task 1):** The PostToolUse hook lints a SINGLE file with NO classpath/cache analysis. The resolution linters (`:unresolved-var`, `:unresolved-namespace`, `:unresolved-symbol`) cannot resolve cross-namespace references without that analysis. Escalating any of them to `:error` would make every edit block on false positives. They are therefore left at clj-kondo defaults; only `:unresolved-symbol` carries excludes (for Speclj DSL macros).

**Note on testing:** Bash hooks in this repo have no automated harness (consistent with existing hooks). "Tests" here are manual temp-repo verifications with exact commands and expected output. The config gets a real `clj-kondo` validation run. The skill is prose — no automated test.

---

### Task 1: Bundle the baseline clj-kondo config

**Files:**
- Create: `plugins/clojure-security/clj-kondo.edn`

- [ ] **Step 1: Create the bundled config**

Create `plugins/clojure-security/clj-kondo.edn` with exactly this content:

```clojure
;; Baseline clj-kondo config shipped by the `clojure-security` plugin.
;;
;; The plugin's PostToolUse hook runs `clj-kondo --lint` after every Clojure
;; edit. clj-kondo auto-discovers this file at `.clj-kondo/config.edn` in the
;; project root and MERGES it with the hook's inline output config, so copying
;; it in tunes the per-edit lint. Pull it into a project with
;; `/clojure-security:setup-clj-kondo`.
;;
;; Security posture, not skeleton-silencing: linters that surface the sloppy
;; code where bugs hide are escalated, not turned off.
;;
;; IMPORTANT — the per-edit hook lints a SINGLE file with NO classpath/cache
;; analysis. The resolution linters (:unresolved-var / :unresolved-namespace /
;; :unresolved-symbol) cannot resolve cross-namespace references without that
;; analysis, so they are left at clj-kondo defaults. Only :unresolved-symbol
;; carries excludes — for Speclj DSL macros that clj-kondo cannot resolve
;; without jar analysis and would otherwise false-flag on every spec file.
{:lint-as
 {;; c3kit's `for-all` is a comprehension macro shaped like `for`.
  c3kit.apron.corec/for-all clojure.core/for
  ;; Speclj `with` / `with-all` rebind a value used via deref (`@name`);
  ;; treat like `def` so the binding resolves.
  speclj.core/with          clojure.core/def
  speclj.core/with-all      clojure.core/def}

 :linters
 {;; --- security posture: escalate ----------------------------------------
  ;; Type confusion is a real correctness/security defect — block on it.
  :type-mismatch      {:level :error}
  ;; No `:refer :all`. Every refer must be explicit.
  :refer-all          {:level :error}
  ;; The sloppy code where bugs hide — surface, don't block.
  :unused-binding     {:level :warning}
  :shadowed-var       {:level :warning}
  :unused-private-var {:level :warning}

  ;; --- Speclj DSL: symbol-resolution only --------------------------------
  ;; Speclj's structure / assertion / stub macros are referred but cannot be
  ;; resolved without jar analysis, so without these excludes every spec file
  ;; reports unresolved symbols. Resolution only — no behaviour change.
  :unresolved-symbol
  {:exclude [;; structure
             describe context it xit
             before before-all after after-all around around-all with with-all
             focus-describe focus-context focus-it
             tags pending
             ;; assertions
             should should-not should= should-not= should== should-not==
             should-be should-not-be should-be-a should-not-be-a
             should-be-nil should-not-be-nil should-fail
             should-contain should-not-contain
             should-start-with should-not-start-with
             should-end-with should-not-end-with
             should-throw should-not-throw
             should-have-invoked should-not-have-invoked
             should-invoke should-not-invoke
             should-be-same should-not-be-same
             should< should<= should> should>=
             ;; stubs / fixtures
             stub with-stubs redefs-around]}}}
```

- [ ] **Step 2: Verify it is valid EDN that clj-kondo accepts**

clj-kondo v2026.04.15 is installed. Lint a trivial snippet using this config as the config file; a malformed config or unknown-key surfaces as an error. Run:

```bash
T=$(mktemp -d)
printf '(ns foo.bar)\n(defn add [a b] (+ a b))\n' > "$T/snippet.clj"
clj-kondo --lint "$T/snippet.clj" --config "$(cat plugins/clojure-security/clj-kondo.edn)" 2>&1
echo "exit=$?"
rm -rf "$T"
```

Expected: no `clojure.lang.ExceptionInfo` / EDN parse error / `Invalid config` message. Output like `linting took Nms, errors: 0, warnings: 0` (or only findings about the snippet, never about the config). An EDN parse error or "Invalid config" is a FAIL.

- [ ] **Step 3: Commit**

```bash
git add plugins/clojure-security/clj-kondo.edn
git commit -m "clojure-security: bundle baseline clj-kondo config"
```

---

### Task 2: Add the SessionStart clj-kondo-config nudge

**Files:**
- Modify: `plugins/clojure-security/hooks/session-start-marker.sh`

The current hook builds a `MISSING` string of missing tools and emits an `additionalContext` payload only if `MISSING` is non-empty (lines 111–119). This task adds a separate, independent suggestion when no clj-kondo config exists, folded into the same single payload.

- [ ] **Step 1: Add the config detection + suggestion text**

In `plugins/clojure-security/hooks/session-start-marker.sh`, immediately after the `nvd-clojure` `note_missing` block (currently ending at line 109) and before the `# Build the additionalContext payload only if there is something to report.` comment (currently line 111), insert:

```bash
# Suggest pulling in the plugin's clj-kondo config if the project has none.
# clj-kondo auto-discovers `.clj-kondo/config.edn` from the project root;
# without one the per-edit lint runs with defaults that omit this plugin's
# security-tuned linter levels and Speclj resolution excludes.
CLJ_KONDO_SUGGESTION=""
if [ ! -f "$CWD/.clj-kondo/config.edn" ]; then
  CLJ_KONDO_SUGGESTION="No clj-kondo config found in this Clojure project (\`.clj-kondo/config.edn\`). The clj-kondo-postedit hook will lint with defaults, which omit this plugin's security-tuned linter levels (escalated :type-mismatch / :refer-all, surfaced :unused-binding / :shadowed-var) and the Speclj resolution excludes. Suggest the user run \`/clojure-security:setup-clj-kondo\` to pull in the plugin's baseline config. Informational only — do not block on it."
fi
```

- [ ] **Step 2: Emit the payload when either tools are missing OR config is absent**

Replace the existing emit block (currently lines 111–119):

```bash
# Build the additionalContext payload only if there is something to report.
if [ -n "$MISSING" ]; then
  CONTEXT="$(printf 'clojure-security plugin — toolchain status\n\nThis is a Clojure project but some security-scanning tools are missing. Scanning that depends on them will degrade to a silent no-op until installed. Tell the user once if they ask why scanning is quiet, and otherwise carry on.\n\nMissing:\n\n%s\nAll hooks still load and run; they just skip the missing tool. To verify the full toolchain after installing, restart the session so this check re-runs.\n' "$MISSING")"

  if command -v jq >/dev/null 2>&1; then
    jq -n --arg ctx "$CONTEXT" \
      '{hookSpecificOutput: {hookEventName: "SessionStart", additionalContext: $ctx}}'
  fi
fi
```

with:

```bash
# Build the additionalContext payload if tools are missing OR no clj-kondo config.
if [ -n "$MISSING" ] || [ -n "$CLJ_KONDO_SUGGESTION" ]; then
  CONTEXT="clojure-security plugin — toolchain status"$'\n'

  if [ -n "$MISSING" ]; then
    CONTEXT="${CONTEXT}"$'\n'"This is a Clojure project but some security-scanning tools are missing. Scanning that depends on them will degrade to a silent no-op until installed. Tell the user once if they ask why scanning is quiet, and otherwise carry on."$'\n\n'"Missing:"$'\n\n'"${MISSING}"$'\n'"All hooks still load and run; they just skip the missing tool. To verify the full toolchain after installing, restart the session so this check re-runs."$'\n'
  fi

  if [ -n "$CLJ_KONDO_SUGGESTION" ]; then
    CONTEXT="${CONTEXT}"$'\n'"${CLJ_KONDO_SUGGESTION}"$'\n'
  fi

  if command -v jq >/dev/null 2>&1; then
    jq -n --arg ctx "$CONTEXT" \
      '{hookSpecificOutput: {hookEventName: "SessionStart", additionalContext: $ctx}}'
  fi
fi
```

- [ ] **Step 3: Syntax check**

Run:

```bash
bash -n plugins/clojure-security/hooks/session-start-marker.sh && echo "syntax ok"
```

Expected: `syntax ok`

- [ ] **Step 4: Manual verification — config absent triggers the nudge**

Run (requires `jq`):

```bash
T=$(mktemp -d); printf '{:deps {}}' > "$T/deps.edn"
printf '{"cwd":"%s"}' "$T" | bash plugins/clojure-security/hooks/session-start-marker.sh | jq -r '.hookSpecificOutput.additionalContext'
rm -rf "$T"
```

Expected: output contains the line starting `No clj-kondo config found in this Clojure project` and mentions `/clojure-security:setup-clj-kondo`.

- [ ] **Step 5: Manual verification — config present, no nudge**

Run:

```bash
T=$(mktemp -d); printf '{:deps {}}' > "$T/deps.edn"; mkdir -p "$T/.clj-kondo"; printf '{}' > "$T/.clj-kondo/config.edn"
OUT="$(printf '{"cwd":"%s"}' "$T" | bash plugins/clojure-security/hooks/session-start-marker.sh)"
echo "${OUT:-<empty>}" | grep -q "No clj-kondo config found" && echo "FAIL: nudge present" || echo "PASS: no clj-kondo nudge"
rm -rf "$T"
```

Expected: `PASS: no clj-kondo nudge` (the cljkondo-config line is absent; output may still carry tool-missing text if some tools are uninstalled, but never the config line).

- [ ] **Step 6: Manual verification — non-Clojure project stays silent**

Run:

```bash
T=$(mktemp -d)
OUT="$(printf '{"cwd":"%s"}' "$T" | bash plugins/clojure-security/hooks/session-start-marker.sh)"
echo "${OUT:-<empty>}"
rm -rf "$T"
```

Expected: `<empty>` (the `is_clojure_project || exit 0` guard at line 71 fires before any toolchain/config output). Note: the marker-writing section may still run if `$T` is inside a git repo, but it writes a file and prints nothing to stdout — stdout stays empty.

- [ ] **Step 7: Commit**

```bash
git add plugins/clojure-security/hooks/session-start-marker.sh
git commit -m "clojure-security: SessionStart suggests /clojure-security:setup-clj-kondo when no clj-kondo config"
```

---

### Task 3: Add the /clojure-security:setup-clj-kondo skill

**Files:**
- Create: `plugins/clojure-security/skills/setup-clj-kondo/SKILL.md`

- [ ] **Step 1: Create the skill file**

Create `plugins/clojure-security/skills/setup-clj-kondo/SKILL.md` with this content:

```markdown
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
```

- [ ] **Step 2: Verify the skill is discoverable**

Run:

```bash
test -f plugins/clojure-security/skills/setup-clj-kondo/SKILL.md && head -3 plugins/clojure-security/skills/setup-clj-kondo/SKILL.md
```

Expected: prints the frontmatter opening (`---`, `name: setup-clj-kondo`, `description:` line).

- [ ] **Step 3: Commit**

```bash
git add plugins/clojure-security/skills/setup-clj-kondo/SKILL.md
git commit -m "clojure-security: add /clojure-security:setup-clj-kondo skill"
```

---

### Task 4: Version bump, CHANGES, README

**Files:**
- Modify: `plugins/clojure-security/VERSION`
- Modify: `plugins/clojure-security/CHANGES`
- Modify: `plugins/clojure-security/README.md`

- [ ] **Step 1: Bump VERSION**

Set `plugins/clojure-security/VERSION` contents to exactly:

```
0.4.0
```

- [ ] **Step 2: Prepend a CHANGES entry**

Add this block at the top of `plugins/clojure-security/CHANGES`:

```
## 0.4.0
  * Ship a baseline clj-kondo config with the plugin and a
    `/clojure-security:setup-clj-kondo` skill to pull it into a project.
    The config is security-tuned, not skeleton-silencing: it escalates
    `:type-mismatch` and `:refer-all` to `:error` and surfaces
    `:unused-binding`, `:shadowed-var`, and `:unused-private-var` as
    `:warning` — the sloppy code where security bugs hide. Resolution
    linters (`:unresolved-*`) stay at clj-kondo defaults because the
    per-edit hook lints a single file without classpath analysis;
    `:unresolved-symbol` carries Speclj-DSL excludes only. If a
    `.clj-kondo/config.edn` already exists, the skill shows a diff and
    asks whether to overwrite, skip, or merge.
  * `SessionStart` hook now suggests running
    `/clojure-security:setup-clj-kondo` when a Clojure project has no
    `.clj-kondo/config.edn`. Informational, folded into the existing
    toolchain notice — one message per session, no nag, no blocking.

```

- [ ] **Step 3: Document in README**

In `plugins/clojure-security/README.md`, append to the existing `PostToolUse` hook bullet under `## Scope` (currently ends "...Sub-second; degrades silently if `clj-kondo` or `jq` is not installed.") so it reads:

```
- **`PostToolUse` hook (clj-kondo)** — runs against Clojure files immediately
  after Claude edits them. Surfaces lint findings before the turn completes.
  Foundation layer: catches the sloppy code where security bugs hide.
  Sub-second; degrades silently if `clj-kondo` or `jq` is not installed.
  The plugin ships a baseline clj-kondo config (security-tuned linter levels +
  Speclj resolution excludes); run `/clojure-security:setup-clj-kondo` to copy
  it into your project's `.clj-kondo/config.edn` so the per-edit lint matches
  the documented posture. The SessionStart hook suggests this when no config is
  present.
```

- [ ] **Step 4: Commit**

```bash
git add plugins/clojure-security/VERSION plugins/clojure-security/CHANGES plugins/clojure-security/README.md
git commit -m "clojure-security: clj-kondo config + setup skill (v0.4.0)"
```

- [ ] **Step 5: Push**

```bash
git push origin master
```

(If rejected because the CI version-sync commit landed first: `git pull --rebase origin master` then push again. Do NOT manually edit `plugin.json` / `marketplace.json` / `package.json` / `index.ts` — CI syncs them per repo CLAUDE.md.)

---

## Self-Review

**Spec coverage:**
- Bundled clj-kondo config (adapted from jig, header swapped, acme.* dropped, security linters escalated, `:unresolved-*` left at defaults) → Task 1. ✓
- `/clojure-security:setup-clj-kondo` skill, absent→copy, present→diff+overwrite/skip/merge → Task 3. ✓
- SessionStart nudge, stateless, `.clj-kondo/config.edn` check, folded into one payload, informational → Task 2. ✓
- Core constraint honored: no escalation of `:unresolved-*` → Task 1 Step 1 leaves them out; only `:unresolved-symbol` excludes. ✓
- jq-present branch / non-Clojure guard preserved → Task 2 Step 2 keeps the jq branch; Step 6 verifies guard. ✓
- Version / CHANGES / README / CI → Task 4. ✓

**Placeholder scan:** No TBD/TODO. Exact config content, exact hook old/new strings, exact skill body, exact CHANGES + README text. clj-kondo validation uses the installed v2026.04.15.

**Type/name consistency:** Skill name `setup-clj-kondo` and invocation `/clojure-security:setup-clj-kondo` consistent across Tasks 2, 3, 4. Variable `CLJ_KONDO_SUGGESTION` defined (Task 2 Step 1) and used (Task 2 Step 2) consistently. Bundle path `plugins/clojure-security/clj-kondo.edn`; target `.clj-kondo/config.edn` consistent throughout. Version `0.4.0` consistent (VERSION, CHANGES, README commit, push note).
