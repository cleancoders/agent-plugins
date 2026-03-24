//region Chat State

let chatMessages = [];
let chatPanelOpen = false;
let lastSeenId = 0;
let lastWaitingId = 0;
let notificationPermission = 'default';
let leaderName = 'The orchestrator';

//endregion

//region Notification

function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission().then(p => { notificationPermission = p; });
  }
}

function showNotification() {
  if (!('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;
  if (document.hasFocus() && chatPanelOpen) return;
  const n = new Notification(`${leaderName} needs your input`, {
    icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">💬</text></svg>',
  });
  n.onclick = () => {
    window.focus();
    openChatPanel();
    n.close();
  };
}

//endregion

//region Rendering

function renderChatMessages() {
  const container = document.getElementById('chat-messages');
  const empty = document.getElementById('chat-empty');
  if (!container || !empty) return;
  if (chatMessages.length === 0) {
    empty.style.display = '';
    return;
  }
  empty.style.display = 'none';

  const html = chatMessages.map(m => {
    const cls = m.sender === 'agent' ? 'agent' : 'user';
    const waitCls = m.waiting && !m.answered ? ' waiting-question' : '';
    const time = m.timestamp ? new Date(m.timestamp).toLocaleTimeString() : '';
    return `<div class="chat-msg ${cls}${waitCls}">
      <div>${escapeHtml(m.text)}</div>
      <div class="chat-msg-time">${time}</div>
    </div>`;
  }).join('');
  container.innerHTML = html;
  container.scrollTop = container.scrollHeight;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function updateChatBadge() {
  const badge = document.getElementById('chat-badge');
  const unread = chatMessages.filter(m => m.id > lastSeenId).length;
  badge.textContent = chatPanelOpen ? '' : (unread > 0 ? String(unread) : '');
}

function updateWaitingState(waiting) {
  const bubble = document.getElementById('chat-bubble');
  const indicator = document.getElementById('chat-waiting');
  const input = document.getElementById('chat-input');

  if (waiting) {
    bubble.classList.add('waiting');
    indicator.classList.add('visible');
    input.classList.add('highlight');
  } else {
    bubble.classList.remove('waiting');
    indicator.classList.remove('visible');
    input.classList.remove('highlight');
  }
}

//endregion

//region Panel Controls

function openChatPanel() {
  chatPanelOpen = true;
  document.getElementById('chat-panel').classList.add('open');
  lastSeenId = chatMessages.length > 0 ? chatMessages[chatMessages.length - 1].id : 0;
  updateChatBadge();
  const input = document.getElementById('chat-input');
  input.focus();
  const container = document.getElementById('chat-messages');
  container.scrollTop = container.scrollHeight;
}

function closeChatPanel() {
  chatPanelOpen = false;
  document.getElementById('chat-panel').classList.remove('open');
}

//endregion

//region Send Message

async function sendChatMessage() {
  const input = document.getElementById('chat-input');
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  input.style.height = 'auto';

  try {
    await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    pollChat();
  } catch (e) {
    console.warn('[chat] Failed to send:', e);
  }
}

//endregion

//region Polling

async function pollChat() {
  try {
    const res = await fetch('/api/chat');
    const data = await res.json();

    if (data.messages) {
      const prevWaiting = chatMessages.filter(m => m.waiting && !m.answered);
      chatMessages = data.messages;
      renderChatMessages();
      updateChatBadge();
      updateWaitingState(data.waiting);

      // Check for new waiting message to trigger notification + auto-open
      if (data.waiting) {
        const currentWaiting = chatMessages.filter(m => m.waiting && !m.answered);
        const oldestPending = currentWaiting[0];
        if (oldestPending && oldestPending.id !== lastWaitingId) {
          lastWaitingId = oldestPending.id;
          showNotification();
          if (!chatPanelOpen) openChatPanel();
        }
      }
    }

    // Update leader name from status config
    if (window._dashboardConfig && window._dashboardConfig.leader) {
      leaderName = window._dashboardConfig.leader;
    }
  } catch (e) {
    // Silently ignore — dashboard may not be ready
  }
}

//endregion

//region Event Listeners

document.getElementById('chat-bubble')?.addEventListener('click', () => {
  if (chatPanelOpen) closeChatPanel();
  else openChatPanel();
  requestNotificationPermission();
});

document.getElementById('chat-close')?.addEventListener('click', closeChatPanel);

document.getElementById('chat-send')?.addEventListener('click', sendChatMessage);

document.getElementById('chat-input')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendChatMessage();
  }
});

// Auto-resize textarea
document.getElementById('chat-input')?.addEventListener('input', (e) => {
  const el = e.target;
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 80) + 'px';
});

//endregion

// Poll frequently for responsive chat
setInterval(pollChat, 500);
pollChat();
