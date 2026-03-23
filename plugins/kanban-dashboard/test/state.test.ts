import { describe, it, expect, beforeEach } from "vitest";
import {
  initDashboard,
  getProjectDir,
  getBaselineRef,
  getState,
  reset,
  addTask,
  updateTask,
  addLog,
  getLogs,
  addSignal,
  consumeSignals,
  getSignalStatus,
  addChatMessage,
  getChatState,
  answerOldestQuestion,
  addFreeformMessage,
  getUnreadFreeformMessages,
  getChatMessageById,
} from "../src/state.js";
import type { Task, LogEntry, Signal, ChatMessage } from "../src/state.js";

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

  it("stores leader and project in config", () => {
    initDashboard({ title: "T", subtitle: "S", leader: "alice", project: "my-app" });
    const { config } = getState();
    expect(config.leader).toBe("alice");
    expect(config.project).toBe("my-app");
  });

  it("returns undefined for leader and project when not provided", () => {
    initDashboard({ title: "T", subtitle: "S" });
    const { config } = getState();
    expect(config.leader).toBeUndefined();
    expect(config.project).toBeUndefined();
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
    addTask(makeTask({ id: 1, message: "old msg", progress: 0 }));
    updateTask(1, { message: "new msg", progress: 0.5 });
    const { tasks } = getState();
    expect(tasks[0].message).toBe("new msg");
    expect(tasks[0].progress).toBe(0.5);
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

describe("getBaselineRef", () => {
  beforeEach(() => {
    reset();
  });

  it("returns undefined when baseline_ref is not configured", () => {
    initDashboard({ title: "t", subtitle: "s" });
    expect(getBaselineRef()).toBeUndefined();
  });

  it("returns the configured baseline_ref after initDashboard", () => {
    initDashboard({ title: "t", subtitle: "s", baseline_ref: "abc123" });
    expect(getBaselineRef()).toBe("abc123");
  });

  it("returns undefined after reset", () => {
    initDashboard({ title: "t", subtitle: "s", baseline_ref: "abc123" });
    reset();
    expect(getBaselineRef()).toBeUndefined();
  });
});

describe("Task start_ref and end_ref", () => {
  beforeEach(() => {
    reset();
  });

  it("stores start_ref and end_ref on a task", () => {
    addTask(makeTask({ id: 1, start_ref: "aaa111", end_ref: "bbb222" }));
    const { tasks } = getState();
    expect(tasks[0].start_ref).toBe("aaa111");
    expect(tasks[0].end_ref).toBe("bbb222");
  });

  it("allows start_ref and end_ref to be undefined", () => {
    addTask(makeTask({ id: 1 }));
    const { tasks } = getState();
    expect(tasks[0].start_ref).toBeUndefined();
    expect(tasks[0].end_ref).toBeUndefined();
  });

  it("can update start_ref and end_ref via updateTask", () => {
    addTask(makeTask({ id: 1 }));
    updateTask(1, { start_ref: "ccc333", end_ref: "ddd444" });
    const { tasks } = getState();
    expect(tasks[0].start_ref).toBe("ccc333");
    expect(tasks[0].end_ref).toBe("ddd444");
  });
});

describe("baseline_ref in config state", () => {
  beforeEach(() => {
    reset();
  });

  it("includes baseline_ref in getState config", () => {
    initDashboard({ title: "t", subtitle: "s", baseline_ref: "ref123" });
    const { config } = getState();
    expect(config.baseline_ref).toBe("ref123");
  });
});

describe("updateTask progress normalization", () => {
  beforeEach(() => {
    reset();
  });

  it("normalizes progress > 1 by dividing by 100", () => {
    addTask(makeTask({ id: 1, progress: 0 }));
    updateTask(1, { progress: 75 });
    const { tasks } = getState();
    expect(tasks[0].progress).toBe(0.75);
  });

  it("leaves progress <= 1 unchanged", () => {
    addTask(makeTask({ id: 1, progress: 0 }));
    updateTask(1, { progress: 0.5 });
    const { tasks } = getState();
    expect(tasks[0].progress).toBe(0.5);
  });

  it("leaves progress of exactly 1 unchanged", () => {
    addTask(makeTask({ id: 1, progress: 0 }));
    updateTask(1, { progress: 1 });
    const { tasks } = getState();
    expect(tasks[0].progress).toBe(1);
  });

  it("normalizes progress of 100 to 1", () => {
    addTask(makeTask({ id: 1, progress: 0 }));
    updateTask(1, { progress: 100 });
    const { tasks } = getState();
    expect(tasks[0].progress).toBe(1);
  });
});

describe("updateTask auto-calculate progress from subtasks", () => {
  beforeEach(() => {
    reset();
  });

  it("calculates progress from subtasks_done / subtasks", () => {
    addTask(makeTask({ id: 1, subtasks: ["a", "b", "c", "d"], subtasks_done: ["a"] }));
    updateTask(1, { subtasks_done: ["a", "b"] });
    const { tasks } = getState();
    expect(tasks[0].progress).toBe(0.5);
  });

  it("sets progress to 0 when subtasks exist but none are done", () => {
    addTask(makeTask({ id: 1, subtasks: ["a", "b"], subtasks_done: [] }));
    updateTask(1, { message: "updated" });
    const { tasks } = getState();
    expect(tasks[0].progress).toBe(0);
  });

  it("sets progress to 1 when all subtasks are done", () => {
    addTask(makeTask({ id: 1, subtasks: ["a", "b"], subtasks_done: ["a"] }));
    updateTask(1, { subtasks_done: ["a", "b"] });
    const { tasks } = getState();
    expect(tasks[0].progress).toBe(1);
  });

  it("auto-calculated subtask progress takes precedence over manual progress", () => {
    addTask(makeTask({ id: 1, subtasks: ["a", "b", "c", "d"], subtasks_done: [] }));
    updateTask(1, { progress: 90, subtasks_done: ["a"] });
    const { tasks } = getState();
    expect(tasks[0].progress).toBe(0.25);
  });

  it("handles missing subtasks_done when subtasks exist", () => {
    addTask(makeTask({ id: 1, subtasks: ["a", "b"] }));
    updateTask(1, { message: "no done list" });
    const { tasks } = getState();
    expect(tasks[0].progress).toBe(0);
  });

  it("does not auto-calculate when subtasks array is empty", () => {
    addTask(makeTask({ id: 1, subtasks: [], progress: 0 }));
    updateTask(1, { progress: 50 });
    const { tasks } = getState();
    expect(tasks[0].progress).toBe(0.5);
  });

  it("does not auto-calculate when no subtasks field exists", () => {
    addTask(makeTask({ id: 1, progress: 0 }));
    updateTask(1, { progress: 80 });
    const { tasks } = getState();
    expect(tasks[0].progress).toBe(0.8);
  });
});

describe("updateTask message accumulation", () => {
  beforeEach(() => {
    reset();
  });

  it("appends message to messages array on update", () => {
    addTask(makeTask({ id: 1 }));
    updateTask(1, { message: "first update" });
    const { tasks } = getState();
    expect(tasks[0].messages).toHaveLength(1);
    expect(tasks[0].messages![0].text).toBe("first update");
  });

  it("accumulates multiple messages in order", () => {
    addTask(makeTask({ id: 1 }));
    updateTask(1, { message: "first" });
    updateTask(1, { message: "second" });
    updateTask(1, { message: "third" });
    const { tasks } = getState();
    expect(tasks[0].messages).toHaveLength(3);
    expect(tasks[0].messages!.map((m) => m.text)).toEqual([
      "first",
      "second",
      "third",
    ]);
  });

  it("sets time on each message entry", () => {
    addTask(makeTask({ id: 1 }));
    updateTask(1, { message: "timed" });
    const { tasks } = getState();
    expect(tasks[0].messages![0].time).toBeDefined();
    expect(typeof tasks[0].messages![0].time).toBe("string");
    expect(tasks[0].messages![0].time.length).toBeGreaterThan(0);
  });

  it("does not append empty messages", () => {
    addTask(makeTask({ id: 1 }));
    updateTask(1, { message: "" });
    const { tasks } = getState();
    expect(tasks[0].messages).toBeUndefined();
  });

  it("does not create messages array when message is not in update", () => {
    addTask(makeTask({ id: 1 }));
    updateTask(1, { progress: 50 });
    const { tasks } = getState();
    expect(tasks[0].messages).toBeUndefined();
  });
});

describe("signal state", () => {
  beforeEach(() => {
    reset();
  });

  it("addSignal stores a signal for an agent", () => {
    addSignal("alice", { action: "poke", timestamp: "2026-02-25T14:00:00.000Z", source: "browser" });
    const status = getSignalStatus();
    expect(status).toHaveLength(1);
    expect(status[0].agent).toBe("alice");
    expect(status[0].action).toBe("poke");
    expect(status[0].acknowledged).toBe(false);
  });

  it("consumeSignals returns and clears signals for an agent", () => {
    addSignal("alice", { action: "poke", timestamp: "2026-02-25T14:00:00.000Z", source: "browser" });
    addSignal("alice", { action: "shake", timestamp: "2026-02-25T14:01:00.000Z", source: "browser" });
    const signals = consumeSignals("alice");
    expect(signals).toHaveLength(2);
    expect(signals[0].action).toBe("poke");
    expect(signals[1].action).toBe("shake");
    const status = getSignalStatus();
    expect(status.every(s => s.acknowledged)).toBe(true);
  });

  it("consumeSignals returns empty array when no signals exist", () => {
    const signals = consumeSignals("bob");
    expect(signals).toEqual([]);
  });

  it("signals for different agents are independent", () => {
    addSignal("alice", { action: "poke", timestamp: "2026-02-25T14:00:00.000Z", source: "browser" });
    addSignal("bob", { action: "shake", timestamp: "2026-02-25T14:01:00.000Z", source: "browser" });
    const aliceSignals = consumeSignals("alice");
    expect(aliceSignals).toHaveLength(1);
    expect(aliceSignals[0].action).toBe("poke");
    const status = getSignalStatus();
    const bobPending = status.filter(s => s.agent === "bob" && !s.acknowledged);
    expect(bobPending).toHaveLength(1);
  });

  it("reset clears all signals", () => {
    addSignal("alice", { action: "poke", timestamp: "2026-02-25T14:00:00.000Z", source: "browser" });
    reset();
    const status = getSignalStatus();
    expect(status).toHaveLength(0);
  });

  it("consumeSignals returns empty on second call after signals are consumed", () => {
    addSignal("alice", { action: "poke", timestamp: "2026-02-25T14:00:00.000Z", source: "browser" });
    consumeSignals("alice");
    const second = consumeSignals("alice");
    expect(second).toEqual([]);
  });

  it("getSignalStatus returns defensive copies", () => {
    addSignal("alice", { action: "poke", timestamp: "2026-02-25T14:00:00.000Z", source: "browser" });
    const status = getSignalStatus();
    status[0].action = "tampered";
    const fresh = getSignalStatus();
    expect(fresh[0].action).toBe("poke");
  });

  it("consumeSignals returns defensive copies", () => {
    addSignal("alice", { action: "poke", timestamp: "2026-02-25T14:00:00.000Z", source: "browser" });
    const signals = consumeSignals("alice");
    signals[0].action = "tampered";
    // Re-add and consume to verify independence
    addSignal("alice", { action: "shake", timestamp: "2026-02-25T14:01:00.000Z", source: "browser" });
    const fresh = consumeSignals("alice");
    expect(fresh[0].action).toBe("shake");
  });
});

describe("addChatMessage and getChatState", () => {
  beforeEach(() => {
    reset();
  });

  it("stores an agent message with correct fields", () => {
    const msg = addChatMessage({ sender: "agent", text: "What is your goal?", waiting: true });
    expect(msg.id).toBe(1);
    expect(msg.sender).toBe("agent");
    expect(msg.text).toBe("What is your goal?");
    expect(msg.waiting).toBe(true);
    expect(msg.answered).toBe(false);
    expect(typeof msg.timestamp).toBe("string");
    expect(msg.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(msg.response_to).toBeUndefined();
  });

  it("auto-increments IDs", () => {
    const m1 = addChatMessage({ sender: "agent", text: "Q1", waiting: true });
    const m2 = addChatMessage({ sender: "agent", text: "Q2", waiting: true });
    const m3 = addChatMessage({ sender: "user", text: "A", waiting: false });
    expect(m1.id).toBe(1);
    expect(m2.id).toBe(2);
    expect(m3.id).toBe(3);
  });

  it("getChatState waiting is true when a question is pending", () => {
    addChatMessage({ sender: "agent", text: "Ready?", waiting: true });
    const state = getChatState();
    expect(state.waiting).toBe(true);
    expect(state.pending_questions).toBe(1);
  });

  it("getChatState waiting is false when no pending questions", () => {
    addChatMessage({ sender: "agent", text: "Hello", waiting: false });
    const state = getChatState();
    expect(state.waiting).toBe(false);
    expect(state.pending_questions).toBe(0);
  });

  it("getChatState messages contains all stored messages", () => {
    addChatMessage({ sender: "agent", text: "Q", waiting: true });
    addChatMessage({ sender: "user", text: "A", waiting: false });
    const state = getChatState();
    expect(state.messages).toHaveLength(2);
  });

  it("getChatState returns defensive copies of messages", () => {
    addChatMessage({ sender: "agent", text: "Original", waiting: false });
    const state = getChatState();
    state.messages[0].text = "Mutated";
    const fresh = getChatState();
    expect(fresh.messages[0].text).toBe("Original");
  });
});

describe("answerOldestQuestion", () => {
  beforeEach(() => {
    reset();
  });

  it("marks oldest pending question as answered and returns user message with response_to", () => {
    const q = addChatMessage({ sender: "agent", text: "What next?", waiting: true });
    const userMsg = answerOldestQuestion("Deploy it");
    expect(userMsg).not.toBeNull();
    expect(userMsg!.sender).toBe("user");
    expect(userMsg!.text).toBe("Deploy it");
    expect(userMsg!.response_to).toBe(q.id);
    expect(userMsg!.waiting).toBe(false);
    const state = getChatState();
    const agentMsg = state.messages.find(m => m.id === q.id)!;
    expect(agentMsg.answered).toBe(true);
    expect(agentMsg.waiting).toBe(true); // waiting is immutable
  });

  it("returns null when no pending question exists", () => {
    addChatMessage({ sender: "agent", text: "Hello", waiting: false });
    const result = answerOldestQuestion("anything");
    expect(result).toBeNull();
  });

  it("answers questions in FIFO order", () => {
    const q1 = addChatMessage({ sender: "agent", text: "Q1", waiting: true });
    const q2 = addChatMessage({ sender: "agent", text: "Q2", waiting: true });
    const q3 = addChatMessage({ sender: "agent", text: "Q3", waiting: true });
    const ans1 = answerOldestQuestion("A1");
    expect(ans1!.response_to).toBe(q1.id);
    const ans2 = answerOldestQuestion("A2");
    expect(ans2!.response_to).toBe(q2.id);
    // Q3 still unanswered
    const state = getChatState();
    const q3State = state.messages.find(m => m.id === q3.id)!;
    expect(q3State.answered).toBe(false);
    expect(state.waiting).toBe(true);
    expect(state.pending_questions).toBe(1);
  });
});

describe("addFreeformMessage", () => {
  beforeEach(() => {
    reset();
  });

  it("creates a user message with no response_to", () => {
    const msg = addFreeformMessage("Just checking in");
    expect(msg.sender).toBe("user");
    expect(msg.text).toBe("Just checking in");
    expect(msg.waiting).toBe(false);
    expect(msg.response_to).toBeUndefined();
  });
});

describe("getUnreadFreeformMessages", () => {
  beforeEach(() => {
    reset();
  });

  it("returns unread free-form user messages", () => {
    addFreeformMessage("hello");
    addFreeformMessage("world");
    const unread = getUnreadFreeformMessages();
    expect(unread).toHaveLength(2);
    expect(unread[0].text).toBe("hello");
    expect(unread[1].text).toBe("world");
  });

  it("marks messages as read on retrieval — second call returns empty", () => {
    addFreeformMessage("once");
    getUnreadFreeformMessages();
    const second = getUnreadFreeformMessages();
    expect(second).toHaveLength(0);
  });

  it("excludes question responses (messages with response_to)", () => {
    addChatMessage({ sender: "agent", text: "Q?", waiting: true });
    answerOldestQuestion("response to Q");
    addFreeformMessage("freeform msg");
    const unread = getUnreadFreeformMessages();
    expect(unread).toHaveLength(1);
    expect(unread[0].text).toBe("freeform msg");
  });

  it("returns id, text, and timestamp fields", () => {
    const msg = addFreeformMessage("test");
    const unread = getUnreadFreeformMessages();
    expect(unread[0].id).toBe(msg.id);
    expect(unread[0].text).toBe("test");
    expect(typeof unread[0].timestamp).toBe("string");
  });
});

describe("getChatMessageById", () => {
  beforeEach(() => {
    reset();
  });

  it("returns the message for a valid ID", () => {
    const msg = addChatMessage({ sender: "agent", text: "Hi", waiting: false });
    const found = getChatMessageById(msg.id);
    expect(found).not.toBeNull();
    expect(found!.id).toBe(msg.id);
    expect(found!.text).toBe("Hi");
  });

  it("returns null for an unknown ID", () => {
    const result = getChatMessageById(9999);
    expect(result).toBeNull();
  });

  it("returns a defensive copy", () => {
    const msg = addChatMessage({ sender: "agent", text: "Original", waiting: false });
    const found = getChatMessageById(msg.id)!;
    found.text = "Mutated";
    const fresh = getChatMessageById(msg.id)!;
    expect(fresh.text).toBe("Original");
  });
});

describe("reset clears chat state", () => {
  beforeEach(() => {
    reset();
  });

  it("clears all chat messages", () => {
    addChatMessage({ sender: "agent", text: "Q", waiting: true });
    addFreeformMessage("hello");
    reset();
    const state = getChatState();
    expect(state.messages).toHaveLength(0);
    expect(state.waiting).toBe(false);
  });

  it("resets counter so next ID is 1 again", () => {
    addChatMessage({ sender: "agent", text: "Q", waiting: false });
    reset();
    const msg = addChatMessage({ sender: "agent", text: "After reset", waiting: false });
    expect(msg.id).toBe(1);
  });

  it("clears readFreeformIds so previously read messages are forgotten", () => {
    addFreeformMessage("read me");
    getUnreadFreeformMessages(); // marks as read
    reset();
    addFreeformMessage("new msg after reset");
    const unread = getUnreadFreeformMessages();
    expect(unread).toHaveLength(1);
  });
});

describe("chat 500 message cap", () => {
  beforeEach(() => {
    reset();
  });

  it("caps stored messages at 500, dropping oldest", () => {
    for (let i = 1; i <= 502; i++) {
      addChatMessage({ sender: "agent", text: `msg ${i}`, waiting: false });
    }
    const state = getChatState();
    expect(state.messages).toHaveLength(500);
    expect(state.messages[0].text).toBe("msg 3");
    expect(state.messages[499].text).toBe("msg 502");
  });
});
