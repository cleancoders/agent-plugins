# Clean Coders Agent Plugins

A Claude Code plugin marketplace providing tools for AI agents.

## Installation

Add this marketplace to Claude Code:

```
/plugin marketplace add cleancoders/agent-plugins
```

Then install individual plugins:

```
/plugin install kanban-dashboard@cleancoders-agent-plugins
/plugin install clojure@cleancoders-agent-plugins
/plugin install a11y-toolkit@cleancoders-agent-plugins
```

### Team-Wide Configuration

To enable plugins for all team members on a project, add to `.claude/settings.json`:

```json
{
  "extraKnownMarketplaces": {
    "cleancoders-agent-plugins": {
      "source": {
        "source": "github",
        "repo": "cleancoders/agent-plugins"
      }
    }
  },
  "enabledPlugins": {
    "kanban-dashboard@cleancoders-agent-plugins": true
  }
}
```

## Plugins

### [kanban-dashboard](plugins/kanban-dashboard/)

Live KanBan dashboard for monitoring Claude Code agent teams in real-time. Provides an MCP server with 5 tools that agents call to report progress, and an embedded HTTP server that serves a browser-based dashboard with automatic polling.

**MCP Tools:** `kanban_init`, `kanban_add_task`, `kanban_update_task`, `kanban_log`, `kanban_stop`

**Features:**
- 4-column Kanban board (Blocked / Ready / In Progress / Done)
- Real-time agent status bar and activity log
- Task dependency tracking with automatic unblocking
- File diff viewer with git integration
- Task detail modals with subtask progress and dependency visualization
- Completion banner with elapsed time

### [clojure](plugins/clojure/)

Clojure / ClojureScript skills for the cleancoders stack: c3kit (bucket, apron, wire), Reagent, Speclj, and cleancoders forms.

**Skills:** `creating-pages`, `writing-migrations`, `using-forms`, `writing-tests`, `writing-reagent-components`, `using-c3kit-bucket`

Invoke as `/clojure:<skill>` (e.g. `/clojure:writing-tests`).

### [a11y-toolkit](plugins/a11y-toolkit/)

Accessibility toolkit for **WCAG 2.2 Level AA**, framework-agnostic across HTML/CSS/JS — the
checks that matter most (structure, contrast, keyboard behavior, ARIA) run against what
actually renders, so it works the same for plain HTML, React, Vue, Svelte, or Clojure Hiccup.
It covers two moments: authoring and auditing.

**Skill:** `accessible-authoring` — fires automatically while you write or review
HTML/CSS/JS, routing to references for design-time and dev-time checklists, ARIA widget
patterns, cognitive/plain-language heuristics, and a WCAG 2.2 AA criterion map. No
invocation needed.

**Agent:** `a11y-auditor` — audits a source file, folder, or reachable URL with a static
pass plus live Chrome DevTools MCP checks (keyboard nav, focus order, computed contrast,
accessibility-tree snapshot, 320px reflow, target size).

**Command:** `/a11y-review [file | folder | URL]` — the entry point to the auditor. Run bare
and it smart-detects a target (a running localhost dev server, or the file you're in), then
returns a severity-ranked report: summary scorecard, prioritized fix order, findings with
WCAG criterion and before → after fixes, an explicit "what was NOT checked" list, and what
passed.

**Requires** the Chrome DevTools MCP server for the live browser checks, installed as a
plugin so the tool names resolve:

```
/plugin install chrome-devtools-mcp@claude-plugins-official
```

Without it, audits degrade to static-only and say so in the report — but you lose keyboard,
focus-order, live-contrast, reflow, and target-size coverage.

Automated checks catch only part of real WCAG issues; reports are a starting point, not a
certification of conformance. See [the plugin README](plugins/a11y-toolkit/README.md) for
the full limitations and disclaimer.

## Adding to CLAUDE.md

To have agents use the dashboard automatically during team work, add to your project's `CLAUDE.md`:

```
When creating agent teams, use the kanban-dashboard MCP tools
(kanban_init, kanban_update_task, kanban_log, kanban_stop)
to provide a live dashboard for monitoring progress.
```

## Adding New Plugins

1. Create a directory under `plugins/<name>/` with a `plugin.json` manifest and implementation
2. Add an entry to `.claude-plugin/marketplace.json`
3. Commit and push — users with the marketplace installed get the new plugin on next sync
