const startTime = Date.now();
let prevTaskMap = {};
let allTasks = [];
let allLogEntries = [];

// Signal tracking
let pendingPokes = {}; // { "agent-name": { time: Date.now(), action: "poke" } }

async function sendSignal(agent, action, event) {
  if (event) {
    event.stopPropagation();
    event.preventDefault();
  }
  console.log('[signal] sending', action, 'to', agent);
  // Visual feedback on the clicked button
  const btn = event && event.currentTarget;
  if (btn) {
    btn.classList.add('sent');
    setTimeout(() => btn.classList.remove('sent'), 600);
  }
  try {
    const res = await fetch('/api/signal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent, action }),
    });
    if (res.ok) {
      console.log('[signal] sent ok:', action, agent);
      pendingPokes[agent] = { time: Date.now(), action };
      // Force immediate re-render so badge appears without waiting for next poll
      poll();
    } else {
      console.warn('[signal] server returned', res.status);
    }
  } catch (e) {
    console.warn('[signal] Failed to send signal:', e);
  }
}

function renderActionButtons(task) {
  if (task.status === 'done') return '';
  const actions = [
    { action: 'poke', icon: '\u{1F4E1}', label: 'Poke' },
  ];
  if (task.status === 'in_progress') {
    actions.push({ action: 'shake', icon: '\u26A1', label: 'Shake' });
    actions.push({ action: 'skip', icon: '\u23ED', label: 'Skip' });
    actions.push({ action: 'check_others', icon: '\u{1F440}', label: 'Check' });
  }
  return `<div class="card-actions">${actions.map(a =>
    `<button class="card-action-btn" onclick="sendSignal('${task.agent}', '${a.action}', event)" title="${a.label}">${a.icon} ${a.label}</button>`
  ).join('')}</div>`;
}

function renderPokeBadge(task) {
  const poke = pendingPokes[task.agent];
  if (!poke) return '';
  const elapsed = Math.floor((Date.now() - poke.time) / 1000);
  if (elapsed > 60) {
    delete pendingPokes[task.agent];
    return '';
  }
  const cls = elapsed > 30 ? 'poke-badge no-response' : 'poke-badge';
  return `<span class="${cls}">${elapsed > 30 ? 'No response' : 'Poked'} ${elapsed}s ago</span>`;
}

//region Active Subtask Detection

const STOP_WORDS = new Set(['the','and','for','with','that','this','from','are','was','has','have','will','been','into','than','its','all','but','not','can','did','get','got','set','use','new','now','also','each','when','then','them','they','what','which','where','how','our','out','one','two']);

function tokenize(text) {
  if (!text) return [];
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length >= 3 && !STOP_WORDS.has(w));
}

function findActiveSubtask(message, subtasks, subtasksDone) {
  if (!message || !subtasks || subtasks.length === 0) return -1;
  const doneSubs = subtasksDone || [];
  const msgTokens = new Set(tokenize(message));
  if (msgTokens.size === 0) return -1;

  let bestIdx = -1;
  let bestScore = 0;
  const threshold = 0.3;

  for (let i = 0; i < subtasks.length; i++) {
    if (doneSubs.includes(subtasks[i])) continue;
    const subTokens = tokenize(subtasks[i]);
    if (subTokens.length === 0) continue;
    const matches = subTokens.filter(t => msgTokens.has(t)).length;
    const score = matches / subTokens.length;
    if (score > bestScore && score >= threshold) {
      bestScore = score;
      bestIdx = i;
    }
  }

  return bestIdx;
}

//endregion

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
  const activeIdx = task.status === 'in_progress' ? findActiveSubtask(task.message, task.subtasks, doneSubs) : -1;
  const items = task.subtasks.map((st, i) => {
    const isDone = doneSubs.includes(st);
    const isActive = i === activeIdx;
    const cls = isDone ? 'done' : (isActive ? 'active' : '');
    const icon = isDone ? '&#10003;' : (isActive ? '<span class="active-dot"></span>' : '&#9675;');
    return `<div class="subtask ${cls}">
      <span class="subtask-icon">${icon}</span>
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
      <div class="card-top-right">
        ${task.blocked_by && task.blocked_by.length > 0 ? `<div class="blocked-badges">${task.blocked_by.map(id => `<span class="badge badge-blocked">#${id}</span>`).join('')}</div>` : ''}
        <div class="severity-badges">${renderBadges(task)}</div>
        ${renderPokeBadge(task)}
      </div>
    </div>
    <div class="card-title">${task.title}</div>
    <div class="card-agent">
      <span class="card-agent-dot" style="background:${task.agent_color}"></span>
      ${task.agent}
    </div>
    <div class="card-message">${task.message || ''}</div>
    <div class="card-progress-bar">
      <div class="card-progress-fill" style="width:${Math.round(progress * 100)}%;background:${task.agent_color}"></div>
    </div>
    ${task.status === 'in_progress' ? renderSubtasks(task) : ''}
    ${renderActionButtons(task)}
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
      <button class="agent-poke-btn" onclick="sendSignal('${t.agent}', 'poke', event)" title="Poke">\u{1F4E1}</button>
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
  tasks.forEach(t => prevTaskMap[t.id] = { status: t.status, message: t.message });
  updateTabCounts();
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
      const metaEl = document.getElementById('dashboard-meta');
      if (metaEl) {
        const parts = [];
        if (data.config.project) parts.push(data.config.project);
        if (data.config.leader) parts.push('led by ' + data.config.leader);
        metaEl.textContent = parts.join(' \u2022 ');
        metaEl.style.display = parts.length > 0 ? '' : 'none';
      }
      if (typeof window !== 'undefined') window._dashboardConfig = data.config;
    }
    document.getElementById('connecting-overlay').classList.add('hidden');
    if (data.tasks) {
      const prevMap = { ...prevTaskMap };
      renderBoard(data.tasks);
      renderAgentBar(data.tasks);
      // Clear poke badges for agents that responded
      data.tasks.forEach(t => {
        const prev = prevMap[t.id];
        if (prev && pendingPokes[t.agent]) {
          if (prev.message !== t.message || prev.status !== t.status) {
            delete pendingPokes[t.agent];
          }
        }
      });
    }
  } catch (e) {
    console.warn('Poll failed:', e);
    document.getElementById('connecting-overlay').classList.remove('hidden');
  }
  document.getElementById('elapsed').textContent = elapsed();
}

//region Mobile Responsive

const mobileQuery = window.matchMedia('(max-width: 767px)');
const COLUMN_ORDER = ['blocked', 'ready', 'in_progress', 'done'];
let activeColumnIndex = 2; // default to in_progress

function colIdFromStatus(status) {
  return status === 'in_progress' ? 'progress' : status;
}

function switchToColumn(index) {
  if (index < 0 || index >= COLUMN_ORDER.length) return;
  activeColumnIndex = index;
  const status = COLUMN_ORDER[index];
  const colId = colIdFromStatus(status);

  document.querySelectorAll('.column-tab').forEach(tab => tab.classList.remove('active'));
  document.querySelector(`.column-tab[data-column="${status}"]`)?.classList.add('active');

  document.querySelectorAll('.column').forEach(col => col.classList.remove('mobile-active'));
  document.getElementById(`col-${colId}`)?.classList.add('mobile-active');
}

function updateTabCounts() {
  COLUMN_ORDER.forEach(status => {
    const colId = colIdFromStatus(status);
    const count = document.getElementById(`count-${colId}`)?.textContent || '0';
    const tabCount = document.getElementById(`tab-count-${colId}`);
    if (tabCount) tabCount.textContent = count;
  });
}

function handleMobileLayout(e) {
  // 1. Relocate elapsed timer
  const elapsedEl = document.querySelector('.elapsed');
  const topRow = document.querySelector('.header-top-row');
  const headerStats = document.querySelector('.header-stats');
  if (elapsedEl && topRow && headerStats) {
    if (e.matches) topRow.appendChild(elapsedEl);
    else headerStats.appendChild(elapsedEl);
  }

  // 2. Set sticky top for column tabs
  const columnTabs = document.getElementById('column-tabs');
  const headerEl = document.querySelector('header');
  if (columnTabs && headerEl) {
    if (e.matches) columnTabs.style.top = headerEl.offsetHeight + 'px';
    else columnTabs.style.top = '';
  }

  // 3. Handle column visibility
  if (e.matches) {
    switchToColumn(activeColumnIndex);
  } else {
    document.querySelectorAll('.column').forEach(col => col.classList.remove('mobile-active'));
  }
}

// Tab click handler
document.getElementById('column-tabs')?.addEventListener('click', (e) => {
  const tab = e.target.closest('.column-tab');
  if (!tab) return;
  const status = tab.dataset.column;
  const index = COLUMN_ORDER.indexOf(status);
  if (index !== -1) switchToColumn(index);
});

// Swipe detection on .board
let touchStartX = 0, touchStartY = 0;
const boardEl = document.querySelector('.board');

boardEl?.addEventListener('touchstart', (e) => {
  touchStartX = e.touches[0].clientX;
  touchStartY = e.touches[0].clientY;
}, { passive: true });

boardEl?.addEventListener('touchend', (e) => {
  const dx = e.changedTouches[0].clientX - touchStartX;
  const dy = e.changedTouches[0].clientY - touchStartY;
  if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
    if (dx < 0) switchToColumn(activeColumnIndex + 1);
    else switchToColumn(activeColumnIndex - 1);
  }
}, { passive: true });

// Log FAB
document.getElementById('log-fab')?.addEventListener('click', () => {
  document.getElementById('log-panel')?.classList.toggle('mobile-open');
  document.getElementById('log-backdrop')?.classList.toggle('open');
});
document.getElementById('log-backdrop')?.addEventListener('click', () => {
  document.getElementById('log-panel')?.classList.remove('mobile-open');
  document.getElementById('log-backdrop')?.classList.remove('open');
});

// Initialize on load
mobileQuery.addEventListener('change', handleMobileLayout);
handleMobileLayout(mobileQuery);

//endregion

// Initial render
poll();
fetchLog();

// Poll every 1.5 seconds
setInterval(poll, 1500);
setInterval(fetchLog, 3000);
setInterval(() => {
  document.getElementById('elapsed').textContent = elapsed();
}, 1000);
