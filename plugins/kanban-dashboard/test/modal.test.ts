import { readFileSync } from 'fs';
import { runInNewContext } from 'vm';
import { resolve } from 'path';
import { describe, it, expect, beforeEach, vi } from 'vitest';

function createMockElement() {
  const _classes = new Set<string>();
  return {
    innerHTML: '',
    textContent: '',
    className: '',
    style: {} as Record<string, string>,
    classList: {
      add: vi.fn((cls: string) => _classes.add(cls)),
      remove: vi.fn((cls: string) => _classes.delete(cls)),
      contains: vi.fn((cls: string) => _classes.has(cls)),
    },
  };
}

type MockElement = ReturnType<typeof createMockElement>;

function loadModal(options?: {
  tasks?: any[];
  logEntries?: any[];
  fetchResponse?: any;
  fetchError?: boolean;
}) {
  const code = readFileSync(resolve(__dirname, '../public/js/modal.js'), 'utf-8');

  const elements: Record<string, MockElement> = {};
  const elementIds = [
    'modal-id', 'modal-status', 'modal-title', 'modal-body', 'task-modal',
    'modal-file-list', 'diff-modal', 'diff-modal-main', 'diff-modal-filename',
    'diff-modal-sidebar',
  ];
  for (const id of elementIds) {
    elements[id] = createMockElement();
  }

  let keydownHandler: ((e: any) => void) | null = null;
  let querySelectorAllResult: any[] = [];

  const fetchMock = options?.fetchError
    ? vi.fn().mockRejectedValue(new Error('Network error'))
    : vi.fn().mockResolvedValue({
        json: () => Promise.resolve(options?.fetchResponse ?? { files: [] }),
      });

  const context: Record<string, unknown> = {
    // Globals from dashboard.js
    allTasks: options?.tasks ?? [],
    allLogEntries: options?.logEntries ?? [],
    renderBadges: (task: any) => {
      let html = '';
      if (task.high > 0) html += `<span class="badge badge-high">H:${task.high}</span>`;
      if (task.medium > 0) html += `<span class="badge badge-medium">M:${task.medium}</span>`;
      if (task.low > 0) html += `<span class="badge badge-low">L:${task.low}</span>`;
      return html;
    },
    findActiveSubtask: () => -1,
    // Globals from diff.js
    escapeHtml: (s: string) =>
      String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;'),
    renderDiff: (text: string) =>
      `<div class="diff-container">${text || 'No changes'}</div>`,
    // DOM
    document: {
      getElementById: (id: string) => {
        if (!elements[id]) elements[id] = createMockElement();
        return elements[id];
      },
      addEventListener: (event: string, handler: Function) => {
        if (event === 'keydown') keydownHandler = handler as any;
      },
      querySelectorAll: (_sel: string) => querySelectorAllResult,
    },
    // Fetch mock
    fetch: fetchMock,
    encodeURIComponent,
    String,
    Math,
    Promise,
    Array,
    console: { warn: vi.fn(), log: vi.fn() },
  };

  runInNewContext(code, context);

  return {
    context,
    elements,
    fetchMock,
    keydownHandler: () => keydownHandler,
    setQuerySelectorResult: (result: any[]) => { querySelectorAllResult = result; },
    openModal: context.openModal as (taskId: string) => void,
    loadFileDiffs: context.loadFileDiffs as (task: any) => Promise<void>,
    openDiffModal: context.openDiffModal as (filePath: string) => void,
    loadDiffInModal: context.loadDiffInModal as (filePath: string) => Promise<void>,
    switchDiffFile: context.switchDiffFile as (rowEl: any, filePath: string) => void,
    closeModal: context.closeModal as () => void,
    closeDiffModal: context.closeDiffModal as () => void,
  };
}

function makeTask(overrides: Record<string, any> = {}) {
  return {
    id: 'T-1',
    status: 'in_progress',
    title: 'Implement feature X',
    agent: 'agent-1',
    agent_color: '#3b82f6',
    progress: 0.5,
    high: 0,
    medium: 0,
    low: 0,
    message: '',
    files: [],
    subtasks: [],
    subtasks_done: [],
    blocked_by: [],
    ...overrides,
  };
}

describe('openModal', () => {
  it('populates modal-id with #<id>', () => {
    const task = makeTask({ id: 'T-42' });
    const { openModal, elements } = loadModal({ tasks: [task] });

    openModal('T-42');

    expect(elements['modal-id'].textContent).toBe('#T-42');
  });

  it('sets modal-status text, replacing underscore with space', () => {
    const task = makeTask({ status: 'in_progress' });
    const { openModal, elements } = loadModal({ tasks: [task] });

    openModal('T-1');

    expect(elements['modal-status'].textContent).toBe('in progress');
  });

  it('sets modal-status className to include task status', () => {
    const task = makeTask({ status: 'blocked' });
    const { openModal, elements } = loadModal({ tasks: [task] });

    openModal('T-1');

    expect(elements['modal-status'].className).toBe('modal-status blocked');
  });

  it('sets modal-title to the task title', () => {
    const task = makeTask({ title: 'My Important Task' });
    const { openModal, elements } = loadModal({ tasks: [task] });

    openModal('T-1');

    expect(elements['modal-title'].textContent).toBe('My Important Task');
  });

  it('shows agent section with agent name and color', () => {
    const task = makeTask({ agent: 'claude-bot', agent_color: '#ff5500' });
    const { openModal, elements } = loadModal({ tasks: [task] });

    openModal('T-1');

    const body = elements['modal-body'].innerHTML;
    expect(body).toContain('Agent');
    expect(body).toContain('claude-bot');
    expect(body).toContain('background:#ff5500');
  });

  it('shows progress section with percentage', () => {
    const task = makeTask({ progress: 0.75 });
    const { openModal, elements } = loadModal({ tasks: [task] });

    openModal('T-1');

    const body = elements['modal-body'].innerHTML;
    expect(body).toContain('Progress');
    expect(body).toContain('75% complete');
    expect(body).toContain('width:75%');
  });

  it('shows progress as 0% when progress is missing', () => {
    const task = makeTask({ progress: undefined });
    const { openModal, elements } = loadModal({ tasks: [task] });

    openModal('T-1');

    const body = elements['modal-body'].innerHTML;
    expect(body).toContain('0% complete');
  });

  it('shows findings section when task has severity values', () => {
    const task = makeTask({ high: 3, medium: 1, low: 2 });
    const { openModal, elements } = loadModal({ tasks: [task] });

    openModal('T-1');

    const body = elements['modal-body'].innerHTML;
    expect(body).toContain('Findings');
    expect(body).toContain('badge-high');
    expect(body).toContain('H:3');
  });

  it('hides findings section when no severity values', () => {
    const task = makeTask({ high: 0, medium: 0, low: 0 });
    const { openModal, elements } = loadModal({ tasks: [task] });

    openModal('T-1');

    const body = elements['modal-body'].innerHTML;
    expect(body).not.toContain('Findings');
  });

  it('shows messages log when task has messages array', () => {
    const task = makeTask({
      messages: [
        { time: '10:00', text: 'Starting work' },
        { time: '10:05', text: 'Tests passing' },
      ],
    });
    const { openModal, elements } = loadModal({ tasks: [task] });

    openModal('T-1');

    const body = elements['modal-body'].innerHTML;
    expect(body).toContain('Messages');
    expect(body).toContain('modal-messages-log');
    expect(body).toContain('Starting work');
    expect(body).toContain('Tests passing');
  });

  it('shows messages in reverse chronological order', () => {
    const task = makeTask({
      messages: [
        { time: '10:00', text: 'First' },
        { time: '10:05', text: 'Second' },
      ],
    });
    const { openModal, elements } = loadModal({ tasks: [task] });

    openModal('T-1');

    const body = elements['modal-body'].innerHTML;
    const firstIdx = body.indexOf('First');
    const secondIdx = body.indexOf('Second');
    expect(secondIdx).toBeLessThan(firstIdx);
  });

  it('shows timestamps in messages log', () => {
    const task = makeTask({
      messages: [{ time: '14:30:00', text: 'Update' }],
    });
    const { openModal, elements } = loadModal({ tasks: [task] });

    openModal('T-1');

    const body = elements['modal-body'].innerHTML;
    expect(body).toContain('14:30:00');
  });

  it('falls back to single message display when no messages array', () => {
    const task = makeTask({ message: 'Working on tests' });
    const { openModal, elements } = loadModal({ tasks: [task] });

    openModal('T-1');

    const body = elements['modal-body'].innerHTML;
    expect(body).toContain('Messages');
    expect(body).toContain('Working on tests');
    expect(body).toContain('modal-message');
  });

  it('hides message section when no messages array and message is empty', () => {
    const task = makeTask({ message: '' });
    const { openModal, elements } = loadModal({ tasks: [task] });

    openModal('T-1');

    const body = elements['modal-body'].innerHTML;
    expect(body).not.toContain('Messages');
  });

  it('hides message section when no messages array and message is falsy', () => {
    const task = makeTask({ message: null });
    const { openModal, elements } = loadModal({ tasks: [task] });

    openModal('T-1');

    const body = elements['modal-body'].innerHTML;
    expect(body).not.toContain('Messages');
  });

  it('shows files section when task has files', () => {
    const task = makeTask({ status: 'in_progress', files: ['src/app.ts'] });
    const { openModal, elements } = loadModal({ tasks: [task] });

    openModal('T-1');

    const body = elements['modal-body'].innerHTML;
    expect(body).toContain('Files');
    expect(body).toContain('modal-file-list');
  });

  it('hides files section when task has empty files array', () => {
    const task = makeTask({ status: 'in_progress', files: [] });
    const { openModal, elements } = loadModal({ tasks: [task] });

    openModal('T-1');

    const body = elements['modal-body'].innerHTML;
    expect(body).not.toContain('modal-file-list');
  });

  it('hides files section when task has no files field', () => {
    const task = makeTask({ status: 'done' });
    delete task.files;
    const { openModal, elements } = loadModal({ tasks: [task] });

    openModal('T-1');

    const body = elements['modal-body'].innerHTML;
    expect(body).not.toContain('modal-file-list');
  });

  it('shows subtasks section when task has subtasks', () => {
    const task = makeTask({ subtasks: ['Write tests', 'Implement logic'] });
    const { openModal, elements } = loadModal({ tasks: [task] });

    openModal('T-1');

    const body = elements['modal-body'].innerHTML;
    expect(body).toContain('Subtasks');
    expect(body).toContain('Write tests');
    expect(body).toContain('Implement logic');
  });

  it('hides subtasks section when no subtasks', () => {
    const task = makeTask({ subtasks: [] });
    const { openModal, elements } = loadModal({ tasks: [task] });

    openModal('T-1');

    const body = elements['modal-body'].innerHTML;
    expect(body).not.toContain('Subtasks');
  });

  it('marks done subtasks with checkmark icon', () => {
    const task = makeTask({
      subtasks: ['Write tests', 'Deploy'],
      subtasks_done: ['Write tests'],
    });
    const { openModal, elements } = loadModal({ tasks: [task] });

    openModal('T-1');

    const body = elements['modal-body'].innerHTML;
    // &#10003; is the checkmark character
    expect(body).toContain('&#10003;');
    // The done subtask should have the 'done' class
    expect(body).toContain('modal-subtask done');
  });

  it('marks incomplete subtasks with circle icon', () => {
    const task = makeTask({
      subtasks: ['Pending task'],
      subtasks_done: [],
    });
    const { openModal, elements } = loadModal({ tasks: [task] });

    openModal('T-1');

    const body = elements['modal-body'].innerHTML;
    // &#9675; is the circle character
    expect(body).toContain('&#9675;');
  });

  it('shows dependencies section when blocked_by exists', () => {
    const blocker = makeTask({ id: 'T-0', title: 'Blocker task', status: 'in_progress' });
    const task = makeTask({ id: 'T-1', blocked_by: ['T-0'] });
    const { openModal, elements } = loadModal({ tasks: [blocker, task] });

    openModal('T-1');

    const body = elements['modal-body'].innerHTML;
    expect(body).toContain('Dependencies');
    expect(body).toContain('Blocked by');
    expect(body).toContain('#T-0');
    expect(body).toContain('Blocker task');
  });

  it('shows "blocked by this" section for downstream tasks', () => {
    const task = makeTask({ id: 'T-1', title: 'Core task' });
    const downstream = makeTask({ id: 'T-2', title: 'Downstream', blocked_by: ['T-1'] });
    const { openModal, elements } = loadModal({ tasks: [task, downstream] });

    openModal('T-1');

    const body = elements['modal-body'].innerHTML;
    expect(body).toContain('Dependencies');
    expect(body).toContain('blocked by this');
    expect(body).toContain('#T-2');
    expect(body).toContain('Downstream');
  });

  it('hides dependencies when none exist', () => {
    const task = makeTask({ blocked_by: [] });
    const { openModal, elements } = loadModal({ tasks: [task] });

    openModal('T-1');

    const body = elements['modal-body'].innerHTML;
    expect(body).not.toContain('Dependencies');
  });

  it('shows agent activity log entries', () => {
    const task = makeTask({ agent: 'agent-1' });
    const logEntries = [
      { agent: 'agent-1', time: '10:00', message: 'Started task' },
      { agent: 'agent-1', time: '10:05', message: 'Running tests' },
      { agent: 'agent-2', time: '10:03', message: 'Other agent log' },
    ];
    const { openModal, elements } = loadModal({ tasks: [task], logEntries });

    openModal('T-1');

    const body = elements['modal-body'].innerHTML;
    expect(body).toContain('Agent Activity');
    expect(body).toContain('Started task');
    expect(body).toContain('Running tests');
    expect(body).not.toContain('Other agent log');
  });

  it('shows "No activity recorded yet" when no logs for agent', () => {
    const task = makeTask({ agent: 'lonely-agent' });
    const { openModal, elements } = loadModal({ tasks: [task], logEntries: [] });

    openModal('T-1');

    const body = elements['modal-body'].innerHTML;
    expect(body).toContain('No activity recorded yet');
  });

  it('adds "open" class to task-modal', () => {
    const task = makeTask();
    const { openModal, elements } = loadModal({ tasks: [task] });

    openModal('T-1');

    expect(elements['task-modal'].classList.add).toHaveBeenCalledWith('open');
  });

  it('returns early without crashing when task not found', () => {
    const { openModal, elements } = loadModal({ tasks: [] });

    expect(() => openModal('nonexistent')).not.toThrow();
    // modal-id should remain unchanged since openModal returned early
    expect(elements['modal-id'].textContent).toBe('');
  });

  it('matches task by string coercion of id', () => {
    const task = makeTask({ id: 42 });
    const { openModal, elements } = loadModal({ tasks: [task] });

    openModal('42');

    expect(elements['modal-id'].textContent).toBe('#42');
  });
});

describe('loadFileDiffs', () => {
  it('renders file rows from API response with status badges', async () => {
    const task = makeTask({ id: 1, files: ['src/app.ts'] });
    const apiResponse = {
      files: [
        { path: 'src/app.ts', status: 'modified' },
        { path: 'src/other.ts', status: 'added' },
      ],
    };
    const { loadFileDiffs, elements } = loadModal({
      tasks: [task],
      fetchResponse: apiResponse,
    });

    await loadFileDiffs(task);

    const fileListHtml = elements['modal-file-list'].innerHTML;
    expect(fileListHtml).toContain('diff-file-row');
    expect(fileListHtml).toContain('src/app.ts');
    expect(fileListHtml).toContain('modified');
    expect(fileListHtml).toContain('src/other.ts');
    expect(fileListHtml).toContain('added');
  });

  it('fetches with task_id query param', async () => {
    const task = makeTask({ id: 42, files: ['src/app.ts'] });
    const { loadFileDiffs, fetchMock } = loadModal({
      tasks: [task],
      fetchResponse: { files: [] },
    });

    await loadFileDiffs(task);

    expect(fetchMock).toHaveBeenCalledWith('/api/files?task_id=42');
  });

  it('falls back to task files when API returns error', async () => {
    const task = makeTask({ id: 1, files: ['src/app.ts', 'src/utils.ts'] });
    const { loadFileDiffs, elements } = loadModal({
      tasks: [task],
      fetchResponse: { error: 'Git not available' },
    });

    await loadFileDiffs(task);

    const fileListHtml = elements['modal-file-list'].innerHTML;
    expect(fileListHtml).toContain('diff-file-row');
    expect(fileListHtml).toContain('src/app.ts');
    expect(fileListHtml).toContain('src/utils.ts');
  });

  it('falls back to task files when API returns empty files', async () => {
    const task = makeTask({ id: 1, files: ['src/app.ts'] });
    const { loadFileDiffs, elements } = loadModal({
      tasks: [task],
      fetchResponse: { files: [] },
    });

    await loadFileDiffs(task);

    const fileListHtml = elements['modal-file-list'].innerHTML;
    expect(fileListHtml).toContain('diff-file-row');
    expect(fileListHtml).toContain('src/app.ts');
  });

  it('falls back to task files on fetch failure', async () => {
    const task = makeTask({ id: 1, files: ['src/app.ts'] });
    const { loadFileDiffs, elements } = loadModal({
      tasks: [task],
      fetchError: true,
    });

    await loadFileDiffs(task);

    const fileListHtml = elements['modal-file-list'].innerHTML;
    expect(fileListHtml).toContain('diff-file-row');
    expect(fileListHtml).toContain('src/app.ts');
  });

  it('returns early when modal-file-list element is missing', async () => {
    const code = readFileSync(resolve(__dirname, '../public/js/modal.js'), 'utf-8');

    const fetchMock = vi.fn();

    const context: Record<string, unknown> = {
      allTasks: [],
      allLogEntries: [],
      renderBadges: () => '',
      findActiveSubtask: () => -1,
      escapeHtml: (s: string) => String(s || ''),
      renderDiff: (text: string) => text || '',
      document: {
        getElementById: (_id: string) => null,
        addEventListener: (event: string, handler: Function) => {},
        querySelectorAll: () => [],
      },
      fetch: fetchMock,
      encodeURIComponent,
      String,
      Math,
      Promise,
      Array,
      console: { warn: vi.fn(), log: vi.fn() },
    };

    runInNewContext(code, context);

    const loadFileDiffs = context.loadFileDiffs as (task: any) => Promise<void>;
    await loadFileDiffs({ id: 1, files: ['src/app.ts'] });

    // fetch should never have been called since fileListEl is null
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('openDiffModal', () => {
  it('hides task modal and shows diff modal', async () => {
    const task = makeTask({ id: 1, files: ['src/app.ts'] });
    const { loadFileDiffs, openDiffModal, elements } = loadModal({
      tasks: [task],
      fetchResponse: { files: [{ path: 'src/app.ts', status: 'M' }] },
    });

    await loadFileDiffs(task);
    openDiffModal('src/app.ts');

    expect(elements['task-modal'].style.display).toBe('none');
    expect(elements['diff-modal'].classList.add).toHaveBeenCalledWith('open');
  });

  it('populates sidebar with file list', async () => {
    const task = makeTask({ id: 1, files: ['src/app.ts', 'src/utils.ts'] });
    const { loadFileDiffs, openDiffModal, elements, fetchMock } = loadModal({
      tasks: [task],
      fetchResponse: { files: [{ path: 'src/app.ts', status: 'M' }, { path: 'src/utils.ts', status: 'A' }] },
    });

    await loadFileDiffs(task);
    // Reset fetch mock to capture the diff fetch
    fetchMock.mockClear();
    fetchMock.mockResolvedValue({ json: () => Promise.resolve({ diff: 'some diff' }) });

    openDiffModal('src/app.ts');

    const sidebar = elements['diff-modal-sidebar'].innerHTML;
    expect(sidebar).toContain('src/app.ts');
    expect(sidebar).toContain('src/utils.ts');
  });

  it('marks selected file as active in sidebar', async () => {
    const task = makeTask({ id: 1, files: ['src/app.ts', 'src/utils.ts'] });
    const { loadFileDiffs, openDiffModal, elements, fetchMock } = loadModal({
      tasks: [task],
      fetchResponse: { files: [{ path: 'src/app.ts', status: 'M' }, { path: 'src/utils.ts', status: 'A' }] },
    });

    await loadFileDiffs(task);
    fetchMock.mockClear();
    fetchMock.mockResolvedValue({ json: () => Promise.resolve({ diff: 'some diff' }) });

    openDiffModal('src/app.ts');

    const sidebar = elements['diff-modal-sidebar'].innerHTML;
    // The first file should have 'active' class
    expect(sidebar).toMatch(/diff-file-row active.*src\/app\.ts/);
    // The second file should NOT have 'active' class
    expect(sidebar).not.toMatch(/diff-file-row active.*src\/utils\.ts/);
  });
});

describe('loadDiffInModal', () => {
  it('sets filename in header', async () => {
    const task = makeTask({ id: 1, files: ['src/app.ts'] });
    const { openModal, loadDiffInModal, elements, fetchMock } = loadModal({
      tasks: [task],
      fetchResponse: { diff: 'some diff' },
    });

    openModal('1');
    fetchMock.mockClear();
    fetchMock.mockResolvedValue({ json: () => Promise.resolve({ diff: 'some diff' }) });

    await loadDiffInModal('src/app.ts');

    expect(elements['diff-modal-filename'].textContent).toBe('src/app.ts');
  });

  it('renders diff content from API', async () => {
    const task = makeTask({ id: 1, files: ['src/app.ts'] });
    const { openModal, loadDiffInModal, elements, fetchMock } = loadModal({
      tasks: [task],
      fetchResponse: { diff: 'some diff text' },
    });

    openModal('1');
    fetchMock.mockClear();
    fetchMock.mockResolvedValue({ json: () => Promise.resolve({ diff: 'some diff text' }) });

    await loadDiffInModal('src/app.ts');

    const diffHtml = elements['diff-modal-main'].innerHTML;
    expect(diffHtml).toContain('diff-container');
    expect(diffHtml).toContain('some diff text');
  });

  it('shows error from API error response', async () => {
    const task = makeTask({ id: 1, files: ['src/app.ts'] });
    const { openModal, loadDiffInModal, elements, fetchMock } = loadModal({
      tasks: [task],
      fetchResponse: { error: 'File not found' },
    });

    openModal('1');
    fetchMock.mockClear();
    fetchMock.mockResolvedValue({ json: () => Promise.resolve({ error: 'File not found' }) });

    await loadDiffInModal('src/missing.ts');

    const diffHtml = elements['diff-modal-main'].innerHTML;
    expect(diffHtml).toContain('diff-error');
    expect(diffHtml).toContain('File not found');
  });

  it('shows "Failed to load diff" on fetch failure', async () => {
    const task = makeTask({ id: 1, files: ['src/app.ts'] });
    const { openModal, loadDiffInModal, elements, fetchMock } = loadModal({
      tasks: [task],
    });

    openModal('1');
    fetchMock.mockClear();
    fetchMock.mockRejectedValue(new Error('Network error'));

    await loadDiffInModal('src/app.ts');

    const diffHtml = elements['diff-modal-main'].innerHTML;
    expect(diffHtml).toContain('Failed to load diff');
  });

  it('calls fetch with the correct URL', async () => {
    const task = makeTask({ id: 1, files: ['src/app.ts'] });
    const { openModal, loadDiffInModal, fetchMock } = loadModal({
      tasks: [task],
      fetchResponse: { diff: 'some diff' },
    });

    openModal('1');
    fetchMock.mockClear();
    fetchMock.mockResolvedValue({ json: () => Promise.resolve({ diff: 'some diff' }) });

    await loadDiffInModal('src/my file.ts');

    expect(fetchMock).toHaveBeenCalledWith('/api/diff?file=' + encodeURIComponent('src/my file.ts'));
  });

  it('includes start_ref and end_ref when they differ', async () => {
    const task = makeTask({ id: 1, files: ['src/app.ts'], start_ref: 'abc123', end_ref: 'def456' });
    const { openModal, loadDiffInModal, fetchMock } = loadModal({
      tasks: [task],
      fetchResponse: { diff: 'some diff' },
    });

    openModal('1');
    fetchMock.mockClear();
    fetchMock.mockResolvedValue({ json: () => Promise.resolve({ diff: 'some diff' }) });

    await loadDiffInModal('src/app.ts');

    const calledUrl = fetchMock.mock.calls[0][0];
    expect(calledUrl).toContain('start_ref=' + encodeURIComponent('abc123'));
    expect(calledUrl).toContain('end_ref=' + encodeURIComponent('def456'));
  });

  it('omits refs when start_ref equals end_ref', async () => {
    const task = makeTask({ id: 1, files: ['src/app.ts'], start_ref: 'same111', end_ref: 'same111' });
    const { openModal, loadDiffInModal, fetchMock } = loadModal({
      tasks: [task],
      fetchResponse: { diff: 'some diff' },
    });

    openModal('1');
    fetchMock.mockClear();
    fetchMock.mockResolvedValue({ json: () => Promise.resolve({ diff: 'some diff' }) });

    await loadDiffInModal('src/app.ts');

    const calledUrl = fetchMock.mock.calls[0][0];
    expect(calledUrl).not.toContain('start_ref');
    expect(calledUrl).not.toContain('end_ref');
    expect(calledUrl).toBe('/api/diff?file=' + encodeURIComponent('src/app.ts'));
  });

  it('includes only start_ref when end_ref is absent', async () => {
    const task = makeTask({ id: 1, files: ['src/app.ts'], start_ref: 'abc123' });
    delete task.end_ref;
    const { openModal, loadDiffInModal, fetchMock } = loadModal({
      tasks: [task],
      fetchResponse: { diff: 'some diff' },
    });

    openModal('1');
    fetchMock.mockClear();
    fetchMock.mockResolvedValue({ json: () => Promise.resolve({ diff: 'some diff' }) });

    await loadDiffInModal('src/app.ts');

    const calledUrl = fetchMock.mock.calls[0][0];
    expect(calledUrl).toContain('start_ref=' + encodeURIComponent('abc123'));
    expect(calledUrl).not.toContain('end_ref');
  });

  it('omits all refs when task has no refs', async () => {
    const task = makeTask({ id: 1, files: ['src/app.ts'] });
    delete task.start_ref;
    delete task.end_ref;
    const { openModal, loadDiffInModal, fetchMock } = loadModal({
      tasks: [task],
      fetchResponse: { diff: 'some diff' },
    });

    openModal('1');
    fetchMock.mockClear();
    fetchMock.mockResolvedValue({ json: () => Promise.resolve({ diff: 'some diff' }) });

    await loadDiffInModal('src/app.ts');

    const calledUrl = fetchMock.mock.calls[0][0];
    expect(calledUrl).not.toContain('start_ref');
    expect(calledUrl).not.toContain('end_ref');
  });
});

describe('switchDiffFile', () => {
  it('updates active class in sidebar and calls loadDiffInModal', async () => {
    const rowEl = {
      classList: { add: vi.fn(), remove: vi.fn() },
    };
    const existingActive = {
      classList: { remove: vi.fn() },
    };
    const { switchDiffFile, setQuerySelectorResult, fetchMock } = loadModal({
      fetchResponse: { diff: 'some diff' },
    });
    setQuerySelectorResult([existingActive]);

    fetchMock.mockClear();
    fetchMock.mockResolvedValue({ json: () => Promise.resolve({ diff: 'some diff' }) });

    switchDiffFile(rowEl, 'src/app.ts');

    expect(existingActive.classList.remove).toHaveBeenCalledWith('active');
    expect(rowEl.classList.add).toHaveBeenCalledWith('active');
  });
});

describe('closeModal', () => {
  it('removes "open" class from task-modal and diff-modal', () => {
    const { closeModal, elements } = loadModal();

    closeModal();

    expect(elements['task-modal'].classList.remove).toHaveBeenCalledWith('open');
    expect(elements['diff-modal'].classList.remove).toHaveBeenCalledWith('open');
    expect(elements['task-modal'].style.display).toBe('');
  });
});

describe('closeDiffModal', () => {
  it('hides diff modal and restores task modal', () => {
    const { closeDiffModal, elements } = loadModal();

    closeDiffModal();

    expect(elements['diff-modal'].classList.remove).toHaveBeenCalledWith('open');
    expect(elements['task-modal'].style.display).toBe('');
  });
});

describe('Escape key handler', () => {
  it('calls closeDiffModal when diff modal is open and Escape is pressed', () => {
    const { keydownHandler, elements } = loadModal();

    // Simulate diff modal being open
    elements['diff-modal'].classList.add('open');

    const handler = keydownHandler();
    expect(handler).not.toBeNull();

    handler!({ key: 'Escape' });

    // Should close diff modal (remove 'open') but NOT close task modal
    expect(elements['diff-modal'].classList.remove).toHaveBeenCalledWith('open');
    // task-modal display should be restored
    expect(elements['task-modal'].style.display).toBe('');
  });

  it('calls closeModal when only task modal is open and Escape is pressed', () => {
    const { keydownHandler, elements } = loadModal();

    const handler = keydownHandler();
    expect(handler).not.toBeNull();

    handler!({ key: 'Escape' });

    expect(elements['task-modal'].classList.remove).toHaveBeenCalledWith('open');
    expect(elements['diff-modal'].classList.remove).toHaveBeenCalledWith('open');
  });

  it('does not call closeModal for non-Escape keys', () => {
    const { keydownHandler, elements } = loadModal();

    const handler = keydownHandler();
    handler!({ key: 'Enter' });

    expect(elements['task-modal'].classList.remove).not.toHaveBeenCalled();
  });
});
