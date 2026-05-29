# clojure-security plugin — clj-kondo config + setup skill — Design

**Goal:** Ship a baseline `.clj-kondo/config.edn` with the `clojure-security`
plugin, a `/clojure-security:setup-clj-kondo` skill to pull it into a project,
and a SessionStart suggestion when a Clojure project has no clj-kondo config.

**Architecture:** Mirrors the `clojure` plugin's cljfmt feature. Bundle a single
config source at the plugin root. A user-invoked skill copies it into the
project's `.clj-kondo/config.edn` (diff + prompt if one already exists). The
existing SessionStart marker hook gains a stateless, informational nudge
pointing at the skill when no clj-kondo config is present.

**Tech Stack:** Bash 3.2 (macOS), `jq`, `clj-kondo`, Claude Code plugin skills
(Markdown), `${CLAUDE_PLUGIN_ROOT}`.

---

## The core constraint: per-edit lint runs WITHOUT classpath

`plugins/clojure-security/hooks/clj-kondo-postedit.sh` runs
`clj-kondo --lint <single-file>` with no `--dependencies` flag and no guaranteed
populated cache. clj-kondo's resolution linters —
`:unresolved-symbol`, `:unresolved-var`, `:unresolved-namespace` — **require
classpath/cache analysis** to work. Without it they false-positive on nearly
every cross-namespace reference. This is precisely why the c3kit-jig config
turned them `:off`.

Consequence for "adapt + escalate":

- **Single-file-safe linters** (resolve within one file in isolation) → safe to
  escalate. The hook surfaces/blocks on them reliably.
- **Classpath-dependent linters** (`:unresolved-*`) → MUST NOT escalate. Keep at
  clj-kondo defaults *with the speclj/c3kit macro excludes* so they don't
  false-flag known macros. Escalating one to `:error` would make every edit
  block (hook exits 2) on false positives, rendering the hook unusable.

This constraint is non-negotiable and shapes the config content in Section 2.

---

## Section 1 — Architecture

Three pieces, parallel to the cljfmt feature:

1. **Bundle** — `plugins/clojure-security/clj-kondo.edn` at the plugin root
   (single source file; the canonical *project* location is
   `.clj-kondo/config.edn`, so the bundle filename and target filename differ).

2. **Skill** — `/clojure-security:setup-clj-kondo` copies the bundle into the
   project's `.clj-kondo/config.edn`. If one exists: diff + overwrite / skip /
   merge prompt.

3. **SessionStart nudge** — in `session-start-marker.sh`, when in a Clojure
   project AND no `.clj-kondo/config.edn` exists, suggest the skill. Folded into
   the existing toolchain `MISSING` payload, informational, one message per
   session, no block.

---

## Section 2 — Bundled config content (adapt + escalate)

Source of record adapted from `c3kit-jig/clj-kondo.edn`. Header swapped for a
plugin note explaining the postedit-hook relationship.

**Keep from jig (generalizable):**

- `:lint-as` — `c3kit.apron.corec/for-all` → `clojure.core/for`,
  `speclj.core/with` / `speclj.core/with-all` → `clojure.core/def`. Drop
  garden `defstyles` (project-specific).
- `:refer-all {:level :error}` — security-relevant: no `:refer :all`, every
  refer explicit.
- `:unresolved-symbol {:exclude [...]}` — keep ONLY the generic speclj DSL list
  (structure macros: `describe context it xit before before-all after after-all
  around around-all with with-all focus-* tags pending`; assertions: the
  `should*` family; stubs: `stub with-stubs redefs-around`). **Drop** project
  bits: `it-routes`, `capture-logs`, `should-be-ajax-*`, `should-select`,
  secretary route params, all `acme.*`.

**Drop entirely (scaffold-specific):**

- `:unresolved-namespace {:exclude [acme.*]}` — lazy-route namespaces; will not
  generalize.
- The blanket `:off` on `:unused-binding`, `:unused-value`, `:unused-import`,
  `:unresolved-var` — these were skeleton-silencers that hide exactly the sloppy
  code where bugs live.

**Escalate (single-file-safe only) — recommended levels:**

| Linter | Level | Rationale |
|--------|-------|-----------|
| `:type-mismatch` | `:error` | Real type confusion; genuine correctness bug. Blocking warranted. |
| `:refer-all` | `:error` | Security posture: explicit refers only. |
| `:unused-binding` | `:warning` | Hides bugs (typo'd binding never used) but not itself a defect. Non-blocking. |
| `:shadowed-var` | `:warning` | Shadowing core/locals masks bugs; surface but don't block. |
| `:unused-private-var` | `:warning` | Dead private code; hygiene signal. |

Levels finalized during plan-writing; the table above is the committed
recommendation (`:error` = genuine correctness/security defect → blocking
exit 2; `:warning` = hygiene that hides bugs → non-blocking exit 1).

**Leave at clj-kondo defaults (with macro excludes only):**
`:unresolved-var`, `:unresolved-namespace`, `:unresolved-symbol` — classpath-
dependent; escalation breaks the per-edit hook (see core constraint).

---

## Section 3 — SessionStart nudge + hook interaction

Two edits to `plugins/clojure-security/hooks/session-start-marker.sh`:

1. **Detection.** After the `note_missing` block, add a `CLJ_KONDO_SUGGESTION`
   string set when the project has no clj-kondo config:
   `[ ! -f "$CWD/.clj-kondo/config.edn" ]` (clj-kondo's canonical project
   config path). Text points the user at `/clojure-security:setup-clj-kondo`,
   marked informational / non-blocking.

2. **Emit gate.** The current payload emits only when `MISSING` is non-empty.
   Change the gate to `[ -n "$MISSING" ] || [ -n "$CLJ_KONDO_SUGGESTION" ]` and
   append the suggestion to `CONTEXT` so the nudge shows even when the toolchain
   is complete. Single payload, preserve the existing jq-present branch.

**Hook interaction:** once `.clj-kondo/config.edn` is installed,
`clj-kondo-postedit.sh` picks it up automatically — clj-kondo merges the
auto-discovered project config with the hook's inline
`--config '{:output {:format :json}}'` (merge, not replace). Escalated levels
take effect on the next edit: the postedit hook begins blocking (exit 2) on
`:error` findings and warning (exit 1) on `:warning` findings. Intended.

---

## Section 4 — Skill

Create `plugins/clojure-security/skills/setup-clj-kondo/SKILL.md`. Flow mirrors
`setup-cljfmt`:

1. Read the bundle at `${CLAUDE_PLUGIN_ROOT}/clj-kondo.edn`.
2. Target is `.clj-kondo/config.edn` in the project root; `mkdir -p .clj-kondo`
   if the directory is absent.
3. **Target absent** → write the bundle. Tell the user the file was created and
   the postedit hook will use these rules on the next edit.
4. **Target exists** → do NOT overwrite silently. Show a diff between existing
   and bundle, then prompt: **Overwrite** / **Skip** / **Merge manually** (add
   missing `:lint-as` / `:linters` entries from the bundle, preserve the
   project's own settings). Act on the choice.
5. Suggest committing `.clj-kondo/config.edn` so teammates and CI lint the same
   way.

---

## Section 5 — Version, CHANGES, README

- `plugins/clojure-security/VERSION`: `0.3.2` → `0.4.0` (new feature).
- `plugins/clojure-security/CHANGES`: prepend a `## 0.4.0` entry describing the
  bundled config, the setup skill, and the SessionStart nudge.
- `plugins/clojure-security/README.md`: mention the bundled config + skill near
  the clj-kondo-postedit hook description (read first to match structure).
- Push to `master`. CI (`build-plugins.yml`) syncs `plugin.json`,
  `marketplace.json`, `package.json`, `index.ts` from `VERSION` and tags
  `clojure-security/v0.4.0`. Do NOT edit those files manually (repo CLAUDE.md).

---

## Self-Review

**Spec coverage:**
- Bundled `.clj-kondo/config.edn` (adapted from jig, header swapped, acme.*
  dropped, security linters escalated) → Section 2. ✓
- `/clojure-security:setup-clj-kondo` skill, absent→copy, present→diff+
  overwrite/skip/merge → Section 4. ✓
- SessionStart nudge, stateless, `.clj-kondo/config.edn` check, folded into one
  payload, informational → Section 3. ✓
- Per-edit hook classpath constraint honored (no escalation of `:unresolved-*`)
  → Core constraint + Section 2. ✓
- jq-absent fallback / non-Clojure guard preserved (existing hook behavior
  untouched outside the gate change) → Section 3. ✓
- Version / CHANGES / README / CI → Section 5. ✓

**Placeholder scan:** No TBD/TODO. Exact linter→level table committed; exact
excludes enumerated. README step gives "read first to match structure" —
acceptable, layout not yet in context.

**Type/name consistency:** Skill name `setup-clj-kondo` and invocation
`/clojure-security:setup-clj-kondo` consistent across Sections 1, 3, 4, 5.
Bundle path `plugins/clojure-security/clj-kondo.edn`; target
`.clj-kondo/config.edn` consistent throughout. Variable `CLJ_KONDO_SUGGESTION`
defined and used in Section 3.

**Ambiguity check:** Bundle filename (`clj-kondo.edn`) vs target filename
(`.clj-kondo/config.edn`) differ by design — called out in Section 1 to prevent
misread.
