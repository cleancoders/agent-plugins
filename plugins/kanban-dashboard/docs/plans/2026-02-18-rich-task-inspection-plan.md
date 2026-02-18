# Rich Task Inspection Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add GitHub-style side-by-side file diffs and dependency visualization to the kanban dashboard task modal.

**Architecture:** Server-side git diff via two new HTTP endpoints (`/api/files`, `/api/diff`), lazy-loaded per file. Frontend renders diffs with a custom parser and side-by-side view. Dependencies visualized from existing `blocked_by` data. Only backend change agents see is an optional `project_dir` on `kanban_init`.

**Tech Stack:** TypeScript (Node.js HTTP server), vanilla JavaScript (frontend), CSS (diff styling)

**Design doc:** `docs/plans/2026-02-18-rich-task-inspection-design.md`

---

### Task 1: Add project_dir to DashboardConfig

**Files:**
- Modify: `plugins/kanban-dashboard/src/state.ts`

**Step 1: Add project_dir to DashboardConfig interface**

In `src/state.ts`, add the optional field to the interface and update the default:

```typescript
export interface DashboardConfig {
  title: string;
  subtitle: string;
  project_dir?: string;
}
```

No changes needed to `defaultConfig` since the field is optional.

**Step 2: Export a getter for project_dir**

Add a function at the bottom of `state.ts` (before `reset()`):

```typescript
export function getProjectDir(): string | undefined {
  return config.project_dir;
}
```

**Step 3: Verify build**

Run: `npm run build` in `plugins/kanban-dashboard/`
Expected: Compiles with no errors.

**Step 4: Commit**

```bash
git add plugins/kanban-dashboard/src/state.ts
git commit -m "Add project_dir to DashboardConfig"
```

---

### Task 2: Add project_dir parameter to kanban_init tool

**Files:**
- Modify: `plugins/kanban-dashboard/src/tools.ts`

**Step 1: Add project_dir to the Zod schema**

In `src/tools.ts`, in the `kanban_init` tool's schema object (after the `open_browser` field at line 69), add:

```typescript
project_dir: z.string().optional().describe('Absolute path to the project git repository for file diff inspection'),
```

**Step 2: Pass project_dir through to initDashboard**

In the `kanban_init` handler function (line 71), update the destructured params to include `project_dir`, and update the `initDashboard` call:

```typescript
async ({ title, subtitle, tasks, port, open_browser, project_dir }) => {
```

```typescript
initDashboard({ title, subtitle: subtitle || '', project_dir });
```

**Step 3: Verify build**

Run: `npm run build` in `plugins/kanban-dashboard/`
Expected: Compiles with no errors.

**Step 4: Commit**

```bash
git add plugins/kanban-dashboard/src/tools.ts
git commit -m "Add project_dir parameter to kanban_init tool"
```

---

### Task 3: Add GET /api/files endpoint

**Files:**
- Modify: `plugins/kanban-dashboard/src/http-server.ts`

**Step 1: Add imports**

At the top of `http-server.ts`, add `execSync` to imports:

```typescript
import { execSync } from "node:child_process";
```

Also update the state import to include `getProjectDir`:

```typescript
import { getState, getLogs, getProjectDir } from "./state.js";
```

**Step 2: Add caching variables**

After the `CORS_HEADERS` constant (line 12), add:

```typescript
let filesCache: { data: unknown; time: number } | null = null;
const FILES_CACHE_TTL = 2000;
```

**Step 3: Add the /api/files handler**

In `handleRequest`, add this block before the existing `/api/status` handler (before line 82):

```typescript
if (method === "GET" && url === "/api/files") {
  const projectDir = getProjectDir();
  if (!projectDir) {
    sendJson(res, 200, { error: "No project directory configured" });
    return;
  }

  const now = Date.now();
  if (filesCache && now - filesCache.time < FILES_CACHE_TTL) {
    sendJson(res, 200, filesCache.data);
    return;
  }

  try {
    const output = execSync("git diff --name-status", {
      cwd: projectDir,
      encoding: "utf-8",
      timeout: 5000,
    }).trim();

    const state = getState();
    const files = output
      .split("\n")
      .filter((line) => line.length > 0)
      .map((line) => {
        const [status, ...pathParts] = line.split("\t");
        const filePath = pathParts.join("\t");
        const taskIds = state.tasks
          .filter(
            (t) => t.files && t.files.some((f) => filePath.endsWith(f) || f.endsWith(filePath))
          )
          .map((t) => t.id);
        return { path: filePath, status, task_ids: taskIds };
      });

    const data = { files };
    filesCache = { data, time: now };
    sendJson(res, 200, data);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "git diff failed";
    sendJson(res, 200, { error: message });
  }
  return;
}
```

**Step 4: Verify build**

Run: `npm run build` in `plugins/kanban-dashboard/`
Expected: Compiles with no errors.

**Step 5: Commit**

```bash
git add plugins/kanban-dashboard/src/http-server.ts
git commit -m "Add GET /api/files endpoint for changed file listing"
```

---

### Task 4: Add GET /api/diff endpoint

**Files:**
- Modify: `plugins/kanban-dashboard/src/http-server.ts`

**Step 1: Add the /api/diff handler**

In `handleRequest`, add this block immediately after the `/api/files` handler:

```typescript
if (method === "GET" && url.startsWith("/api/diff?")) {
  const projectDir = getProjectDir();
  if (!projectDir) {
    sendJson(res, 200, { error: "No project directory configured" });
    return;
  }

  const params = new URL(url, "http://localhost").searchParams;
  const file = params.get("file");
  if (!file || file.includes("..")) {
    sendJson(res, 400, { error: "Invalid file path" });
    return;
  }

  try {
    const diff = execSync(`git diff -- ${JSON.stringify(file)}`, {
      cwd: projectDir,
      encoding: "utf-8",
      timeout: 10000,
    });
    sendJson(res, 200, { file, diff });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "git diff failed";
    sendJson(res, 200, { error: message });
  }
  return;
}
```

**Step 2: Verify build**

Run: `npm run build` in `plugins/kanban-dashboard/`
Expected: Compiles with no errors.

**Step 3: Commit**

```bash
git add plugins/kanban-dashboard/src/http-server.ts
git commit -m "Add GET /api/diff endpoint for per-file diff"
```

---

### Task 5: Create diff.css

**Files:**
- Create: `plugins/kanban-dashboard/public/css/diff.css`

**Step 1: Create the file**

Create `public/css/diff.css` with the side-by-side diff styling:

```css
/* File list in modal */
.diff-file-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.diff-file-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  font-family: 'SF Mono', 'Fira Code', monospace;
  color: var(--text-muted);
  transition: background 0.15s ease;
}

.diff-file-row:hover {
  background: rgba(255, 255, 255, 0.05);
}

.diff-file-row.active {
  background: rgba(88, 166, 255, 0.1);
  color: var(--text);
}

.diff-file-status {
  font-size: 10px;
  font-weight: 700;
  width: 16px;
  text-align: center;
  flex-shrink: 0;
}

.diff-file-status.M { color: var(--yellow); }
.diff-file-status.A { color: var(--green); }
.diff-file-status.D { color: var(--red); }
.diff-file-status.R { color: var(--blue); }

.diff-file-path {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  direction: rtl;
  text-align: left;
}

/* Side-by-side diff container */
.diff-container {
  margin-top: 8px;
  border: 1px solid var(--border);
  border-radius: 6px;
  overflow: hidden;
  font-family: 'SF Mono', 'Fira Code', monospace;
  font-size: 11px;
  line-height: 1.5;
}

.diff-loading {
  padding: 16px;
  text-align: center;
  color: var(--text-dim);
  font-style: italic;
}

.diff-error {
  padding: 16px;
  color: var(--red);
  font-size: 12px;
}

.diff-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}

.diff-hunk-header {
  background: rgba(88, 166, 255, 0.08);
  color: var(--text-dim);
  padding: 4px 12px;
  font-size: 11px;
  border-top: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
}

.diff-hunk-header td {
  padding: 4px 12px;
}

.diff-row {
  border-bottom: 1px solid rgba(255, 255, 255, 0.03);
}

.diff-line-num {
  width: 48px;
  min-width: 48px;
  padding: 0 8px;
  text-align: right;
  color: var(--text-dim);
  user-select: none;
  vertical-align: top;
  border-right: 1px solid var(--border);
}

.diff-line-content {
  padding: 0 12px;
  white-space: pre-wrap;
  word-break: break-all;
  overflow-wrap: break-word;
  vertical-align: top;
}

.diff-side-left {
  border-right: 1px solid var(--border);
}

/* Line highlighting */
.diff-row.added .diff-line-content.diff-side-right {
  background: rgba(105, 219, 124, 0.1);
}

.diff-row.added .diff-line-num.diff-side-right {
  background: rgba(105, 219, 124, 0.08);
}

.diff-row.removed .diff-line-content.diff-side-left {
  background: rgba(255, 107, 107, 0.1);
}

.diff-row.removed .diff-line-num.diff-side-left {
  background: rgba(255, 107, 107, 0.08);
}

.diff-row.modified .diff-line-content.diff-side-left {
  background: rgba(255, 107, 107, 0.1);
}

.diff-row.modified .diff-line-content.diff-side-right {
  background: rgba(105, 219, 124, 0.1);
}

.diff-row.modified .diff-line-num.diff-side-left {
  background: rgba(255, 107, 107, 0.08);
}

.diff-row.modified .diff-line-num.diff-side-right {
  background: rgba(105, 219, 124, 0.08);
}

.diff-empty-cell {
  background: rgba(255, 255, 255, 0.02);
}

/* Dependencies section */
.dep-graph {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
}

.dep-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  border-radius: 4px;
  font-size: 11px;
  border: 1px solid var(--border);
  cursor: pointer;
  transition: border-color 0.15s ease;
  max-width: 200px;
}

.dep-chip:hover {
  border-color: var(--accent);
}

.dep-chip-id {
  font-weight: 600;
  flex-shrink: 0;
}

.dep-chip-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-muted);
}

.dep-chip.blocked { border-left: 3px solid var(--text-dim); }
.dep-chip.ready { border-left: 3px solid var(--yellow); }
.dep-chip.in_progress { border-left: 3px solid var(--blue); }
.dep-chip.done { border-left: 3px solid var(--green); }

.dep-arrow {
  color: var(--text-dim);
  font-size: 14px;
  flex-shrink: 0;
}

.dep-label {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-dim);
  font-weight: 600;
  margin-right: 4px;
  flex-shrink: 0;
}

.dep-group {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
  margin-bottom: 6px;
}
```

**Step 2: Commit**

```bash
git add plugins/kanban-dashboard/public/css/diff.css
git commit -m "Add diff.css for side-by-side diff and dependency styling"
```

---

### Task 6: Create diff.js — unified diff parser and renderer

**Files:**
- Create: `plugins/kanban-dashboard/public/js/diff.js`

**Step 1: Create the file**

Create `public/js/diff.js` with the diff parsing and rendering logic:

```javascript
/**
 * Parse unified diff output into structured hunks.
 * Each hunk contains lines with type: 'context', 'added', 'removed'
 * and old/new line numbers.
 */
function parseDiff(diffText) {
  if (!diffText || !diffText.trim()) return [];

  const lines = diffText.split('\n');
  const hunks = [];
  let currentHunk = null;
  let oldLine = 0;
  let newLine = 0;

  for (const line of lines) {
    // Hunk header: @@ -oldStart,oldCount +newStart,newCount @@
    const hunkMatch = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)/);
    if (hunkMatch) {
      currentHunk = { header: line, lines: [] };
      hunks.push(currentHunk);
      oldLine = parseInt(hunkMatch[1], 10);
      newLine = parseInt(hunkMatch[2], 10);
      continue;
    }

    // Skip diff metadata lines (---, +++, diff, index)
    if (line.startsWith('---') || line.startsWith('+++') ||
        line.startsWith('diff ') || line.startsWith('index ')) {
      continue;
    }

    if (!currentHunk) continue;

    if (line.startsWith('+')) {
      currentHunk.lines.push({ type: 'added', content: line.slice(1), newNum: newLine });
      newLine++;
    } else if (line.startsWith('-')) {
      currentHunk.lines.push({ type: 'removed', content: line.slice(1), oldNum: oldLine });
      oldLine++;
    } else if (line.startsWith(' ') || line === '') {
      currentHunk.lines.push({
        type: 'context',
        content: line.startsWith(' ') ? line.slice(1) : line,
        oldNum: oldLine,
        newNum: newLine,
      });
      oldLine++;
      newLine++;
    }
  }

  return hunks;
}

/**
 * Convert parsed hunks into side-by-side row pairs.
 * Adjacent removed+added lines are paired as "modified".
 * Unpaired removed lines have empty right side, and vice versa.
 */
function buildSideBySide(hunks) {
  const rows = [];

  for (const hunk of hunks) {
    rows.push({ type: 'hunk', header: hunk.header });

    const lines = hunk.lines;
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];

      if (line.type === 'context') {
        rows.push({
          type: 'context',
          leftNum: line.oldNum,
          leftContent: line.content,
          rightNum: line.newNum,
          rightContent: line.content,
        });
        i++;
      } else if (line.type === 'removed') {
        // Collect consecutive removed lines
        const removed = [];
        while (i < lines.length && lines[i].type === 'removed') {
          removed.push(lines[i]);
          i++;
        }
        // Collect consecutive added lines that follow
        const added = [];
        while (i < lines.length && lines[i].type === 'added') {
          added.push(lines[i]);
          i++;
        }
        // Pair them up
        const maxLen = Math.max(removed.length, added.length);
        for (let j = 0; j < maxLen; j++) {
          const rem = removed[j];
          const add = added[j];
          if (rem && add) {
            rows.push({
              type: 'modified',
              leftNum: rem.oldNum,
              leftContent: rem.content,
              rightNum: add.newNum,
              rightContent: add.content,
            });
          } else if (rem) {
            rows.push({
              type: 'removed',
              leftNum: rem.oldNum,
              leftContent: rem.content,
              rightNum: null,
              rightContent: null,
            });
          } else if (add) {
            rows.push({
              type: 'added',
              leftNum: null,
              leftContent: null,
              rightNum: add.newNum,
              rightContent: add.content,
            });
          }
        }
      } else if (line.type === 'added') {
        rows.push({
          type: 'added',
          leftNum: null,
          leftContent: null,
          rightNum: line.newNum,
          rightContent: line.content,
        });
        i++;
      }
    }
  }

  return rows;
}

function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Render a side-by-side diff table from unified diff text.
 * Returns an HTML string.
 */
function renderDiff(diffText) {
  if (!diffText || !diffText.trim()) {
    return '<div class="diff-loading">No changes</div>';
  }

  const hunks = parseDiff(diffText);
  if (hunks.length === 0) {
    return '<div class="diff-loading">No changes</div>';
  }

  const rows = buildSideBySide(hunks);
  let html = '<div class="diff-container"><table class="diff-table">';

  for (const row of rows) {
    if (row.type === 'hunk') {
      html += `<tr class="diff-hunk-header"><td colspan="4">${escapeHtml(row.header)}</td></tr>`;
      continue;
    }

    const leftNum = row.leftNum != null ? row.leftNum : '';
    const rightNum = row.rightNum != null ? row.rightNum : '';
    const leftContent = row.leftContent != null ? escapeHtml(row.leftContent) : '';
    const rightContent = row.rightContent != null ? escapeHtml(row.rightContent) : '';
    const leftEmpty = row.leftContent == null ? ' diff-empty-cell' : '';
    const rightEmpty = row.rightContent == null ? ' diff-empty-cell' : '';

    html += `<tr class="diff-row ${row.type}">`;
    html += `<td class="diff-line-num diff-side-left${leftEmpty}">${leftNum}</td>`;
    html += `<td class="diff-line-content diff-side-left${leftEmpty}">${leftContent}</td>`;
    html += `<td class="diff-line-num diff-side-right${rightEmpty}">${rightNum}</td>`;
    html += `<td class="diff-line-content diff-side-right${rightEmpty}">${rightContent}</td>`;
    html += `</tr>`;
  }

  html += '</table></div>';
  return html;
}
```

**Step 2: Commit**

```bash
git add plugins/kanban-dashboard/public/js/diff.js
git commit -m "Add diff.js with unified diff parser and side-by-side renderer"
```

---

### Task 7: Update modal.js — Files & Diffs section

**Files:**
- Modify: `plugins/kanban-dashboard/public/js/modal.js`

**Step 1: Replace the existing Files section with the interactive diff version**

In `modal.js`, replace the static Files section (lines 49–56, the `if (task.files ...)` block) with the new version that fetches from `/api/files` and renders clickable file rows:

```javascript
  // Files & Diffs
  if (task.files && task.files.length > 0) {
    html += `<div class="modal-section">
      <div class="modal-section-title">Files</div>
      <div class="diff-file-list" id="modal-file-list">
        <div class="diff-loading">Loading file changes...</div>
      </div>
      <div id="modal-diff-view"></div>
    </div>`;
  }
```

**Step 2: Add the async file-loading function**

At the bottom of `modal.js`, before the `closeModal` function, add:

```javascript
async function loadFileDiffs(taskFiles) {
  const fileListEl = document.getElementById('modal-file-list');
  const diffViewEl = document.getElementById('modal-diff-view');
  if (!fileListEl) return;

  try {
    const res = await fetch('/api/files');
    const data = await res.json();

    if (data.error) {
      fileListEl.innerHTML = `<div class="modal-empty">${data.error}</div>`;
      return;
    }

    // Filter to files relevant to this task
    const relevant = (data.files || []).filter(f =>
      taskFiles.some(tf => f.path.endsWith(tf) || tf.endsWith(f.path))
    );

    if (relevant.length === 0) {
      fileListEl.innerHTML = '<div class="modal-empty">No changed files detected</div>';
      return;
    }

    fileListEl.innerHTML = relevant.map(f =>
      `<div class="diff-file-row" data-file="${escapeHtml(f.path)}" onclick="loadSingleDiff(this, '${escapeHtml(f.path)}')">
        <span class="diff-file-status ${f.status}">${f.status}</span>
        <span class="diff-file-path">${escapeHtml(f.path)}</span>
      </div>`
    ).join('');
  } catch (e) {
    fileListEl.innerHTML = '<div class="modal-empty">Failed to load file list</div>';
  }
}

async function loadSingleDiff(rowEl, filePath) {
  const diffViewEl = document.getElementById('modal-diff-view');
  if (!diffViewEl) return;

  // Toggle active state
  document.querySelectorAll('.diff-file-row.active').forEach(el => el.classList.remove('active'));
  rowEl.classList.add('active');

  diffViewEl.innerHTML = '<div class="diff-loading">Loading diff...</div>';

  try {
    const res = await fetch('/api/diff?file=' + encodeURIComponent(filePath));
    const data = await res.json();

    if (data.error) {
      diffViewEl.innerHTML = `<div class="diff-error">${data.error}</div>`;
      return;
    }

    diffViewEl.innerHTML = renderDiff(data.diff);
  } catch (e) {
    diffViewEl.innerHTML = '<div class="diff-error">Failed to load diff</div>';
  }
}
```

Note: `escapeHtml` and `renderDiff` are globals from `diff.js` which loads before `modal.js`.

**Step 3: Call loadFileDiffs from openModal**

At the end of the `openModal` function, after `document.getElementById('task-modal').classList.add('open');`, add:

```javascript
  // Load file diffs async after modal is open
  if (task.files && task.files.length > 0) {
    loadFileDiffs(task.files);
  }
```

**Step 4: Verify by opening browser**

Open the dashboard and click a task card. The Files section should show "Loading file changes..." then render the file list (or "No project directory configured" if project_dir was not set). Clicking a file should load its diff.

**Step 5: Commit**

```bash
git add plugins/kanban-dashboard/public/js/modal.js
git commit -m "Add interactive file diff viewer to task modal"
```

---

### Task 8: Update modal.js — Dependencies section

**Files:**
- Modify: `plugins/kanban-dashboard/public/js/modal.js`

**Step 1: Replace the existing Blocked By section with the Dependencies section**

In `modal.js`, replace the "Blocked by" block (the `if (task.blocked_by ...)` block) with a richer dependencies section that shows both directions:

```javascript
  // Dependencies
  const blockedBy = (task.blocked_by || [])
    .map(id => allTasks.find(t => t.id === id))
    .filter(Boolean);
  const blocks = allTasks.filter(t =>
    t.blocked_by && t.blocked_by.includes(task.id)
  );

  if (blockedBy.length > 0 || blocks.length > 0) {
    html += `<div class="modal-section">
      <div class="modal-section-title">Dependencies</div>`;

    if (blockedBy.length > 0) {
      html += `<div class="dep-group">
        <span class="dep-label">Blocked by</span>`;
      html += blockedBy.map(dep =>
        `<span class="dep-chip ${dep.status}" onclick="openModal('${dep.id}')">
          <span class="dep-chip-id">#${dep.id}</span>
          <span class="dep-chip-title">${dep.title}</span>
        </span>`
      ).join('<span class="dep-arrow">&#8594;</span>');
      html += `<span class="dep-arrow">&#8594;</span>
        <span class="dep-chip ${task.status}">
          <span class="dep-chip-id">#${task.id}</span>
          <span class="dep-chip-title">${task.title}</span>
        </span>`;
      html += `</div>`;
    }

    if (blocks.length > 0) {
      html += `<div class="dep-group">
        <span class="dep-chip ${task.status}">
          <span class="dep-chip-id">#${task.id}</span>
          <span class="dep-chip-title">${task.title}</span>
        </span>
        <span class="dep-arrow">&#8594;</span>`;
      html += blocks.map(dep =>
        `<span class="dep-chip ${dep.status}" onclick="openModal('${dep.id}')">
          <span class="dep-chip-id">#${dep.id}</span>
          <span class="dep-chip-title">${dep.title}</span>
        </span>`
      ).join('');
      html += `<span class="dep-label" style="margin-left:4px">blocked by this</span>`;
      html += `</div>`;
    }

    html += `</div>`;
  }
```

**Step 2: Verify by opening browser**

Open a task modal for a task that has `blocked_by` entries. Should see clickable dependency chips with status colors and arrows. Clicking a chip should navigate to that task's modal.

**Step 3: Commit**

```bash
git add plugins/kanban-dashboard/public/js/modal.js
git commit -m "Add dependency visualization to task modal"
```

---

### Task 9: Update index.html with new CSS and JS links

**Files:**
- Modify: `plugins/kanban-dashboard/public/index.html`

**Step 1: Add diff.css link**

In the `<head>` section, after the `modal.css` link (line 11), add:

```html
<link rel="stylesheet" href="/css/diff.css">
```

**Step 2: Add diff.js script**

In the script section at the bottom, add `diff.js` BEFORE `modal.js` (before line 117):

```html
<script src="/js/diff.js"></script>
```

The final script section should be:
```html
<script src="/js/dashboard.js"></script>
<script src="/js/diff.js"></script>
<script src="/js/modal.js"></script>
```

**Step 3: Commit**

```bash
git add plugins/kanban-dashboard/public/index.html
git commit -m "Add diff.css and diff.js to index.html load order"
```

---

### Task 10: Build and verify end-to-end

**Files:**
- None (verification only)

**Step 1: Build TypeScript**

Run: `npm run build` in `plugins/kanban-dashboard/`
Expected: Compiles with no errors.

**Step 2: Commit the build**

Note: `dist/` is gitignored so no commit needed for the build output.

**Step 3: Final verification checklist**

- [ ] Dashboard loads in browser with no console errors
- [ ] Task cards still render correctly (no regression)
- [ ] Click a card → modal opens with all existing sections intact
- [ ] Files section appears when task has files
- [ ] Files section shows "No project directory configured" when project_dir not set
- [ ] When project_dir is set and files have changes, file list shows with status indicators
- [ ] Clicking a file loads a side-by-side diff view
- [ ] Clicking a different file replaces the previous diff
- [ ] Dependencies section shows "Blocked by" chips with arrows
- [ ] Dependencies section shows "blocked by this" for reverse relationships
- [ ] Clicking a dependency chip opens that task's modal
- [ ] Escape key still closes the modal
