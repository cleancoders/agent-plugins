import { describe, it, expect, beforeEach } from "vitest";
import {
  initDashboard,
  getProjectDir,
  getState,
  reset,
  addTask,
  updateTask,
  addLog,
  getLogs,
} from "../src/state.js";
import type { Task, LogEntry } from "../src/state.js";

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 1,
    title: "Task 1",
    agent: "agent-a",
    agent_color: "#ff0000",
    status: "ready",
    message: "doing stuff",
    progress: 0,
    ...overrides,
  };
}

function makeLog(overrides: Partial<LogEntry> = {}): LogEntry {
  return {
    time: "2026-02-18T00:00:00Z",
    agent: "agent-a",
    color: "#ff0000",
    message: "something happened",
    ...overrides,
  };
}

describe("getProjectDir", () => {
  beforeEach(() => {
    reset();
  });

  it("returns undefined when project_dir is not configured", () => {
    initDashboard({ title: "t", subtitle: "s" });
    expect(getProjectDir()).toBeUndefined();
  });

  it("returns the configured project_dir after initDashboard", () => {
    initDashboard({ title: "t", subtitle: "s", project_dir: "/some/path" });
    expect(getProjectDir()).toBe("/some/path");
  });

  it("returns undefined after reset", () => {
    initDashboard({ title: "t", subtitle: "s", project_dir: "/some/path" });
    reset();
    expect(getProjectDir()).toBeUndefined();
  });
});

describe("initDashboard", () => {
  beforeEach(() => {
    reset();
  });

  it("sets title, subtitle, and project_dir in config", () => {
    initDashboard({ title: "My Board", subtitle: "v2", project_dir: "/proj" });
    const { config } = getState();
    expect(config.title).toBe("My Board");
    expect(config.subtitle).toBe("v2");
    expect(config.project_dir).toBe("/proj");
  });

  it("overwrites previous config on re-init", () => {
    initDashboard({ title: "First", subtitle: "s1", project_dir: "/old" });
    initDashboard({ title: "Second", subtitle: "s2", project_dir: "/new" });
    const { config } = getState();
    expect(config.title).toBe("Second");
    expect(config.subtitle).toBe("s2");
    expect(config.project_dir).toBe("/new");
  });
});

describe("addTask", () => {
  beforeEach(() => {
    reset();
  });

  it("adds a task visible in getState", () => {
    addTask(makeTask({ id: 1, title: "Alpha" }));
    const { tasks } = getState();
    expect(tasks).toHaveLength(1);
    expect(tasks[0].id).toBe(1);
    expect(tasks[0].title).toBe("Alpha");
  });

  it("preserves insertion order of multiple tasks", () => {
    addTask(makeTask({ id: 1, title: "First" }));
    addTask(makeTask({ id: 2, title: "Second" }));
    addTask(makeTask({ id: 3, title: "Third" }));
    const { tasks } = getState();
    expect(tasks.map((t) => t.id)).toEqual([1, 2, 3]);
  });

  it("makes a defensive copy so mutating the original object does not affect stored task", () => {
    const original = makeTask({ id: 5, title: "Original" });
    addTask(original);
    original.title = "Mutated";
    const { tasks } = getState();
    expect(tasks[0].title).toBe("Original");
  });
});

describe("updateTask", () => {
  beforeEach(() => {
    reset();
  });

  it("updates fields on an existing task", () => {
    addTask(makeTask({ id: 1, message: "old msg", progress: 10 }));
    updateTask(1, { message: "new msg", progress: 50 });
    const { tasks } = getState();
    expect(tasks[0].message).toBe("new msg");
    expect(tasks[0].progress).toBe(50);
  });

  it("is a no-op when id is not found", () => {
    addTask(makeTask({ id: 1, title: "Only task" }));
    updateTask(999, { title: "Ghost" });
    const { tasks } = getState();
    expect(tasks).toHaveLength(1);
    expect(tasks[0].title).toBe("Only task");
  });

  it("merges partial updates without overwriting other fields", () => {
    addTask(makeTask({ id: 1, title: "Keep me", message: "Update me" }));
    updateTask(1, { message: "Updated" });
    const { tasks } = getState();
    expect(tasks[0].title).toBe("Keep me");
    expect(tasks[0].message).toBe("Updated");
  });

  it("can change status", () => {
    addTask(makeTask({ id: 1, status: "in_progress" }));
    updateTask(1, { status: "done" });
    const { tasks } = getState();
    expect(tasks[0].status).toBe("done");
  });
});

describe("updateTask + unblockDependents", () => {
  beforeEach(() => {
    reset();
  });

  it("unblocks a dependent when its single blocker is done", () => {
    addTask(makeTask({ id: 1, status: "in_progress" }));
    addTask(makeTask({ id: 2, status: "blocked", blocked_by: [1] }));
    updateTask(1, { status: "done" });
    const { tasks } = getState();
    const task2 = tasks.find((t) => t.id === 2)!;
    expect(task2.status).toBe("ready");
  });

  it("does NOT unblock when only some blockers are done", () => {
    addTask(makeTask({ id: 1, status: "in_progress" }));
    addTask(makeTask({ id: 2, status: "in_progress" }));
    addTask(makeTask({ id: 3, status: "blocked", blocked_by: [1, 2] }));
    updateTask(1, { status: "done" });
    const { tasks } = getState();
    const task3 = tasks.find((t) => t.id === 3)!;
    expect(task3.status).toBe("blocked");
  });

  it("only unblocks tasks in 'blocked' status, not 'ready' tasks that happen to have blocked_by", () => {
    addTask(makeTask({ id: 1, status: "in_progress" }));
    addTask(makeTask({ id: 2, status: "ready", blocked_by: [1] }));
    updateTask(1, { status: "done" });
    const { tasks } = getState();
    const task2 = tasks.find((t) => t.id === 2)!;
    expect(task2.status).toBe("ready");
  });

  it("handles empty blocked_by array without changing status", () => {
    addTask(makeTask({ id: 1, status: "in_progress" }));
    addTask(makeTask({ id: 2, status: "blocked", blocked_by: [] }));
    updateTask(1, { status: "done" });
    const { tasks } = getState();
    const task2 = tasks.find((t) => t.id === 2)!;
    expect(task2.status).toBe("blocked");
  });
});

describe("addLog", () => {
  beforeEach(() => {
    reset();
  });

  it("adds an entry visible in getLogs", () => {
    addLog(makeLog({ message: "first log" }));
    const { entries } = getLogs();
    expect(entries).toHaveLength(1);
    expect(entries[0].message).toBe("first log");
  });

  it("preserves insertion order", () => {
    addLog(makeLog({ message: "A" }));
    addLog(makeLog({ message: "B" }));
    addLog(makeLog({ message: "C" }));
    const { entries } = getLogs();
    expect(entries.map((e) => e.message)).toEqual(["A", "B", "C"]);
  });

  it("makes a defensive copy so mutating the original does not affect stored entry", () => {
    const original = makeLog({ message: "Original" });
    addLog(original);
    original.message = "Mutated";
    const { entries } = getLogs();
    expect(entries[0].message).toBe("Original");
  });
});

describe("getState", () => {
  beforeEach(() => {
    reset();
  });

  it("returns an ISO-formatted server_time string", () => {
    const { server_time } = getState();
    expect(server_time).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
    );
  });

  it("returns defensive copies so mutating returned tasks does not affect state", () => {
    addTask(makeTask({ id: 1, title: "Immutable" }));
    const { tasks } = getState();
    tasks[0].title = "Mutated";
    const { tasks: freshTasks } = getState();
    expect(freshTasks[0].title).toBe("Immutable");
  });
});

describe("getLogs", () => {
  beforeEach(() => {
    reset();
  });

  it("returns defensive copies so mutating returned entries does not affect state", () => {
    addLog(makeLog({ message: "Safe" }));
    const { entries } = getLogs();
    entries[0].message = "Tampered";
    const { entries: freshEntries } = getLogs();
    expect(freshEntries[0].message).toBe("Safe");
  });
});

describe("reset", () => {
  beforeEach(() => {
    reset();
  });

  it("clears all tasks", () => {
    addTask(makeTask({ id: 1 }));
    addTask(makeTask({ id: 2 }));
    reset();
    const { tasks } = getState();
    expect(tasks).toHaveLength(0);
  });

  it("clears all logs", () => {
    addLog(makeLog({ message: "gone" }));
    reset();
    const { entries } = getLogs();
    expect(entries).toHaveLength(0);
  });

  it("resets config to defaults", () => {
    initDashboard({ title: "Custom", subtitle: "Sub", project_dir: "/x" });
    reset();
    const { config } = getState();
    expect(config.title).toBe("Dashboard");
    expect(config.subtitle).toBe("");
    expect(config.project_dir).toBeUndefined();
  });
});
