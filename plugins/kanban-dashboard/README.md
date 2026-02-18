# kanban-dashboard

Live KanBan dashboard MCP server for Claude Code agent teams. Agents call MCP tools to report task progress, and a browser-based dashboard updates in real-time via polling.

## Architecture

```
Claude Code (Client)
    |
    |-- stdio JSON-RPC
    |
MCP Server (Node.js)
    |-- Tool Handlers (5 MCP tools)
    |-- In-Memory State (tasks, logs, config)
    |-- Embedded HTTP Server (auto-assigned port)
         |-- GET /              index.html
         |-- GET /api/status    task state JSON
         |-- GET /api/log       activity log JSON
         |-- GET /api/files     git diff --name-status
         |-- GET /api/diff      unified diff for a file
         |-- GET /css/*, /js/*  static assets

Browser
    |-- Polls /api/status every 1.5s
    |-- Polls /api/log every 3s
    |-- Updates elapsed timer every 1s
```

The MCP server and HTTP server run in a single Node.js process. State is entirely in-memory — no files written to disk.

## MCP Tools

### kanban_init

Initialize the dashboard with a title and task list. Starts the HTTP server and opens a browser.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| title | string | yes | | Dashboard title |
| subtitle | string | no | `""` | Dashboard subtitle |
| tasks | Task[] | yes | | Initial task list |
| port | number | no | `0` | Server port (0 = auto-assign) |
| open_browser | boolean | no | `true` | Open browser on start |
| project_dir | string | no | | Git repo path for file diffs |

Returns `{ url, port }`.

### kanban_add_task

Add a single task to the dashboard after initialization.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| id | number | yes | | Unique task ID |
| title | string | yes | | Task title |
| agent | string | yes | | Agent name |
| agent_color | string | no | auto | Agent color (hex) |
| status | string | no | `"ready"` | blocked / ready / in_progress / done |
| message | string | no | `""` | Status message |
| progress | number | no | `0` | 0.0 to 1.0 |
| files | string[] | no | | Associated file paths |
| subtasks | string[] | no | | Subtask descriptions |
| blocked_by | number[] | no | | IDs of blocking tasks |

### kanban_update_task

Update an existing task. Only provided fields are changed.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| id | number | yes | Task ID to update |
| status | string | no | New status |
| message | string | no | Status message |
| progress | number | no | Progress (0.0-1.0) |
| agent | string | no | Reassign agent |
| agent_color | string | no | Override color |
| subtasks_done | string[] | no | Completed subtask names |
| high / medium / low | number | no | Finding severity counts |
| files | string[] | no | Associated files |

When a task moves to `"done"`, any tasks blocked exclusively by it are automatically moved from `"blocked"` to `"ready"`.

### kanban_log

Add an entry to the activity log.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| agent | string | yes | Agent name |
| message | string | yes | Log message |
| color | string | no | Override agent color |

### kanban_stop

Stop the HTTP server and reset all state. No parameters.

## Agent Color Assignment

Colors are auto-assigned from a pool of 10 distinct colors in round-robin order. If an agent is seen again, it gets the same color. Providing `agent_color` explicitly overrides the auto-assignment. Colors reset on `kanban_init`.

## Dashboard UI

The browser dashboard includes:

- **Header** — live indicator, title/subtitle, stats (active/done/total/findings), elapsed timer
- **Progress bar** — completion percentage across all tasks
- **Agent bar** — unique agents with active/done/idle status indicators
- **Kanban board** — four columns: Blocked, Ready, In Progress, Done
- **Task cards** — ID, title, agent, progress bar, severity badges, file tags, subtasks (in-progress only)
- **Task modal** — click any card for details: agent, progress, findings, message, file diffs, subtasks, dependencies, agent activity log
- **Activity log** — scrolling log of agent messages
- **Completion banner** — appears when all tasks reach done

## Automatic Team Integration

This plugin includes a **skill** (`skills/kanban-team/SKILL.md`) that makes Claude automatically use the dashboard whenever it creates an agent team with `TeamCreate`. No manual instructions or CLAUDE.md configuration needed — once the plugin is installed, Claude sees the skill and follows it.

The skill designates the **team lead as the sole dashboard driver**. Teammates don't need the plugin or any special instructions. The lead:

1. Calls `kanban_init` after creating tasks
2. Calls `kanban_update_task` as teammates report progress
3. Calls `kanban_stop` when the team shuts down

## Typical Workflow

```
1. Team lead creates tasks with TaskCreate
2. Team lead calls kanban_init — browser opens to dashboard
3. Team lead spawns worker agents
4. As workers report back, lead calls kanban_update_task
5. Lead calls kanban_log for notable activity entries
6. When all done, lead calls kanban_stop
```

## Development

```bash
npm install
npm run build        # Compile TypeScript
npm test             # Run unit tests (219 tests via Vitest)
npm run test:e2e     # Run E2E tests (22 tests via Playwright)
npm run test:coverage # Run with coverage report
npm run dev          # Watch mode for TypeScript
```

## Project Structure

```
kanban-dashboard/
  src/
    index.ts          Entry point — MCP server + stdio transport
    state.ts          In-memory state management
    http-server.ts    Embedded HTTP server
    tools.ts          MCP tool definitions + handlers
  public/
    index.html        Dashboard HTML
    css/              Stylesheets (base, layout, cards, log, modal, diff)
    js/
      dashboard.js    Polling, rendering, stats
      modal.js        Task detail modal + file diffs
      diff.js         Unified diff parser + side-by-side renderer
  skills/
    kanban-team/
      SKILL.md        Auto-triggers on TeamCreate to drive the dashboard
  test/               Unit tests (Vitest)
  e2e/                E2E tests (Playwright)
  plugin.json         MCP plugin manifest
  package.json
  tsconfig.json
```
