# clojure plugin cljfmt config + setup skill — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a baseline `cljfmt.edn` with the `clojure` plugin, a `/clojure:setup-cljfmt` skill to pull it into a project, and a SessionStart suggestion when a Clojure project has no cljfmt config.

**Architecture:** Bundle the config at the plugin root. A user-invoked skill copies it into the project (diff + prompt if one already exists). The existing SessionStart toolcheck hook gains a stateless, informational nudge pointing at the skill when no cljfmt config file is present.

**Tech Stack:** Bash 3.2 (macOS), `jq`, `cljfmt`, Claude Code plugin skills (Markdown), `${CLAUDE_PLUGIN_ROOT}`.

**Note on testing:** Bash hooks in this repo have no automated harness (consistent with existing hooks). "Tests" here are manual temp-repo verifications with exact commands and expected output. The skill is prose — no automated test.

---

### Task 1: Bundle the baseline cljfmt.edn

**Files:**
- Create: `plugins/clojure/cljfmt.edn`

- [ ] **Step 1: Create the bundled config**

Create `plugins/clojure/cljfmt.edn` with exactly this content (the c3kit-jig
template's `:extra-indents` verbatim; scaffolder-specific header replaced with a
plugin note):

```clojure
;; Baseline cljfmt config shipped by the `clojure` plugin.
;;
;; The plugin's PostToolUse hook runs `cljfmt fix` after every Clojure edit.
;; cljfmt auto-discovers this file when it sits in the project root, so copying
;; it in makes auto-formatting match the Speclj / Reagent / c3kit indentation
;; the plugin's skills assume. Pull it into a project with `/clojure:setup-cljfmt`.
;;
;; :extra-indents register block-style indentation so cljfmt does not align
;; bodies under the first argument (which would fight the 2-space body
;; indentation used throughout).
;;
;; Speclj test macros (describe/context/it/etc.) indent their bodies like defn.
;; c3kit.apron.corec/for-all is a comprehension macro shaped like for.
;; reagent.core/with-let is a binding macro shaped like let. Both bare and
;; fully-qualified forms are registered so the rule fires regardless of how the
;; caller aliases the namespace.
{:extra-indents
 {describe                  [[:block 1]]
  context                   [[:block 1]]
  it                        [[:block 1]]
  xit                       [[:block 1]]
  before                    [[:block 0]]
  before-all                [[:block 0]]
  after                     [[:block 0]]
  after-all                 [[:block 0]]
  around                    [[:block 1]]
  with                      [[:block 1]]
  with-all                  [[:block 1]]
  redefs-around             [[:block 1]]
  it-routes                 [[:block 2]]
  for-all                   [[:block 1]]
  c3kit.apron.corec/for-all [[:block 1]]
  with-let                  [[:block 1]]
  reagent.core/with-let     [[:block 1]]}}
```

- [ ] **Step 2: Verify it is valid EDN that cljfmt accepts**

Run (skip gracefully if `cljfmt` not installed):

```bash
cljfmt check plugins/clojure/cljfmt.edn --config plugins/clojure/cljfmt.edn 2>&1 || echo "cljfmt not installed — skip"
```

Expected: no parse error (either "files formatted correctly"/no output, or the
"cljfmt not installed — skip" line). A Clojure/EDN parse error is a FAIL.

- [ ] **Step 3: Commit**

```bash
git add plugins/clojure/cljfmt.edn
git commit -m "clojure: bundle baseline cljfmt.edn"
```

---

### Task 2: Add the SessionStart cljfmt-config nudge

**Files:**
- Modify: `plugins/clojure/hooks/session-start-toolcheck.sh`

The current hook builds a `MISSING` string of missing tools and emits an
`additionalContext` payload only if `MISSING` is non-empty (see lines 36–65).
This task adds a separate, independent suggestion when no cljfmt config exists,
folded into the same single payload.

- [ ] **Step 1: Add the config detection + suggestion text**

In `plugins/clojure/hooks/session-start-toolcheck.sh`, immediately after the
`note_missing "cljfmt" ...` block (currently ending at line 48, before the
`if [ -n "$MISSING" ]` block at line 50), insert:

```bash
# Suggest pulling in the plugin's cljfmt config if the project has none.
# cljfmt auto-discovers cljfmt.edn / .cljfmt.edn / .cljfmt from the root;
# without one it formats with defaults that omit this plugin's indent rules.
CLJFMT_SUGGESTION=""
if [ ! -f "$CWD/cljfmt.edn" ] && [ ! -f "$CWD/.cljfmt.edn" ] && [ ! -f "$CWD/.cljfmt" ]; then
  CLJFMT_SUGGESTION="No cljfmt config found in this Clojure project. The cljfmt-postedit hook will format with cljfmt defaults, which omit the Speclj / Reagent indent rules this plugin's style assumes. Suggest the user run \`/clojure:setup-cljfmt\` to pull in the plugin's baseline cljfmt.edn. Informational only — do not block on it."
fi
```

- [ ] **Step 2: Emit the payload when either tools are missing OR config is absent**

Replace the existing emit block (currently lines 50–65):

```bash
if [ -n "$MISSING" ]; then
  CONTEXT="$(printf 'clojure plugin — toolchain status\n\nThis is a Clojure project but some tools the clojure plugin'\''s hooks rely on are missing. Hooks that depend on them are degrading to a silent no-op until installed. Tell the user once if they ask why formatting is not running, and otherwise carry on.\n\nMissing:\n\n%s\nThe PostToolUse cljfmt hook will resume working automatically once the missing tools are installed. Restart the session to re-check.\n' "$MISSING")"

  if command -v jq >/dev/null 2>&1; then
    jq -n --arg ctx "$CONTEXT" \
      '{hookSpecificOutput: {hookEventName: "SessionStart", additionalContext: $ctx}}'
  else
    # Bare-minimum fallback when jq itself is the missing tool: emit raw
    # text on stderr so the user at least sees something.
    {
      echo "clojure plugin: \`jq\` is not installed."
      echo "The plugin's hooks cannot parse input without it; they are running as no-ops."
      echo "Install with \`brew install jq\` and restart the session."
    } >&2
  fi
fi
```

with:

```bash
if [ -n "$MISSING" ] || [ -n "$CLJFMT_SUGGESTION" ]; then
  CONTEXT="clojure plugin — toolchain status"$'\n'

  if [ -n "$MISSING" ]; then
    CONTEXT="${CONTEXT}"$'\n'"This is a Clojure project but some tools the clojure plugin's hooks rely on are missing. Hooks that depend on them are degrading to a silent no-op until installed. Tell the user once if they ask why formatting is not running, and otherwise carry on."$'\n\n'"Missing:"$'\n\n'"${MISSING}"$'\n'"The PostToolUse cljfmt hook will resume working automatically once the missing tools are installed. Restart the session to re-check."$'\n'
  fi

  if [ -n "$CLJFMT_SUGGESTION" ]; then
    CONTEXT="${CONTEXT}"$'\n'"${CLJFMT_SUGGESTION}"$'\n'
  fi

  if command -v jq >/dev/null 2>&1; then
    jq -n --arg ctx "$CONTEXT" \
      '{hookSpecificOutput: {hookEventName: "SessionStart", additionalContext: $ctx}}'
  else
    # Bare-minimum fallback when jq itself is the missing tool: emit raw
    # text on stderr so the user at least sees something.
    {
      echo "clojure plugin: \`jq\` is not installed."
      echo "The plugin's hooks cannot parse input without it; they are running as no-ops."
      echo "Install with \`brew install jq\` and restart the session."
    } >&2
  fi
fi
```

- [ ] **Step 3: Syntax check**

Run:

```bash
bash -n plugins/clojure/hooks/session-start-toolcheck.sh && echo "syntax ok"
```

Expected: `syntax ok`

- [ ] **Step 4: Manual verification — config absent triggers the nudge**

Run (requires `jq`):

```bash
T=$(mktemp -d); printf '{:deps {}}' > "$T/deps.edn"
printf '{"cwd":"%s"}' "$T" | bash plugins/clojure/hooks/session-start-toolcheck.sh | jq -r '.hookSpecificOutput.additionalContext'
rm -rf "$T"
```

Expected: output contains the line starting `No cljfmt config found in this Clojure project.` and mentions `/clojure:setup-cljfmt`.

- [ ] **Step 5: Manual verification — config present, no nudge**

Run:

```bash
T=$(mktemp -d); printf '{:deps {}}' > "$T/deps.edn"; printf '{}' > "$T/cljfmt.edn"
OUT="$(printf '{"cwd":"%s"}' "$T" | bash plugins/clojure/hooks/session-start-toolcheck.sh)"
echo "${OUT:-<empty>}" | grep -q "No cljfmt config found" && echo "FAIL: nudge present" || echo "PASS: no cljfmt nudge"
rm -rf "$T"
```

Expected: `PASS: no cljfmt nudge` (output is empty when cljfmt + jq are installed and config present; or contains only tool-missing text otherwise — but never the cljfmt-config line).

- [ ] **Step 6: Manual verification — non-Clojure project stays silent**

Run:

```bash
T=$(mktemp -d)
OUT="$(printf '{"cwd":"%s"}' "$T" | bash plugins/clojure/hooks/session-start-toolcheck.sh)"
echo "${OUT:-<empty>}"
rm -rf "$T"
```

Expected: `<empty>` (the `is_clojure_project || exit 0` guard fires before any output).

- [ ] **Step 7: Commit**

```bash
git add plugins/clojure/hooks/session-start-toolcheck.sh
git commit -m "clojure: SessionStart suggests /clojure:setup-cljfmt when no cljfmt config"
```

---

### Task 3: Add the /clojure:setup-cljfmt skill

**Files:**
- Create: `plugins/clojure/skills/setup-cljfmt/SKILL.md`

- [ ] **Step 1: Create the skill file**

Create `plugins/clojure/skills/setup-cljfmt/SKILL.md` with this content:

```markdown
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
```

- [ ] **Step 2: Verify the skill is discoverable**

Run:

```bash
test -f plugins/clojure/skills/setup-cljfmt/SKILL.md && head -3 plugins/clojure/skills/setup-cljfmt/SKILL.md
```

Expected: prints the frontmatter opening (`---`, `name: setup-cljfmt`, `description:` line).

- [ ] **Step 3: Commit**

```bash
git add plugins/clojure/skills/setup-cljfmt/SKILL.md
git commit -m "clojure: add /clojure:setup-cljfmt skill"
```

---

### Task 4: Version bump, CHANGES, README

**Files:**
- Modify: `plugins/clojure/VERSION`
- Modify: `plugins/clojure/CHANGES`
- Modify: `plugins/clojure/README.md`

- [ ] **Step 1: Bump VERSION**

Set `plugins/clojure/VERSION` contents to exactly:

```
1.10.0
```

- [ ] **Step 2: Prepend a CHANGES entry**

Add this block at the top of `plugins/clojure/CHANGES`:

```
## 1.10.0
  * Ship a baseline `cljfmt.edn` with the plugin and a
    `/clojure:setup-cljfmt` skill to pull it into a project. The config
    carries the Speclj / Reagent / c3kit `:extra-indents` the plugin's
    cljfmt-postedit hook needs so auto-format matches the documented
    style instead of cljfmt defaults. If a `cljfmt.edn` already exists,
    the skill shows a diff and asks whether to overwrite, skip, or merge.
  * `SessionStart` hook now suggests running `/clojure:setup-cljfmt`
    when a Clojure project has no cljfmt config (`cljfmt.edn`,
    `.cljfmt.edn`, or `.cljfmt`). Informational, folded into the existing
    toolchain notice — one message per session, no nag, no blocking.

```

- [ ] **Step 3: Document in README**

In `plugins/clojure/README.md`, add a mention of the bundled config and the
`/clojure:setup-cljfmt` skill near the description of the cljfmt-postedit hook.
Read the file first to match its existing structure, then add a concise bullet
or sentence such as:

> The plugin ships a baseline `cljfmt.edn` (Speclj / Reagent / c3kit indent
> rules). Run `/clojure:setup-cljfmt` to copy it into your project so the
> auto-format hook matches the documented style; the SessionStart hook suggests
> this when no cljfmt config is present.

- [ ] **Step 4: Commit**

```bash
git add plugins/clojure/VERSION plugins/clojure/CHANGES plugins/clojure/README.md
git commit -m "clojure: cljfmt config + setup skill (v1.10.0)"
```

- [ ] **Step 5: Push**

```bash
git push origin master
```

(If rejected because the CI version-sync commit landed first: `git pull --rebase origin master` then push again. Do NOT manually edit `plugin.json` / `marketplace.json` / `package.json` — CI syncs them per repo CLAUDE.md.)

---

## Self-Review

**Spec coverage:**
- Bundled `cljfmt.edn` (verbatim, header swapped) → Task 1. ✓
- `/clojure:setup-cljfmt` skill, absent→copy, present→diff+overwrite/skip/merge → Task 3. ✓
- SessionStart nudge, stateless, three filename check, folded into one payload, informational → Task 2. ✓
- jq-absent fallback preserved → Task 2 Step 2 keeps the `else` branch. ✓
- Non-Clojure guard → Task 2 Step 6 verifies. ✓
- Version/CHANGES/README/CI → Task 4. ✓

**Placeholder scan:** No TBD/TODO. README step (Task 4 Step 3) gives exact suggested text plus "read first to match structure" — acceptable since README layout is not yet in context; the content to add is concrete.

**Type/name consistency:** Skill name `setup-cljfmt` and invocation `/clojure:setup-cljfmt` consistent across Tasks 2, 3, 4. Variable `CLJFMT_SUGGESTION` defined and used consistently in Task 2. Config filename `cljfmt.edn` consistent throughout.
