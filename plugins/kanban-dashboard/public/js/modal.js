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

  // Current message
  if (task.message) {
    html += `<div class="modal-section">
      <div class="modal-section-title">Current Message</div>
      <div class="modal-message">${task.message}</div>
    </div>`;
  }

  // Files
  if (task.files && task.files.length > 0) {
    html += `<div class="modal-section">
      <div class="modal-section-title">Files</div>
      <div class="modal-files">
        ${task.files.map(f => `<span class="file-tag">${f}</span>`).join('')}
      </div>
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

  // Blocked by
  if (task.blocked_by && task.blocked_by.length > 0) {
    html += `<div class="modal-section">
      <div class="modal-section-title">Blocked By</div>
      <div class="modal-blocked-by">${task.blocked_by.map(b => '#' + b).join(', ')}</div>
    </div>`;
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
}

function closeModal() {
  document.getElementById('task-modal').classList.remove('open');
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeModal();
});
