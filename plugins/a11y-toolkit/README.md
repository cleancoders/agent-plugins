# a11y-toolkit

A Claude Code plugin for accessible web development, distributed via the
`cleancoders/agent-plugins` marketplace.

## What it is

a11y-toolkit is an accessibility toolkit for **WCAG 2.2 Level AA**, built to be
**framework-agnostic** for HTML/CSS/JS UI — it works the same whether the markup comes
from plain HTML, React, Vue, Svelte, or Clojure Hiccup, because the checks that matter
most (structure, contrast, keyboard behavior, ARIA) are verified against what actually
renders in the browser. It has two verification moments: a skill that nudges toward
accessible choices *while you're writing* markup and styles, and an agent/command pair
that *audits* a file, folder, or running page after the fact and returns a
severity-ranked findings report.

## What's inside

- **Skill — `accessible-authoring`** (`skills/accessible-authoring/SKILL.md`): auto-fires
  while you're authoring or reviewing HTML/CSS/JS, and routes to six reference files
  (design-time checklist, dev-time checklist, ARIA widget patterns, cognitive/plain-language
  heuristics, a WCAG 2.2 AA criterion map, and external resources).
- **Agent — `a11y-auditor`** (`agents/a11y-auditor.md`): audits a target — source file,
  folder, or a reachable URL — with a static pass plus live Chrome DevTools MCP checks
  (keyboard nav, focus order, computed contrast, accessibility-tree snapshot, 320px reflow,
  target size), and returns a structured, severity-ranked report.
- **Command — `/a11y-review [file | folder | URL]`** (`commands/a11y-review.md`): the
  user-facing entry point to the auditor. Run bare (`/a11y-review` with no argument) and it
  smart-detects a target — a running localhost dev server, the file you're already working
  in, or, as a last resort, asks — then dispatches the agent and offers to save the report
  to a file afterward.

## Requirements

The skill and the static half of the audit work with no setup. The **live browser checks
require the Chrome DevTools MCP server**, installed as the `chrome-devtools-mcp` plugin:

```
/plugin install chrome-devtools-mcp@claude-plugins-official
```

The auditor's `tools:` list names those MCP tools in the form
`mcp__plugin_chrome-devtools-mcp_chrome-devtools__*`, which is the naming Claude Code
produces for a *plugin-provided* MCP server. If you instead wire Chrome DevTools up
directly in `.mcp.json`, the tools resolve under a different prefix, the auditor won't
match them, and every audit will quietly run static-only. It degrades honestly — the report
declares its run mode and lists the skipped checks under "What was NOT checked" — but you
will not get keyboard, focus-order, live-contrast, reflow, or target-size coverage. Install
via the plugin.

## Install

Add the Clean Coders marketplace, then install the plugin:

```
/plugin marketplace add cleancoders/agent-plugins
/plugin install a11y-toolkit@cleancoders-agent-plugins
```

To enable it for everyone on a project instead, see **Team-Wide Configuration** in the
[marketplace repo README](../../README.md).

Start a new Claude Code session, then confirm it loaded with `claude plugin list` — you
should see `a11y-toolkit@cleancoders-agent-plugins` with status `✔ loaded`. From there:
- the `accessible-authoring` skill activates automatically based on what you're doing —
  no invocation needed;
- the `a11y-auditor` agent is available for the `/a11y-review` command to dispatch;
- `/a11y-review` is registered as a slash command.

### Local development

To work on the plugin from a checkout instead of the published copy, add your local clone of
the marketplace repo as a marketplace — `marketplace add` accepts a filesystem path, not just
a GitHub repo — and install from it:

```
/plugin marketplace add /path/to/agent-plugins
/plugin install a11y-toolkit@cleancoders-agent-plugins
```

Edits to the checkout then take effect on the next session, with no push or CI round-trip.
This also exercises the real `marketplace.json` and `plugin.json` resolution that published
users get, so manifest mistakes surface locally instead of after a release.

Marketplaces are registered by the `name` in `marketplace.json`, and a local clone declares
the same `cleancoders-agent-plugins` name as the GitHub source — so remove the existing
registration before adding the clone, and restore it afterward:

```
/plugin marketplace remove cleancoders-agent-plugins
/plugin marketplace add cleancoders/agent-plugins
```

## When each piece fires

- **The skill fires on its own** while you're writing or reviewing HTML/CSS/JS — semantic
  markup, forms, custom widgets, focus states, color/contrast, ARIA, motion. You don't call
  it directly; it's there in the background nudging toward the accessible choice as you go.
- **Run `/a11y-review [target]`** when you want to check something that already
  exists — a finished file, a folder, or a running page — rather than something you're
  actively writing. The skill doesn't audit; it authors. The command/agent is what audits.

## How to read a report

Reports always come in this order — read top to bottom:

1. **Summary scorecard** — run mode (static-only vs. full live audit), the target, and
   finding counts by severity. The three-second read.
2. **Prioritized fix order** — a short "fix these first" list drawn from the
   Blocker/Serious findings.
3. **Findings**, grouped by severity (Blocker / Serious / Moderate / Minor), each with:
   - **Severity**
   - **Confidence** — ❌ **Confirmed failure** (a machine can verify this) vs. 👀
     **Verify manually** (a machine can flag it but a human has to judge it — e.g. whether
     an `alt` is actually meaningful)
   - **WCAG criterion** (e.g. 1.4.3)
   - **Location** — file + line, or DOM selector
   - **Why it fails** — one sentence
   - **Fix** — a concrete before → after code snippet
4. **What was NOT checked** — an explicit list of skipped or out-of-reach checks (e.g. "ran
   static-only → keyboard, focus order, and live contrast not tested"). This section is
   always present, even when nothing was skipped, so a partial pass never reads as a clean
   bill of health.
5. **What passed** — a brief positive confirmation of what checked out cleanly, so the
   report doesn't read as just a wall of failures.
6. **Disclaimer** — a standing note that the report is not a certification of conformance
   and not legal advice. Present on every report, including clean ones.

## Limitations and disclaimer

Automated and static checks catch only part of real WCAG issues — roughly half, by
reputation. The rest need human judgment. Where the auditor inspects the accessibility
tree (e.g. via Chrome DevTools), that tree *approximates* what a screen reader would
announce — it is **not** the same as testing with a real screen reader. Treat a clean
report as a strong starting point, not proof: for anything critical, do a real NVDA or
VoiceOver spot-check before calling a page accessible.

a11y-toolkit is provided as-is, without warranty. Its output does not constitute a
certification of conformance with WCAG, the ADA, Section 508, or any other standard or law,
and is not legal advice.

## Scope & non-goals

**In scope:** WCAG 2.2 Level AA, framework-agnostic HTML/CSS/JS (whatever the source
framework, checks run against the rendered DOM). Cognitive accessibility / plain language
**is** in scope, scoped to measurable heuristics (sentence length, unexpanded abbreviations,
passive-voice density, reading level reported as FYI only) plus the relevant AA/A criteria
— subjective clarity is always flagged for manual verification, never auto-failed.

**Non-goals (deliberately excluded from v1):**
- Video captions, transcripts, or audio description — real WCAG requirements, but a
  content-production workflow rather than a code check; treated as human responsibility.
- PDF / document accessibility — different tooling entirely.
- A formal automated test suite for the toolkit itself — validated instead against the
  clean/broken sample pages in `samples/`.

## Versioning

`VERSION` and `CHANGES` are the source of truth; every other version field is derived from
them by CI, so don't hand-edit the `version` in any JSON file. See the marketplace repo's
`CLAUDE.md` for the release process.
