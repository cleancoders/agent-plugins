import { test, expect } from '@playwright/test';
import { startServer, stopServer } from '../src/http-server.js';
import { initDashboard, addTask, addLog, reset } from '../src/state.js';

let baseUrl: string;

test.beforeAll(async () => {
  reset();
  initDashboard({ title: 'E2E Test Dashboard', subtitle: 'Testing' });

  addTask({ id: 1, title: 'Blocked Task', agent: 'agent-1', agent_color: '#ff6b6b', status: 'blocked', message: 'Waiting', progress: 0, blocked_by: [2] });
  addTask({ id: 2, title: 'Ready Task', agent: 'agent-2', agent_color: '#ffd43b', status: 'ready', message: 'Queued', progress: 0 });
  addTask({ id: 3, title: 'Active Task', agent: 'agent-1', agent_color: '#ff6b6b', status: 'in_progress', message: 'Working on it', progress: 0.5, files: ['src/foo.ts'], subtasks: ['Step 1', 'Step 2'], subtasks_done: ['Step 1'], high: 2, medium: 1 });
  addTask({ id: 4, title: 'Done Task', agent: 'agent-3', agent_color: '#69db7c', status: 'done', message: 'Finished', progress: 1 });

  addLog({ time: '10:00:00', agent: 'agent-1', color: '#ff6b6b', message: 'Started work' });
  addLog({ time: '10:01:00', agent: 'agent-1', color: '#ff6b6b', message: 'Made progress' });

  const info = await startServer(0);
  baseUrl = info.url;
});

test.afterAll(async () => {
  await stopServer();
  reset();
});

test.beforeEach(async ({ page }) => {
  await page.goto(baseUrl);
  await page.waitForSelector('#connecting-overlay.hidden', { timeout: 5000 });
});

// --- Board rendering ---

test('page title contains dashboard title', async ({ page }) => {
  const titleEl = page.locator('#dashboard-title');
  await expect(titleEl).toContainText('E2E Test Dashboard');
});

test('subtitle shows configured subtitle', async ({ page }) => {
  const subtitleEl = page.locator('#dashboard-subtitle');
  await expect(subtitleEl).toHaveText('/ Testing');
});

test('connecting overlay is hidden after load', async ({ page }) => {
  const overlay = page.locator('#connecting-overlay');
  await expect(overlay).toHaveClass(/hidden/);
});

test('blocked task card appears in blocked column', async ({ page }) => {
  const card = page.locator('#cards-blocked #card-1');
  await expect(card).toBeVisible();
  await expect(card).toContainText('Blocked Task');
});

test('ready task card appears in ready column', async ({ page }) => {
  const card = page.locator('#cards-ready #card-2');
  await expect(card).toBeVisible();
  await expect(card).toContainText('Ready Task');
});

test('in_progress task card appears in progress column', async ({ page }) => {
  const card = page.locator('#cards-progress #card-3');
  await expect(card).toBeVisible();
  await expect(card).toContainText('Active Task');
});

test('done task card appears in done column', async ({ page }) => {
  const card = page.locator('#cards-done #card-4');
  await expect(card).toBeVisible();
  await expect(card).toContainText('Done Task');
});

test('column counts are correct', async ({ page }) => {
  await expect(page.locator('#count-blocked')).toHaveText('1');
  await expect(page.locator('#count-ready')).toHaveText('1');
  await expect(page.locator('#count-progress')).toHaveText('1');
  await expect(page.locator('#count-done')).toHaveText('1');
});

// --- Stats ---

test('active count shows 1', async ({ page }) => {
  await expect(page.locator('#stat-agents')).toHaveText('1');
});

test('done count shows 1', async ({ page }) => {
  await expect(page.locator('#stat-done')).toHaveText('1');
});

test('total count shows 4', async ({ page }) => {
  await expect(page.locator('#stat-total')).toHaveText('4');
});

test('findings count shows 3', async ({ page }) => {
  await expect(page.locator('#stat-findings')).toHaveText('3');
});

// --- Progress bar ---

test('progress text shows 25% complete', async ({ page }) => {
  await expect(page.locator('#progress-text')).toHaveText('25% complete (1/4 tasks)');
});

// --- Agent bar ---

test('agent bar shows 3 unique agents', async ({ page }) => {
  const chips = page.locator('#agent-bar .agent-chip');
  await expect(chips).toHaveCount(3);
});

// --- Card interactions ---

test('clicking a card opens the modal', async ({ page }) => {
  await page.locator('#card-3').click();
  const modal = page.locator('#task-modal');
  await expect(modal).toHaveClass(/open/);
});

test('modal shows correct task title', async ({ page }) => {
  await page.locator('#card-3').click();
  await expect(page.locator('#modal-title')).toHaveText('Active Task');
});

test('modal shows correct task status', async ({ page }) => {
  await page.locator('#card-3').click();
  await expect(page.locator('#modal-status')).toHaveText('in progress');
});

// --- Modal content ---

test('modal shows agent name', async ({ page }) => {
  await page.locator('#card-3').click();
  const agentSection = page.locator('.modal-agent');
  await expect(agentSection).toContainText('agent-1');
});

test('modal shows subtasks with done and pending icons', async ({ page }) => {
  await page.locator('#card-3').click();
  const subtaskList = page.locator('.modal-subtask-list');
  await expect(subtaskList).toBeVisible();

  const subtasks = page.locator('.modal-subtask');
  await expect(subtasks).toHaveCount(2);

  const doneSubtask = page.locator('.modal-subtask.done');
  await expect(doneSubtask).toHaveCount(1);
  await expect(doneSubtask).toContainText('Step 1');

  const pendingSubtask = page.locator('.modal-subtask:not(.done)');
  await expect(pendingSubtask).toHaveCount(1);
  await expect(pendingSubtask).toContainText('Step 2');
});

// --- Modal interactions ---

test('pressing Escape closes the modal', async ({ page }) => {
  await page.locator('#card-3').click();
  const modal = page.locator('#task-modal');
  await expect(modal).toHaveClass(/open/);

  await page.keyboard.press('Escape');
  await expect(modal).not.toHaveClass(/open/);
});

test('clicking overlay closes the modal', async ({ page }) => {
  await page.locator('#card-3').click();
  const modal = page.locator('#task-modal');
  await expect(modal).toHaveClass(/open/);

  // Click on the overlay itself (outside the modal-content), using position at edge
  await modal.click({ position: { x: 5, y: 5 } });
  await expect(modal).not.toHaveClass(/open/);
});

// --- Completion banner ---

test('completion banner is hidden when not all tasks are done', async ({ page }) => {
  const banner = page.locator('#completion-banner');
  await expect(banner).toBeHidden();
});
