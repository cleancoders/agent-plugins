# Clean Coders Agent Plugins

A Claude Code plugin marketplace providing tools for AI agent teams.

## Installation

Add this marketplace to Claude Code:

```
/plugin marketplace add AlexRoot-Roatch/cleancoders-agent-plugins
```

Then install individual plugins:

```
/plugin install kanban-dashboard@cleancoders-agent-plugins
```

### Team-Wide Configuration

To enable plugins for all team members on a project, add to `.claude/settings.json`:

```json
{
  "extraKnownMarketplaces": {
    "cleancoders-agent-plugins": {
      "source": {
        "source": "github",
        "repo": "AlexRoot-Roatch/cleancoders-agent-plugins"
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
