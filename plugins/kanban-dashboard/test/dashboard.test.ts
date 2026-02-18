import { readFileSync } from 'fs';
import { runInNewContext } from 'vm';
import { resolve } from 'path';
import { describe, it, expect, beforeEach, vi } from 'vitest';

function createMockElement(tag = 'div') {
  return {
    innerHTML: '',
    textContent: '',
    className: '',
    style: { display: '', width: '' },
    classList: {
      add: vi.fn(),
      remove: vi.fn(),
      contains: vi.fn(),
    },
    childNodes: [{ textContent: '' }] as Array<{ textContent: string }>,
  };
}

function createMockDOM() {
  const elements: Record<string, ReturnType<typeof createMockElement>> = {};
  const allIds = [
    'agent-bar', 'cards-blocked', 'cards-ready', 'cards-progress', 'cards-done',
    'count-blocked', 'count-ready', 'count-progress', 'count-done',
    'stat-agents', 'stat-done', 'stat-total', 'stat-findings',
    'progress-fill', 'progress-text', 'completion-banner', 'completion-time',
    'connecting-overlay', 'dashboard-title', 'dashboard-subtitle', 'elapsed',
    'log-entries',
  ];
  for (const id of allIds) {
    elements[id] = createMockElement();
  }
  elements['dashboard-title'].childNodes = [{ textContent: '' }];

  return {
    elements,
    document: {
      getElementById: (id: string) => elements[id] || createMockElement(),
    },
  };
}

interface DashboardContext {
  elapsed: () => string;
  renderBadges: (task: Record<string, unknown>) => string;
  renderSubtasks: (task: Record<string, unknown>) => string;
  renderCard: (task: Record<string, unknown>) => string;
  renderBoard: (tasks: Array<Record<string, unknown>>) => void;
  renderAgentBar: (tasks: Array<Record<string, unknown>>) => void;
  prevTaskMap: Record<string, { status: string }>;
  allTasks: Array<Record<string, unknown>>;
}

const code = readFileSync(resolve(__dirname, '../public/js/dashboard.js'), 'utf-8');

function loadDashboard(fixedNow?: number): { ctx: DashboardContext; dom: ReturnType<typeof createMockDOM> } {
  const dom = createMockDOM();
  const intervals: Array<{ fn: () => void; ms: number }> = [];
  const mockFetch = vi.fn().mockResolvedValue({
    json: () => Promise.resolve({ tasks: [], config: { title: 'Test', subtitle: '' }, entries: [] }),
  });

  const now = fixedNow ?? 1000000;
  const ctx: Record<string, unknown> = {
    document: dom.document,
    fetch: mockFetch,
    setInterval: (fn: () => void, ms: number) => { intervals.push({ fn, ms }); return intervals.length; },
    Date: { now: () => now },
    console: { warn: vi.fn(), log: vi.fn(), error: vi.fn() },
    Math,
    String,
    Set,
    Promise,
    Array,
  };

  runInNewContext(code, ctx);

  return { ctx: ctx as unknown as DashboardContext, dom };
}

describe('elapsed()', () => {
  it('returns 00:00:00 when Date.now equals startTime', () => {
    const { ctx } = loadDashboard(5000);
    expect(ctx.elapsed()).toBe('00:00:00');
  });

  it('returns correct time after 1 second', () => {
    let time = 5000;
    const dom = createMockDOM();
    const mockFetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ tasks: [], config: { title: 'Test', subtitle: '' }, entries: [] }),
    });
    const ctx: Record<string, unknown> = {
      document: dom.document,
      fetch: mockFetch,
      setInterval: vi.fn(),
      Date: { now: () => time },
      console: { warn: vi.fn(), log: vi.fn(), error: vi.fn() },
      Math, String, Set, Promise, Array,
    };
    runInNewContext(code, ctx);
    // Now advance time by 1 second
    time = 6000;
    (ctx.Date as { now: () => number }).now = () => time;
    expect((ctx as unknown as DashboardContext).elapsed()).toBe('00:00:01');
  });

  it('returns correct time after 61 seconds', () => {
    let time = 0;
    const dom = createMockDOM();
    const mockFetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ tasks: [], config: { title: 'Test', subtitle: '' }, entries: [] }),
    });
    const ctx: Record<string, unknown> = {
      document: dom.document,
      fetch: mockFetch,
      setInterval: vi.fn(),
      Date: { now: () => time },
      console: { warn: vi.fn(), log: vi.fn(), error: vi.fn() },
      Math, String, Set, Promise, Array,
    };
    runInNewContext(code, ctx);
    time = 61000;
    (ctx.Date as { now: () => number }).now = () => time;
    expect((ctx as unknown as DashboardContext).elapsed()).toBe('00:01:01');
  });

  it('returns correct time after 3661 seconds (1h 1m 1s)', () => {
    let time = 0;
    const dom = createMockDOM();
    const mockFetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ tasks: [], config: { title: 'Test', subtitle: '' }, entries: [] }),
    });
    const ctx: Record<string, unknown> = {
      document: dom.document,
      fetch: mockFetch,
      setInterval: vi.fn(),
      Date: { now: () => time },
      console: { warn: vi.fn(), log: vi.fn(), error: vi.fn() },
      Math, String, Set, Promise, Array,
    };
    runInNewContext(code, ctx);
    time = 3661000;
    (ctx.Date as { now: () => number }).now = () => time;
    expect((ctx as unknown as DashboardContext).elapsed()).toBe('01:01:01');
  });

  it('pads single digits with leading zeros', () => {
    let time = 0;
    const dom = createMockDOM();
    const mockFetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ tasks: [], config: { title: 'Test', subtitle: '' }, entries: [] }),
    });
    const ctx: Record<string, unknown> = {
      document: dom.document,
      fetch: mockFetch,
      setInterval: vi.fn(),
      Date: { now: () => time },
      console: { warn: vi.fn(), log: vi.fn(), error: vi.fn() },
      Math, String, Set, Promise, Array,
    };
    runInNewContext(code, ctx);
    time = 5000;
    (ctx.Date as { now: () => number }).now = () => time;
    const result = (ctx as unknown as DashboardContext).elapsed();
    expect(result).toMatch(/^\d{2}:\d{2}:\d{2}$/);
    expect(result).toBe('00:00:05');
  });
});

describe('renderBadges(task)', () => {
  let ctx: DashboardContext;

  beforeEach(() => {
    ({ ctx } = loadDashboard());
  });

  it('returns empty string when no severity fields', () => {
    expect(ctx.renderBadges({})).toBe('');
  });

  it('returns empty string when all severities are zero', () => {
    expect(ctx.renderBadges({ high: 0, medium: 0, low: 0 })).toBe('');
  });

  it('returns H badge when high > 0', () => {
    const result = ctx.renderBadges({ high: 3 });
    expect(result).toContain('badge-high');
    expect(result).toContain('H:3');
  });

  it('returns M badge when medium > 0', () => {
    const result = ctx.renderBadges({ medium: 5 });
    expect(result).toContain('badge-medium');
    expect(result).toContain('M:5');
  });

  it('returns L badge when low > 0', () => {
    const result = ctx.renderBadges({ low: 2 });
    expect(result).toContain('badge-low');
    expect(result).toContain('L:2');
  });

  it('returns all three badges when all present', () => {
    const result = ctx.renderBadges({ high: 1, medium: 2, low: 3 });
    expect(result).toContain('badge-high');
    expect(result).toContain('H:1');
    expect(result).toContain('badge-medium');
    expect(result).toContain('M:2');
    expect(result).toContain('badge-low');
    expect(result).toContain('L:3');
  });
});

describe('renderSubtasks(task)', () => {
  let ctx: DashboardContext;

  beforeEach(() => {
    ({ ctx } = loadDashboard());
  });

  it('returns empty string when no subtasks field', () => {
    expect(ctx.renderSubtasks({})).toBe('');
  });

  it('returns empty string when subtasks is empty array', () => {
    expect(ctx.renderSubtasks({ subtasks: [] })).toBe('');
  });

  it('renders all subtasks', () => {
    const result = ctx.renderSubtasks({ subtasks: ['Task A', 'Task B', 'Task C'] });
    expect(result).toContain('Task A');
    expect(result).toContain('Task B');
    expect(result).toContain('Task C');
    expect(result).toContain('subtask-list');
  });

  it('marks done subtasks with done class and checkmark', () => {
    const result = ctx.renderSubtasks({
      subtasks: ['Task A', 'Task B'],
      subtasks_done: ['Task A'],
    });
    expect(result).toContain('subtask done');
    expect(result).toContain('&#10003;');
  });

  it('marks incomplete subtasks with circle icon and no done class', () => {
    const result = ctx.renderSubtasks({
      subtasks: ['Task A'],
      subtasks_done: [],
    });
    expect(result).toContain('&#9675;');
    // The subtask div should not have 'done' class
    expect(result).toContain('class="subtask "');
  });
});

describe('renderCard(task)', () => {
  let ctx: DashboardContext;

  beforeEach(() => {
    ({ ctx } = loadDashboard());
  });

  it('includes task id', () => {
    const result = ctx.renderCard({
      id: 'T-001', title: 'Test', agent: 'Agent1', status: 'ready',
      agent_color: '#fff', progress: 0,
    });
    expect(result).toContain('#T-001');
    expect(result).toContain('card-T-001');
  });

  it('includes task title', () => {
    const result = ctx.renderCard({
      id: 'T-002', title: 'My Title', agent: 'A', status: 'ready',
      agent_color: '#000', progress: 0,
    });
    expect(result).toContain('My Title');
  });

  it('includes agent name', () => {
    const result = ctx.renderCard({
      id: 'T-003', title: 'X', agent: 'AgentSmith', status: 'ready',
      agent_color: '#abc', progress: 0,
    });
    expect(result).toContain('AgentSmith');
  });

  it('renders progress bar with correct width', () => {
    const result = ctx.renderCard({
      id: 'T-004', title: 'X', agent: 'A', status: 'in_progress',
      agent_color: '#000', progress: 0.75,
    });
    expect(result).toContain('width:75%');
  });

  it('renders file tags', () => {
    const result = ctx.renderCard({
      id: 'T-005', title: 'X', agent: 'A', status: 'ready',
      agent_color: '#000', progress: 0, files: ['src/main.ts', 'README.md'],
    });
    expect(result).toContain('file-tag');
    expect(result).toContain('src/main.ts');
    expect(result).toContain('README.md');
  });

  it('includes onclick handler with task id', () => {
    const result = ctx.renderCard({
      id: 'T-006', title: 'X', agent: 'A', status: 'ready',
      agent_color: '#000', progress: 0,
    });
    expect(result).toContain("openModal('T-006')");
  });

  it('renders subtasks for in_progress status', () => {
    const result = ctx.renderCard({
      id: 'T-007', title: 'X', agent: 'A', status: 'in_progress',
      agent_color: '#000', progress: 0.5,
      subtasks: ['Sub1', 'Sub2'], subtasks_done: ['Sub1'],
    });
    expect(result).toContain('subtask-list');
    expect(result).toContain('Sub1');
    expect(result).toContain('Sub2');
  });

  it('does not render subtasks for non in_progress status', () => {
    const result = ctx.renderCard({
      id: 'T-008', title: 'X', agent: 'A', status: 'done',
      agent_color: '#000', progress: 1,
      subtasks: ['Sub1'], subtasks_done: ['Sub1'],
    });
    expect(result).not.toContain('subtask-list');
  });

  it('applies card-new class for a new task', () => {
    const result = ctx.renderCard({
      id: 'T-009', title: 'X', agent: 'A', status: 'ready',
      agent_color: '#000', progress: 0,
    });
    expect(result).toContain('card-new');
  });

  it('does not apply card-new class for a seen task with same status', () => {
    // First render to populate prevTaskMap
    ctx.renderBoard([{
      id: 'T-010', title: 'X', agent: 'A', status: 'ready',
      agent_color: '#000', progress: 0,
    }]);
    // Second render should not be new
    const result = ctx.renderCard({
      id: 'T-010', title: 'X', agent: 'A', status: 'ready',
      agent_color: '#000', progress: 0,
    });
    expect(result).not.toContain('card-new');
  });

  it('shows blocked-by ids when task has blocked_by', () => {
    const result = ctx.renderCard({
      id: 'T-013', title: 'X', agent: 'A', status: 'blocked',
      agent_color: '#000', progress: 0, blocked_by: [1, 3],
    });
    expect(result).toContain('card-blocked-by');
    expect(result).toContain('Blocked by:');
    expect(result).toContain('#1');
    expect(result).toContain('#3');
  });

  it('does not show blocked-by when blocked_by is empty', () => {
    const result = ctx.renderCard({
      id: 'T-014', title: 'X', agent: 'A', status: 'ready',
      agent_color: '#000', progress: 0, blocked_by: [],
    });
    expect(result).not.toContain('card-blocked-by');
  });

  it('does not show blocked-by when blocked_by is missing', () => {
    const result = ctx.renderCard({
      id: 'T-015', title: 'X', agent: 'A', status: 'ready',
      agent_color: '#000', progress: 0,
    });
    expect(result).not.toContain('card-blocked-by');
  });

  it('handles missing message gracefully', () => {
    const result = ctx.renderCard({
      id: 'T-011', title: 'X', agent: 'A', status: 'ready',
      agent_color: '#000', progress: 0,
    });
    expect(result).toContain('card-message');
    // Should not throw, message area should be empty
    expect(result).toContain('<div class="card-message"></div>');
  });

  it('handles missing files gracefully', () => {
    const result = ctx.renderCard({
      id: 'T-012', title: 'X', agent: 'A', status: 'ready',
      agent_color: '#000', progress: 0,
    });
    expect(result).toContain('card-files');
    expect(result).not.toContain('file-tag');
  });
});

describe('renderBoard(tasks)', () => {
  let ctx: DashboardContext;
  let dom: ReturnType<typeof createMockDOM>;

  beforeEach(() => {
    ({ ctx, dom } = loadDashboard());
  });

  it('distributes tasks to correct columns', () => {
    const tasks = [
      { id: '1', title: 'A', agent: 'X', status: 'blocked', agent_color: '#000', progress: 0 },
      { id: '2', title: 'B', agent: 'X', status: 'ready', agent_color: '#000', progress: 0 },
      { id: '3', title: 'C', agent: 'X', status: 'in_progress', agent_color: '#000', progress: 0.5 },
      { id: '4', title: 'D', agent: 'X', status: 'done', agent_color: '#000', progress: 1 },
    ];
    ctx.renderBoard(tasks);

    expect(dom.elements['cards-blocked'].innerHTML).toContain('#1');
    expect(dom.elements['cards-ready'].innerHTML).toContain('#2');
    expect(dom.elements['cards-progress'].innerHTML).toContain('#3');
    expect(dom.elements['cards-done'].innerHTML).toContain('#4');
  });

  it('shows empty column message for blocked', () => {
    ctx.renderBoard([]);
    expect(dom.elements['cards-blocked'].innerHTML).toContain('Waiting on dependencies');
  });

  it('shows empty column message for ready', () => {
    ctx.renderBoard([]);
    expect(dom.elements['cards-ready'].innerHTML).toContain('No tasks queued');
  });

  it('shows empty column message for in_progress', () => {
    ctx.renderBoard([]);
    expect(dom.elements['cards-progress'].innerHTML).toContain('Agents working...');
  });

  it('shows empty column message for done', () => {
    ctx.renderBoard([]);
    expect(dom.elements['cards-done'].innerHTML).toContain('Completed tasks appear here');
  });

  it('updates column count elements', () => {
    const tasks = [
      { id: '1', title: 'A', agent: 'X', status: 'blocked', agent_color: '#000', progress: 0 },
      { id: '2', title: 'B', agent: 'X', status: 'blocked', agent_color: '#000', progress: 0 },
      { id: '3', title: 'C', agent: 'X', status: 'ready', agent_color: '#000', progress: 0 },
    ];
    ctx.renderBoard(tasks);

    expect(dom.elements['count-blocked'].textContent).toBe(2);
    expect(dom.elements['count-ready'].textContent).toBe(1);
    expect(dom.elements['count-progress'].textContent).toBe(0);
    expect(dom.elements['count-done'].textContent).toBe(0);
  });

  it('updates stat-agents with active count', () => {
    const tasks = [
      { id: '1', title: 'A', agent: 'X', status: 'in_progress', agent_color: '#000', progress: 0.5 },
      { id: '2', title: 'B', agent: 'Y', status: 'in_progress', agent_color: '#000', progress: 0.3 },
      { id: '3', title: 'C', agent: 'Z', status: 'done', agent_color: '#000', progress: 1 },
    ];
    ctx.renderBoard(tasks);
    expect(dom.elements['stat-agents'].textContent).toBe(2);
  });

  it('updates stat-done with done count', () => {
    const tasks = [
      { id: '1', title: 'A', agent: 'X', status: 'done', agent_color: '#000', progress: 1 },
      { id: '2', title: 'B', agent: 'Y', status: 'done', agent_color: '#000', progress: 1 },
    ];
    ctx.renderBoard(tasks);
    expect(dom.elements['stat-done'].textContent).toBe(2);
  });

  it('updates stat-total with total task count', () => {
    const tasks = [
      { id: '1', title: 'A', agent: 'X', status: 'ready', agent_color: '#000', progress: 0 },
      { id: '2', title: 'B', agent: 'Y', status: 'done', agent_color: '#000', progress: 1 },
      { id: '3', title: 'C', agent: 'Z', status: 'blocked', agent_color: '#000', progress: 0 },
    ];
    ctx.renderBoard(tasks);
    expect(dom.elements['stat-total'].textContent).toBe(3);
  });

  it('shows findings total from severity counts', () => {
    const tasks = [
      { id: '1', title: 'A', agent: 'X', status: 'done', agent_color: '#000', progress: 1, high: 2, medium: 3, low: 1 },
      { id: '2', title: 'B', agent: 'Y', status: 'done', agent_color: '#000', progress: 1, high: 0, medium: 1, low: 0 },
    ];
    ctx.renderBoard(tasks);
    expect(dom.elements['stat-findings'].textContent).toBe(7);
  });

  it('shows completion banner when all tasks are done', () => {
    const tasks = [
      { id: '1', title: 'A', agent: 'X', status: 'done', agent_color: '#000', progress: 1 },
      { id: '2', title: 'B', agent: 'Y', status: 'done', agent_color: '#000', progress: 1 },
    ];
    ctx.renderBoard(tasks);
    expect(dom.elements['completion-banner'].style.display).toBe('block');
    expect(dom.elements['completion-time'].textContent).toContain('Completed in');
  });

  it('hides completion banner when not all tasks are done', () => {
    const tasks = [
      { id: '1', title: 'A', agent: 'X', status: 'done', agent_color: '#000', progress: 1 },
      { id: '2', title: 'B', agent: 'Y', status: 'in_progress', agent_color: '#000', progress: 0.5 },
    ];
    ctx.renderBoard(tasks);
    expect(dom.elements['completion-banner'].style.display).toBe('none');
  });

  it('updates progress bar percentage', () => {
    const tasks = [
      { id: '1', title: 'A', agent: 'X', status: 'done', agent_color: '#000', progress: 1 },
      { id: '2', title: 'B', agent: 'Y', status: 'ready', agent_color: '#000', progress: 0 },
      { id: '3', title: 'C', agent: 'Z', status: 'ready', agent_color: '#000', progress: 0 },
      { id: '4', title: 'D', agent: 'W', status: 'done', agent_color: '#000', progress: 1 },
    ];
    ctx.renderBoard(tasks);
    expect(dom.elements['progress-fill'].style.width).toBe('50%');
    expect(dom.elements['progress-text'].textContent).toBe('50% complete (2/4 tasks)');
  });

  it('shows 0% progress for empty task list', () => {
    ctx.renderBoard([]);
    expect(dom.elements['progress-fill'].style.width).toBe('0%');
    expect(dom.elements['progress-text'].textContent).toBe('0% complete (0/0 tasks)');
  });
});

describe('renderAgentBar(tasks)', () => {
  let ctx: DashboardContext;
  let dom: ReturnType<typeof createMockDOM>;

  beforeEach(() => {
    ({ ctx, dom } = loadDashboard());
  });

  it('shows unique agents only (deduplicated)', () => {
    const tasks = [
      { id: '1', title: 'A', agent: 'Alice', status: 'ready', agent_color: '#f00' },
      { id: '2', title: 'B', agent: 'Alice', status: 'done', agent_color: '#f00' },
      { id: '3', title: 'C', agent: 'Bob', status: 'ready', agent_color: '#0f0' },
    ];
    ctx.renderAgentBar(tasks);
    const html = dom.elements['agent-bar'].innerHTML;
    // Count occurrences of agent-chip class (each agent gets one chip)
    const chipMatches = html.match(/agent-chip/g);
    expect(chipMatches).toHaveLength(2);
  });

  it('marks in_progress agent as active', () => {
    const tasks = [
      { id: '1', title: 'A', agent: 'Alice', status: 'in_progress', agent_color: '#f00' },
    ];
    ctx.renderAgentBar(tasks);
    const html = dom.elements['agent-bar'].innerHTML;
    expect(html).toContain('agent-chip active');
    expect(html).toContain('agent-dot active');
  });

  it('marks done agent as done', () => {
    const tasks = [
      { id: '1', title: 'A', agent: 'Bob', status: 'done', agent_color: '#0f0' },
    ];
    ctx.renderAgentBar(tasks);
    const html = dom.elements['agent-bar'].innerHTML;
    expect(html).toContain('agent-chip done');
    expect(html).toContain('agent-dot done');
  });

  it('marks other agents as idle', () => {
    const tasks = [
      { id: '1', title: 'A', agent: 'Charlie', status: 'ready', agent_color: '#00f' },
    ];
    ctx.renderAgentBar(tasks);
    const html = dom.elements['agent-bar'].innerHTML;
    expect(html).toContain('agent-chip idle');
    expect(html).toContain('agent-dot idle');
  });

  it('includes agent-bar-label', () => {
    ctx.renderAgentBar([]);
    const html = dom.elements['agent-bar'].innerHTML;
    expect(html).toContain('agent-bar-label');
    expect(html).toContain('Agents');
  });

  it('uses first occurrence status for deduplicated agents', () => {
    const tasks = [
      { id: '1', title: 'A', agent: 'Alice', status: 'in_progress', agent_color: '#f00' },
      { id: '2', title: 'B', agent: 'Alice', status: 'done', agent_color: '#f00' },
    ];
    ctx.renderAgentBar(tasks);
    const html = dom.elements['agent-bar'].innerHTML;
    // Alice should appear once, with 'active' status (first occurrence)
    const chipMatches = html.match(/agent-chip/g);
    expect(chipMatches).toHaveLength(1);
    expect(html).toContain('agent-chip active');
  });
});
