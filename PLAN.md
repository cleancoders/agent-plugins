# Claude Code Plugin Marketplace - Implementation Plan

## Goal

Convert this repo into a **Claude Code plugin marketplace** that includes the KanBan Dashboard as its first plugin. Developers install the marketplace once via `/plugin marketplace add`, and all plugins (starting with the kanban dashboard) become available. No npm publishing required - the repo itself is the distribution mechanism.

---

## Repo Structure (Target)

```
cleancoders-agent-plugins/           # Root = marketplace repo
  .claude-plugin/
    marketplace.json                 # Marketplace manifest (required by Claude Code)
  plugins/
    kanban-dashboard/
      plugin.json                    # Plugin manifest
      src/
        index.ts                     # MCP server entry point + stdio transport
        state.ts                     # In-memory task/log state management
        http-server.ts               # Embedded HTTP server for dashboard UI
        tools.ts                     # MCP tool definitions and handlers
      public/
        index.html                   # Dashboard UI (evolved from current index.html)
      package.json                   # Node.js deps (local to plugin, not published)
      tsconfig.json
      dist/                          # Compiled output (gitignored)
  README.md
  .gitignore
```

---

## Architecture Overview

```
Claude Code
  |
  |-- /plugin marketplace add owner/cleancoders-agent-plugins
  |         |
  |         |-- Reads .claude-plugin/marketplace.json
  |         |-- Discovers plugins/kanban-dashboard/
  |         |-- Registers MCP server from plugin.json
  |
  |-- stdio JSON-RPC --> MCP Server (Node.js)
  |                        |
  |                        |-- Embedded HTTP Server (port auto-selected)
  |                        |     |-- Serves public/index.html
  |                        |     |-- GET /api/status (task data)
  |                        |     |-- GET /api/log (activity log)
  |                        |
  |                        |-- In-memory state (tasks, logs, config)
  |                        |
  |                        |-- MCP Tools:
  |                             kanban_init
  |                             kanban_add_task
  |                             kanban_update_task
  |                             kanban_log
  |                             kanban_stop
```

**Key design decisions:**
- **Marketplace-native distribution** - No npm. Users add the marketplace from the GitHub repo; Claude Code handles the rest.
- **Node.js MCP server** - Claude Code MCP servers use stdio JSON-RPC; the Node.js MCP SDK (`@modelcontextprotocol/sdk`) is the canonical choice
- **In-memory state** - No file-based status directory; all state lives in the server process and is served via HTTP API
- **Auto-selected port** - Server picks an available port and returns it to the caller
- **Single process** - MCP server + HTTP server run in the same Node.js process
- **Extensible** - Adding future plugins means adding another directory under `plugins/` and an entry in `marketplace.json`

---

## Phase 1: Marketplace Scaffolding

### 1.1 - marketplace.json

Create `.claude-plugin/marketplace.json`:

```json
{
  "name": "cleancoders-agent-plugins",
  "owner": {
    "name": "AlexRoot-Roatch",
    "email": ""
  },
  "plugins": [
    {
      "name": "kanban-dashboard",
      "source": "./plugins/kanban-dashboard",
      "description": "Live KanBan dashboard for monitoring Claude Code agent teams in real-time",
      "version": "1.0.0"
    }
  ]
}
```

### 1.2 - plugin.json

Create `plugins/kanban-dashboard/plugin.json`:

```json
{
  "name": "kanban-dashboard",
  "description": "Live KanBan dashboard MCP server for Claude Code agent teams",
  "version": "1.0.0",
  "type": "mcp",
  "mcp": {
    "command": "node",
    "args": ["dist/index.js"],
    "cwd": "."
  },
  "setup": {
    "install": "npm install && npm run build"
  }
}
```

### 1.3 - Rename repo and directory

- Rename directory: `~/current-projects/kanban-dashboard/` -> `~/current-projects/cleancoders-agent-plugins/`
- Rename GitHub remote (when created): `AlexRoot-Roatch/cleancoders-agent-plugins`
- Update git remote origin URL to match new repo name

### 1.4 - Move existing files

- `index.html` -> `plugins/kanban-dashboard/public/index.html`
- Delete `server.py`, `tasks.json`, `status/`
- Update `.gitignore` for Node.js (`node_modules/`, `dist/`, `*.js.map`)

### 1.5 - Update .gitignore

```
node_modules/
dist/
*.js.map
status/
activity.log
server.log
__pycache__/
*.pyc
```

---

## Phase 2: MCP Server Implementation

### 2.1 - package.json

Create `plugins/kanban-dashboard/package.json`:

```json
{
  "name": "kanban-dashboard",
  "version": "1.0.0",
  "private": true,
  "description": "Live KanBan dashboard MCP server for Claude Code agent teams",
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.12.0"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "@types/node": "^22.0.0"
  }
}
```

Note: `"private": true` - this is never published to npm.

### 2.2 - src/state.ts (State Management)

In-memory store replacing the file-based status directory:

```typescript
interface Task {
  id: number;
  title: string;
  agent: string;
  agent_color: string;
  status: "blocked" | "ready" | "in_progress" | "done";
  message: string;
  progress: number;       // 0.0 - 1.0
  high?: number;          // severity counts (optional)
  medium?: number;
  low?: number;
  blocked_by?: number[];
  phase?: number;
  files?: string[];
  subtasks?: string[];
  subtasks_done?: string[];
}

interface LogEntry {
  time: string;
  agent: string;
  color: string;
  message: string;
}

interface DashboardConfig {
  title: string;          // e.g., "Story Settings Cleanup"
  subtitle: string;       // e.g., "Agent Swarm"
}
```

Exports:
- `initDashboard(config: DashboardConfig): void`
- `addTask(task: Task): void`
- `updateTask(id: number, updates: Partial<Task>): void`
- `addLog(entry: LogEntry): void`
- `getState(): { tasks: Task[], config: DashboardConfig, server_time: string }`
- `getLogs(): { entries: LogEntry[] }`
- `reset(): void`

### 2.3 - src/http-server.ts (Dashboard HTTP Server)

Lightweight Node.js HTTP server using only the `http` module:

- `startServer(): Promise<{ port: number, url: string }>` - Starts on port 0 (OS auto-assigns), returns actual port
- Routes:
  - `GET /` - Serve `public/index.html` (resolved relative to plugin directory via `__dirname`)
  - `GET /api/status` - Return `getState()` as JSON
  - `GET /api/log` - Return `getLogs()` as JSON
- `stopServer(): Promise<void>` - Graceful shutdown
- CORS headers + Cache-Control: no-cache on API routes

### 2.4 - src/tools.ts (MCP Tool Definitions)

Five tools that agents call to drive the dashboard:

#### `kanban_init`
```
Input: {
  title: string,           // Dashboard title
  subtitle?: string,       // Optional subtitle
  tasks: Task[]            // Initial task list
}
Output: {
  url: string,             // e.g., "http://localhost:54321"
  port: number
}
```
- Calls `reset()` then `initDashboard()`
- Adds all tasks to state
- Starts HTTP server if not running
- Opens browser automatically (platform-aware: `open`/`xdg-open`/`start`)

#### `kanban_add_task`
```
Input: {
  id: number,
  title: string,
  agent: string,
  agent_color?: string,    // Auto-assigned from color pool if omitted
  status?: string,         // Default: "ready"
  files?: string[],
  subtasks?: string[],
  blocked_by?: number[]
}
Output: { success: true }
```

#### `kanban_update_task`
```
Input: {
  id: number,
  status?: string,
  message?: string,
  progress?: number,
  subtasks_done?: string[]
}
Output: { success: true }
```
- Auto-resolves blocked tasks: when a blocking task moves to "done", check if any tasks' `blocked_by` lists are now fully resolved, and move those from "blocked" to "ready"

#### `kanban_log`
```
Input: {
  agent: string,
  message: string,
  color?: string
}
Output: { success: true }
```

#### `kanban_stop`
```
Input: {}
Output: { success: true }
```
- Stops the HTTP server
- Resets state

### 2.5 - src/index.ts (Entry Point)

- Import `@modelcontextprotocol/sdk/server/mcp.js` and `StdioServerTransport`
- Create MCP server with name `"kanban-dashboard"` and version `"1.0.0"`
- Register all tools from `tools.ts`
- Connect via stdio transport
- Handle SIGINT/SIGTERM to clean up HTTP server

---

## Phase 3: Dashboard UI Updates

Modify `public/index.html` to work with the MCP server instead of hardcoded values.

### Changes Required

1. **Remove hardcoded title/stats** - On first successful `/api/status` poll:
   - Set `<h1>` title and subtitle from `config` field in response
   - Remove hardcoded "85" findings count
   - Compute findings total dynamically by summing `high + medium + low` across all tasks

2. **Dynamic agent colors** - Already supported via `agent_color` field; just ensure the color pool auto-assigns for agents that don't specify one

3. **Error state** - Show a "Connecting..." overlay if `/api/status` fetch fails (server not started yet)

4. **Completion banner** - When all tasks are "done", show a completion banner with elapsed time

---

## Phase 4: Claude Code Integration & Documentation

### 4.1 - Installation

Users install with one command:

```bash
/plugin marketplace add AlexRoot-Roatch/cleancoders-agent-plugins
```

Claude Code clones the repo, runs the setup command (`npm install && npm run build`), and registers the MCP server.

### 4.2 - Team-Wide Configuration

For teams, add to project `.claude/settings.json`:

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

### 4.3 - Agent Integration Pattern

The dashboard is driven by agents calling MCP tools. Typical workflow:

```
1. TeamCreate -> team lead starts
2. Team lead calls kanban_init with title + task list
3. Browser opens to dashboard
4. Team lead spawns worker agents
5. Worker agents call kanban_update_task as they progress
6. Worker agents call kanban_log for activity entries
7. When all done, team lead calls kanban_stop
```

To make this automatic, users add to CLAUDE.md:
```
When creating agent teams, use the kanban-dashboard MCP tools
(kanban_init, kanban_update_task, kanban_log, kanban_stop)
to provide a live dashboard for monitoring progress.
```

### 4.4 - README.md

Write a README covering:
- What the plugin does (screenshot of dashboard)
- One-line install command
- Available MCP tools with input/output schemas
- Example CLAUDE.md integration snippet
- How to add future plugins to the marketplace

---

## Phase 5: Polish & Edge Cases

### 5.1 - Port Conflict Handling
- Use port 0 for OS auto-assignment (already planned)
- If user wants a fixed port, accept optional `port` param in `kanban_init`

### 5.2 - Multiple Dashboards
- Only one dashboard active at a time
- `kanban_init` stops any existing server before starting a new one

### 5.3 - Browser Opening
- Use `child_process.exec('open <url>')` on macOS
- Use `child_process.exec('xdg-open <url>')` on Linux
- Use `child_process.exec('start <url>')` on Windows
- Accept `open_browser: false` param to skip

### 5.4 - Graceful Shutdown
- `kanban_stop` closes HTTP server and resets state
- Process SIGINT/SIGTERM handlers clean up
- Server timeout for idle connections

### 5.5 - Agent Color Auto-Assignment
- Pool of 10 distinct colors (from current CSS variables)
- Auto-assign round-robin when `agent_color` not specified
- Track assignment per agent name for consistency

---

## Implementation Order

| Step | Phase | Description | Est. Complexity |
|------|-------|-------------|-----------------|
| 1 | 1.1-1.5 | Marketplace scaffolding, repo rename, file moves | Low |
| 2 | 2.1 | package.json + tsconfig.json | Low |
| 3 | 2.2 | state.ts - In-memory state management | Low |
| 4 | 2.3 | http-server.ts - Embedded HTTP server | Medium |
| 5 | 2.4 | tools.ts - MCP tool definitions | Medium |
| 6 | 2.5 | index.ts - MCP server entry point + stdio | Medium |
| 7 | 3 | Update index.html for dynamic config | Low |
| 8 | -- | End-to-end testing with Claude Code | Medium |
| 9 | 4 | Documentation + integration instructions | Low |
| 10 | 5 | Edge cases + polish | Low |

---

## Known Issues to Address

1. **Bash escaping** - Previous implementation had `\!` in JSON from bash `echo`. The MCP approach eliminates this entirely since tools receive structured JSON, not shell strings.

2. **Working directory confusion** - Previous agents inherited wrong cwd. MCP tools are agnostic to cwd since they operate on in-memory state.

3. **Hardcoded values** - Current `index.html` has hardcoded title "Story Settings Cleanup" and "85 findings". Phase 3 makes these dynamic.

4. **File-based status** - Current architecture reads/writes JSON files to disk. MCP approach uses in-memory state, eliminating file I/O race conditions and parse errors.

---

## Files to Delete

- `server.py` - Replaced by `plugins/kanban-dashboard/src/http-server.ts`
- `tasks.json` - Tasks provided dynamically via `kanban_init`
- `status/` directory - Replaced by in-memory state

## Files to Move

- `index.html` -> `plugins/kanban-dashboard/public/index.html`

## Future Plugins

This marketplace is designed to grow. To add a new plugin:

1. Create `plugins/<name>/` with `plugin.json` and implementation
2. Add entry to `.claude-plugin/marketplace.json`'s `plugins` array
3. Commit and push - users with the marketplace installed get the new plugin on next sync
