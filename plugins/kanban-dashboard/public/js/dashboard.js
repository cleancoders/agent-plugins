const startTime = Date.now();
let prevTaskMap = {};
let allTasks = [];
let allLogEntries = [];

function elapsed() {
  const s = Math.floor((Date.now() - startTime) / 1000);
  const h = String(Math.floor(s / 3600)).padStart(2, '0');
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const sec = String(s % 60).padStart(2, '0');
  return `${h}:${m}:${sec}`;
}

function renderBadges(task) {
  let html = '';
  if (task.high > 0) html += `<span class="badge badge-high">H:${task.high}</span>`;
  if (task.medium > 0) html += `<span class="badge badge-medium">M:${task.medium}</span>`;
  if (task.low > 0) html += `<span class="badge badge-low">L:${task.low}</span>`;
  return html;
}

function renderSubtasks(task) {
  if (!task.subtasks || task.subtasks.length === 0) return '';
  const doneSubs = task.subtasks_done || [];
  const items = task.subtasks.map(st => {
    const isDone = doneSubs.includes(st);
    return `<div class="subtask ${isDone ? 'done' : ''}">
      <span class="subtask-icon">${isDone ? '&#10003;' : '&#9675;'}</span>
      <span>${st}</span>
    </div>`;
  }).join('');
  return `<div class="subtask-list">${items}</div>`;
}

function renderCard(task) {
  const progress = task.progress || 0;
  const isNew = !prevTaskMap[task.id] || prevTaskMap[task.id].status !== task.status;
  return `<div class="card ${task.status} ${isNew ? 'card-new' : ''}" id="card-${task.id}"
               style="--agent-color: ${task.agent_color}; cursor:pointer"
               onclick="openModal('${task.id}')">
    <div class="card-top">
      <span class="card-id">#${task.id}</span>
      <div class="severity-badges">${renderBadges(task)}</div>
    </div>
    <div class="card-title">${task.title}</div>
    <div class="card-agent">
      <span class="card-agent-dot" style="background:${task.agent_color}"></span>
      ${task.agent}
    </div>
    ${task.blocked_by && task.blocked_by.length > 0 ? `<div class="card-blocked-by">Blocked by: ${task.blocked_by.map(id => '#' + id).join(', ')}</div>` : ''}
    <div class="card-message">${task.message || ''}</div>
    <div class="card-progress-bar">
      <div class="card-progress-fill" style="width:${Math.round(progress * 100)}%;background:${task.agent_color}"></div>
    </div>
    <div class="card-files">
      ${(task.files || []).map(f => `<span class="file-tag">${f}</span>`).join('')}
    </div>
    ${task.status === 'in_progress' ? renderSubtasks(task) : ''}
  </div>`;
}

function renderAgentBar(tasks) {
  const bar = document.getElementById('agent-bar');
  let html = '<span class="agent-bar-label">Agents</span>';
  const seen = new Set();
  tasks.forEach(t => {
    if (seen.has(t.agent)) return;
    seen.add(t.agent);
    const state = t.status === 'in_progress' ? 'active' : (t.status === 'done' ? 'done' : 'idle');
    html += `<span class="agent-chip ${state}">
      <span class="agent-dot ${state}" style="background:${t.agent_color}"></span>
      ${t.agent}
    </span>`;
  });
  bar.innerHTML = html;
}

function renderBoard(tasks) {
  allTasks = tasks;
  const columns = { blocked: [], ready: [], in_progress: [], done: [] };
  tasks.forEach(t => {
    const col = columns[t.status] || columns.ready;
    col.push(t);
  });

  ['blocked', 'ready', 'in_progress', 'done'].forEach(status => {
    const colId = status === 'in_progress' ? 'progress' : status;
    const container = document.getElementById(`cards-${colId}`);
    const countEl = document.getElementById(`count-${colId}`);
    const items = columns[status];
    countEl.textContent = items.length;
    if (items.length === 0) {
      container.innerHTML = `<div class="empty-column">${
        status === 'done' ? 'Completed tasks appear here' :
        status === 'in_progress' ? 'Agents working...' :
        status === 'blocked' ? 'Waiting on dependencies' :
        'No tasks queued'
      }</div>`;
    } else {
      container.innerHTML = items.map(renderCard).join('');
    }
  });

  // Stats
  const active = tasks.filter(t => t.status === 'in_progress').length;
  const done = tasks.filter(t => t.status === 'done').length;
  document.getElementById('stat-agents').textContent = active;
  document.getElementById('stat-done').textContent = done;
  document.getElementById('stat-total').textContent = tasks.length;

  // Dynamic findings total
  const findings = tasks.reduce((sum, t) => sum + (t.high || 0) + (t.medium || 0) + (t.low || 0), 0);
  document.getElementById('stat-findings').textContent = findings;

  // Progress
  const pct = tasks.length > 0 ? Math.round((done / tasks.length) * 100) : 0;
  document.getElementById('progress-fill').style.width = pct + '%';
  document.getElementById('progress-text').textContent = `${pct}% complete (${done}/${tasks.length} tasks)`;

  // Completion banner
  const banner = document.getElementById('completion-banner');
  if (tasks.length > 0 && done === tasks.length) {
    banner.style.display = 'block';
    document.getElementById('completion-time').textContent = 'Completed in ' + elapsed();
  } else {
    banner.style.display = 'none';
  }

  // Save state for diff
  prevTaskMap = {};
  tasks.forEach(t => prevTaskMap[t.id] = { status: t.status });
}

async function fetchLog() {
  try {
    const res = await fetch('/api/log');
    const data = await res.json();
    const el = document.getElementById('log-entries');
    if (data.entries) allLogEntries = data.entries;
    if (data.entries && data.entries.length > 0) {
      el.innerHTML = data.entries.slice(-20).reverse().map(e =>
        `<div class="log-entry">
          <span class="log-time">${e.time || ''}</span>
          <span class="log-agent" style="color:${e.color || 'var(--text-muted)'}">${e.agent || ''}</span>
          <span>${e.message || ''}</span>
        </div>`
      ).join('');
    }
  } catch(e) {}
}

async function poll() {
  try {
    const res = await fetch('/api/status');
    const data = await res.json();
    // Update title from config
    if (data.config) {
      const titleEl = document.getElementById('dashboard-title');
      const subtitleEl = document.getElementById('dashboard-subtitle');
      if (titleEl && data.config.title) {
        titleEl.childNodes[0].textContent = data.config.title + ' ';
      }
      if (subtitleEl && data.config.subtitle) {
        subtitleEl.textContent = '/ ' + data.config.subtitle;
      }
    }
    document.getElementById('connecting-overlay').classList.add('hidden');
    if (data.tasks) {
      renderBoard(data.tasks);
      renderAgentBar(data.tasks);
    }
  } catch (e) {
    console.warn('Poll failed:', e);
    document.getElementById('connecting-overlay').classList.remove('hidden');
  }
  document.getElementById('elapsed').textContent = elapsed();
}

// Initial render
poll();
fetchLog();

// Poll every 1.5 seconds
setInterval(poll, 1500);
setInterval(fetchLog, 3000);
setInterval(() => {
  document.getElementById('elapsed').textContent = elapsed();
}, 1000);
