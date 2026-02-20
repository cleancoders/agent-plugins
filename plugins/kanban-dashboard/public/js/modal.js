let currentModalTask = null;

function openModal(taskId) {
  const task = allTasks.find(t => String(t.id) === String(taskId));
  if (!task) return;

  document.getElementById('modal-id').textContent = '#' + task.id;
  const statusEl = document.getElementById('modal-status');
  statusEl.textContent = task.status.replace('_', ' ');
  statusEl.className = 'modal-status ' + task.status;
  document.getElementById('modal-title').textContent = task.title;

  let html = '';

  // Agent
  html += `<div class="modal-section">
    <div class="modal-section-title">Agent</div>
    <div class="modal-agent">
      <span class="modal-agent-dot" style="background:${task.agent_color}"></span>
      ${task.agent}
    </div>
  </div>`;

  // Progress
  const progress = task.progress || 0;
  html += `<div class="modal-section">
    <div class="modal-section-title">Progress</div>
    <div class="modal-progress-bar">
      <div class="modal-progress-fill" style="width:${Math.round(progress * 100)}%;background:${task.agent_color}"></div>
    </div>
    <div class="modal-progress-label">${Math.round(progress * 100)}% complete</div>
  </div>`;

  // Severity
  if ((task.high || 0) + (task.medium || 0) + (task.low || 0) > 0) {
    html += `<div class="modal-section">
      <div class="modal-section-title">Findings</div>
      <div class="modal-badges">${renderBadges(task)}</div>
    </div>`;
  }

  // Messages log
  const messages = task.messages || [];
  if (messages.length > 0) {
    html += `<div class="modal-section">
      <div class="modal-section-title">Messages</div>
      <div class="modal-messages-log">
        ${messages.slice().reverse().map(m =>
          `<div class="modal-message-entry">
            <span class="log-time">${m.time || ''}</span>
            <span class="log-msg">${m.text || ''}</span>
          </div>`
        ).join('')}
      </div>
    </div>`;
  } else if (task.message) {
    html += `<div class="modal-section">
      <div class="modal-section-title">Messages</div>
      <div class="modal-message">${task.message}</div>
    </div>`;
  }

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

  // Subtasks
  if (task.subtasks && task.subtasks.length > 0) {
    const doneSubs = task.subtasks_done || [];
    html += `<div class="modal-section">
      <div class="modal-section-title">Subtasks</div>
      <div class="modal-subtask-list">
        ${task.subtasks.map(st => {
          const isDone = doneSubs.includes(st);
          return `<div class="modal-subtask ${isDone ? 'done' : ''}">
            <span class="modal-subtask-icon">${isDone ? '&#10003;' : '&#9675;'}</span>
            <span>${st}</span>
          </div>`;
        }).join('')}
      </div>
    </div>`;
  }

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

  // Agent activity log
  const agentLogs = allLogEntries.filter(e => e.agent === task.agent);
  html += `<div class="modal-section">
    <div class="modal-section-title">Agent Activity</div>`;
  if (agentLogs.length > 0) {
    html += agentLogs.slice(-30).reverse().map(e =>
      `<div class="modal-log-entry">
        <span class="log-time">${e.time || ''}</span>
        <span class="log-msg">${e.message || ''}</span>
      </div>`
    ).join('');
  } else {
    html += `<div class="modal-empty">No activity recorded yet</div>`;
  }
  html += `</div>`;

  document.getElementById('modal-body').innerHTML = html;
  document.getElementById('task-modal').classList.add('open');

  // Load file diffs async after modal is open
  if (task.files && task.files.length > 0) {
    loadFileDiffs(task);
  }
}

async function loadFileDiffs(task) {
  currentModalTask = task;
  const fileListEl = document.getElementById('modal-file-list');
  if (!fileListEl) return;

  const taskFiles = task.files || [];

  function renderFileList(files) {
    fileListEl.innerHTML = files.map(f =>
      `<div class="diff-file-row" data-file="${escapeHtml(f.path)}" onclick="loadSingleDiff(this, '${escapeHtml(f.path)}')">
        ${f.status ? `<span class="diff-file-status ${f.status}">${f.status}</span>` : ''}
        <span class="diff-file-path">${escapeHtml(f.path)}</span>
      </div>`
    ).join('');
  }

  try {
    const res = await fetch('/api/files?task_id=' + encodeURIComponent(task.id));
    const data = await res.json();
    const apiFiles = (!data.error && data.files && data.files.length > 0) ? data.files : null;

    if (apiFiles) {
      renderFileList(apiFiles);
    } else {
      renderFileList(taskFiles.map(f => ({ path: f })));
    }
  } catch (e) {
    renderFileList(taskFiles.map(f => ({ path: f })));
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
    let url = '/api/diff?file=' + encodeURIComponent(filePath);
    if (currentModalTask) {
      const sr = currentModalTask.start_ref;
      const er = currentModalTask.end_ref;
      // Only pass refs when they bracket meaningful changes (different commits)
      if (sr && er && sr !== er) {
        url += '&start_ref=' + encodeURIComponent(sr);
        url += '&end_ref=' + encodeURIComponent(er);
      } else if (sr && !er) {
        url += '&start_ref=' + encodeURIComponent(sr);
      }
      // When start_ref == end_ref (no commits during task), omit refs so server uses baseline
    }
    const res = await fetch(url);
    const data = await res.json();

    if (data.error) {
      diffViewEl.innerHTML = `<div class="diff-error">${escapeHtml(data.error)}</div>`;
      return;
    }

    diffViewEl.innerHTML = renderDiff(data.diff);
  } catch (e) {
    diffViewEl.innerHTML = '<div class="diff-error">Failed to load diff</div>';
  }
}

function closeModal() {
  document.getElementById('task-modal').classList.remove('open');
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeModal();
});
