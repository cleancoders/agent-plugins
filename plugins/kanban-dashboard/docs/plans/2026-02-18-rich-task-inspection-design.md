# Rich Task Inspection: File Diffs & Dependency Visualization

## Problem

The kanban dashboard is read-only and provides shallow task inspection. When an agent goes off-track or a run completes, the user has no way to see what actually changed in the codebase or understand task dependencies visually. By the time the context window is gone, the opportunity to inspect is lost.

## Approach

A+C hybrid: server-side git diff via new API endpoints, lazy per-file loading, cross-referenced with each task's `files` field. Dependency graph rendered purely from existing `blocked_by` data. Zero agent behavioral changes beyond an optional `project_dir` parameter on `kanban_init`.

## Backend

### State Change

- Add `project_dir?: string` to `DashboardConfig`
- `kanban_init` gains an optional `project_dir` parameter (absolute path to the git repo the agents are working in)

### New HTTP Endpoints

**`GET /api/files`** — All changed files in the project

- Runs `git diff --name-status` in `project_dir`
- Returns `{ files: [{ path: "src/foo.ts", status: "M", task_ids: [1, 3] }] }`
- Cross-references each file against all tasks' `files` arrays to populate `task_ids`
- Cached for 2 seconds to avoid hammering git
- Returns `{ error: "..." }` if `project_dir` not configured or git fails

**`GET /api/diff?file=<path>`** — Unified diff for a single file

- Runs `git diff -- <path>` in `project_dir`
- Returns `{ file: "src/foo.ts", diff: "..." }`
- Called on-demand only when user clicks a specific file
- Path validated: must not contain `..`, must be relative
- Returns `{ error: "..." }` on failure or `{ diff: "" }` if file is clean

## Frontend

### Enhanced Task Modal

Two new sections added to the existing modal:

**Files & Diffs section:**

- On modal open, fetches `GET /api/files` and filters to files matching the task's `files` array
- Files displayed as clickable rows: file path + change status indicator (M=yellow, A=green, D=red)
- Clicking a file fetches `GET /api/diff?file=<path>` and renders a GitHub-style side-by-side diff view
- Diff renderer parses unified diff format: old (left) vs new (right), line numbers, red/green background for removed/added lines, gray for context
- Only one file's diff expanded at a time — clicking another file replaces it
- Custom renderer in `js/diff.js`, no external libraries

**Dependencies section:**

- Rendered from existing `blocked_by` data — no new API call
- Horizontal flow of linked task chips: `#id` + truncated title + status color
- Arrows connect blockers to the current task
- Also shows tasks that this task blocks (reverse lookup on all tasks' `blocked_by`)
- Clicking a dependency chip navigates to that task's modal
- Hidden if the task has no dependencies in either direction

### New Files

- `public/css/diff.css` — side-by-side diff styling
- `public/js/diff.js` — unified diff parsing and rendering

### Load Order in index.html

```html
<link rel="stylesheet" href="/css/diff.css">
<script src="/js/diff.js"></script>
<script src="/js/modal.js"></script>
```

## Integration Flow

1. `openModal(taskId)` populates header, agent, progress as today
2. Calls `fetch('/api/files')`, filters to files matching `task.files`
3. Renders file list in new "Files" section
4. User clicks a file → `fetch('/api/diff?file=...')` → `renderDiff()` builds side-by-side HTML
5. Dependencies section walks `blocked_by` on current task + reverse-scans all tasks for "blocks" relationships

## Error Handling

- `project_dir` not set: Files section shows "No project directory configured"
- `git diff` fails: API returns `{ error: "..." }`, modal shows error inline
- File has no diff: diff area shows "No changes"

## What Doesn't Change

- Agent behavior (only optional `project_dir` on init)
- Existing polling, card rendering, log panel
- Static file serving already handles `/css/*` and `/js/*`
