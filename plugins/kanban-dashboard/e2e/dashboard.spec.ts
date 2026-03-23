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

// --- Modal navigation ---

test('modal shows left and right navigation arrows', async ({ page }) => {
  await page.locator('#card-3').click();
  await expect(page.locator('#modal-nav-prev')).toBeVisible();
  await expect(page.locator('#modal-nav-next')).toBeVisible();
});

test('clicking right arrow navigates to next task by ID', async ({ page }) => {
  // Task 3 -> right -> Task 4
  await page.locator('#card-3').click();
  await expect(page.locator('#modal-id')).toHaveText('#3');
  await page.locator('#modal-nav-next').click();
  await expect(page.locator('#modal-id')).toHaveText('#4');
  await expect(page.locator('#modal-title')).toHaveText('Done Task');
});

test('clicking left arrow navigates to previous task by ID', async ({ page }) => {
  // Task 3 -> left -> Task 2
  await page.locator('#card-3').click();
  await expect(page.locator('#modal-id')).toHaveText('#3');
  await page.locator('#modal-nav-prev').click();
  await expect(page.locator('#modal-id')).toHaveText('#2');
  await expect(page.locator('#modal-title')).toHaveText('Ready Task');
});

test('left arrow is disabled on first task', async ({ page }) => {
  await page.locator('#card-1').click();
  await expect(page.locator('#modal-nav-prev')).toBeDisabled();
  await expect(page.locator('#modal-nav-next')).toBeEnabled();
});

test('right arrow is disabled on last task', async ({ page }) => {
  await page.locator('#card-4').click();
  await expect(page.locator('#modal-nav-next')).toBeDisabled();
  await expect(page.locator('#modal-nav-prev')).toBeEnabled();
});

// --- Mobile responsive ---

test.describe('mobile viewport', () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test('tab bar is visible on mobile', async ({ page }) => {
    const tabs = page.locator('#column-tabs');
    await expect(tabs).toBeVisible();
  });

  test('WIP tab is active by default', async ({ page }) => {
    const wipTab = page.locator('.column-tab[data-column="in_progress"]');
    await expect(wipTab).toHaveClass(/active/);
  });

  test('in_progress column is visible on mobile', async ({ page }) => {
    const col = page.locator('#col-progress');
    await expect(col).toHaveClass(/mobile-active/);
  });

  test('blocked column is hidden on mobile by default', async ({ page }) => {
    const col = page.locator('#col-blocked');
    await expect(col).not.toHaveClass(/mobile-active/);
  });

  test('clicking BLK tab shows blocked column', async ({ page }) => {
    await page.locator('.column-tab[data-column="blocked"]').click();
    const blockedCol = page.locator('#col-blocked');
    await expect(blockedCol).toHaveClass(/mobile-active/);
    const progressCol = page.locator('#col-progress');
    await expect(progressCol).not.toHaveClass(/mobile-active/);
  });

  test('swiping left advances to next column', async ({ page }) => {
    // Default is WIP (index 2), swipe left should go to DONE (index 3)
    await page.evaluate(() => {
      const board = document.querySelector('.board')!;
      board.dispatchEvent(new TouchEvent('touchstart', {
        touches: [new Touch({ identifier: 0, target: board, clientX: 300, clientY: 300 })],
      }));
      board.dispatchEvent(new TouchEvent('touchend', {
        changedTouches: [new Touch({ identifier: 0, target: board, clientX: 50, clientY: 300 })],
      }));
    });

    const doneCol = page.locator('#col-done');
    await expect(doneCol).toHaveClass(/mobile-active/);
    const doneTab = page.locator('.column-tab[data-column="done"]');
    await expect(doneTab).toHaveClass(/active/);
  });

  test('swiping right goes to previous column', async ({ page }) => {
    // Default is WIP (index 2), swipe right should go to RDY (index 1)
    await page.evaluate(() => {
      const board = document.querySelector('.board')!;
      board.dispatchEvent(new TouchEvent('touchstart', {
        touches: [new Touch({ identifier: 0, target: board, clientX: 50, clientY: 300 })],
      }));
      board.dispatchEvent(new TouchEvent('touchend', {
        changedTouches: [new Touch({ identifier: 0, target: board, clientX: 300, clientY: 300 })],
      }));
    });

    const readyCol = page.locator('#col-ready');
    await expect(readyCol).toHaveClass(/mobile-active/);
    const readyTab = page.locator('.column-tab[data-column="ready"]');
    await expect(readyTab).toHaveClass(/active/);
  });

  test('tab counts match column counts', async ({ page }) => {
    await expect(page.locator('#tab-count-blocked')).toHaveText('1');
    await expect(page.locator('#tab-count-ready')).toHaveText('1');
    await expect(page.locator('#tab-count-progress')).toHaveText('1');
    await expect(page.locator('#tab-count-done')).toHaveText('1');
  });

  test('log FAB is visible on mobile', async ({ page }) => {
    const fab = page.locator('#log-fab');
    await expect(fab).toBeVisible();
  });

  test('log panel is hidden on mobile by default', async ({ page }) => {
    const logPanel = page.locator('#log-panel');
    await expect(logPanel).not.toBeVisible();
  });

  test('clicking FAB opens log bottom sheet', async ({ page }) => {
    await page.locator('#log-fab').click();
    const logPanel = page.locator('#log-panel');
    await expect(logPanel).toBeVisible();
    await expect(logPanel).toHaveClass(/mobile-open/);
  });

  test('clicking backdrop closes log bottom sheet', async ({ page }) => {
    await page.locator('#log-fab').click();
    await expect(page.locator('#log-panel')).toHaveClass(/mobile-open/);
    await page.locator('#log-backdrop').click();
    await expect(page.locator('#log-panel')).not.toHaveClass(/mobile-open/);
  });

  test('tab bar is hidden on desktop viewport', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await context.newPage();
    await page.goto(baseUrl);
    await page.waitForSelector('#connecting-overlay.hidden', { timeout: 5000 });
    const tabs = page.locator('#column-tabs');
    await expect(tabs).not.toBeVisible();
    await context.close();
  });

  test('card action buttons are visible without hover', async ({ page }) => {
    const actions = page.locator('#card-3 .card-actions');
    await expect(actions).toBeVisible();
  });

  test('task modal is full-screen on mobile', async ({ page }) => {
    await page.locator('#card-3').click();
    const modal = page.locator('.modal-content');
    const box = await modal.boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(370);
    expect(box!.height).toBeGreaterThanOrEqual(660);
  });

  test('elapsed timer is in header top row on mobile', async ({ page }) => {
    const elapsed = page.locator('.header-top-row .elapsed');
    await expect(elapsed).toBeVisible();
  });

  test('diff modal is full-screen on mobile', async ({ page }) => {
    // Open task modal for task 3 (has files)
    await page.locator('#card-3').click();
    await expect(page.locator('#task-modal')).toHaveClass(/open/);

    // Check if file list exists in modal (may not if API isn't available)
    const fileRows = page.locator('#modal-file-list .diff-file-row');
    const count = await fileRows.count();
    if (count > 0) {
      await fileRows.first().click();
      const diffModal = page.locator('.diff-modal-content');
      const box = await diffModal.boundingBox();
      expect(box!.width).toBeGreaterThanOrEqual(370);
    }
  });
});
