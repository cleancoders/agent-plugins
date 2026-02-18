import { describe, it, expect, beforeEach, vi } from "vitest";
import { registerTools } from "../src/tools.js";
import { getState, getProjectDir, getBaselineRef, getLogs, reset } from "../src/state.js";

vi.mock("../src/http-server.js", () => ({
  startServer: vi.fn().mockResolvedValue({ url: "http://localhost:1234", port: 1234 }),
  stopServer: vi.fn().mockResolvedValue(undefined),
  isRunning: vi.fn().mockReturnValue(false),
}));

vi.mock("child_process", () => ({
  exec: vi.fn(),
  execSync: vi.fn(),
}));

vi.mock("os", () => ({
  platform: vi.fn().mockReturnValue("darwin"),
}));

import { startServer, stopServer, isRunning } from "../src/http-server.js";
import { exec, execSync } from "child_process";
import { platform } from "os";

type ToolHandler = (args: Record<string, unknown>) => Promise<unknown>;

interface RegisteredTool {
  name: string;
  description: string;
  schema: Record<string, unknown>;
  handler: ToolHandler;
}

function createMockServer(): { server: any; tools: Map<string, RegisteredTool> } {
  const tools = new Map<string, RegisteredTool>();
  const server = {
    tool: (name: string, description: string, schema: Record<string, unknown>, handler: ToolHandler) => {
      tools.set(name, { name, description, schema, handler });
    },
  };
  return { server, tools };
}

function parseResult(result: any): any {
  return JSON.parse(result.content[0].text);
}

describe("kanban_init tool - project_dir parameter", () => {
  let tools: Map<string, RegisteredTool>;
  let mockServer: any;

  beforeEach(() => {
    reset();
    vi.mocked(startServer).mockClear();
    vi.mocked(stopServer).mockClear();
    vi.mocked(isRunning).mockClear();
    vi.mocked(isRunning).mockReturnValue(false);
    vi.mocked(exec).mockClear();
    vi.mocked(platform).mockReturnValue("darwin");
    const mock = createMockServer();
    mockServer = mock.server;
    tools = mock.tools;
    registerTools(mockServer);
  });

  it("passes project_dir to initDashboard when provided", async () => {
    const handler = tools.get("kanban_init")!.handler;

    await handler({
      title: "Test Dashboard",
      subtitle: "Test Subtitle",
      tasks: [],
      port: 0,
      open_browser: false,
      project_dir: "/my/project/path",
    });

    expect(getProjectDir()).toBe("/my/project/path");
  });

  it("works without project_dir (backward compatibility)", async () => {
    const handler = tools.get("kanban_init")!.handler;

    await handler({
      title: "Test Dashboard",
      subtitle: "Test Subtitle",
      tasks: [],
      port: 0,
      open_browser: false,
    });

    expect(getProjectDir()).toBeUndefined();
  });

  it("stores project_dir in dashboard config accessible via getState", async () => {
    const handler = tools.get("kanban_init")!.handler;

    await handler({
      title: "Test Dashboard",
      subtitle: "",
      tasks: [],
      port: 0,
      open_browser: false,
      project_dir: "/some/repo",
    });

    const state = getState();
    expect(state.config.project_dir).toBe("/some/repo");
  });
});

describe("getAgentColor (via tool handlers)", () => {
  let tools: Map<string, RegisteredTool>;

  beforeEach(() => {
    reset();
    vi.mocked(startServer).mockClear();
    vi.mocked(stopServer).mockClear();
    vi.mocked(isRunning).mockClear();
    vi.mocked(isRunning).mockReturnValue(false);
    vi.mocked(exec).mockClear();
    vi.mocked(platform).mockReturnValue("darwin");
    const mock = createMockServer();
    tools = mock.tools;
    registerTools(mock.server);
  });

  it("assigns pool colors sequentially (first agent gets #ff6b6b, second gets #ffd43b)", async () => {
    const handler = tools.get("kanban_init")!.handler;
    await handler({
      title: "Test",
      subtitle: "",
      tasks: [
        { id: 1, title: "Task A", agent: "alice" },
        { id: 2, title: "Task B", agent: "bob" },
      ],
      port: 0,
      open_browser: false,
    });

    const state = getState();
    expect(state.tasks[0].agent_color).toBe("#ff6b6b");
    expect(state.tasks[1].agent_color).toBe("#ffd43b");
  });

  it("returns same color for same agent", async () => {
    const handler = tools.get("kanban_init")!.handler;
    await handler({
      title: "Test",
      subtitle: "",
      tasks: [
        { id: 1, title: "Task A", agent: "alice" },
        { id: 2, title: "Task B", agent: "alice" },
      ],
      port: 0,
      open_browser: false,
    });

    const state = getState();
    expect(state.tasks[0].agent_color).toBe("#ff6b6b");
    expect(state.tasks[1].agent_color).toBe("#ff6b6b");
  });

  it("uses explicit color when provided", async () => {
    const handler = tools.get("kanban_init")!.handler;
    await handler({
      title: "Test",
      subtitle: "",
      tasks: [
        { id: 1, title: "Task A", agent: "alice", agent_color: "#00ff00" },
      ],
      port: 0,
      open_browser: false,
    });

    const state = getState();
    expect(state.tasks[0].agent_color).toBe("#00ff00");
  });

  it("wraps around after 10 colors", async () => {
    const handler = tools.get("kanban_init")!.handler;
    const tasks = [];
    for (let i = 0; i < 11; i++) {
      tasks.push({ id: i, title: `Task ${i}`, agent: `agent-${i}` });
    }
    await handler({
      title: "Test",
      subtitle: "",
      tasks,
      port: 0,
      open_browser: false,
    });

    const state = getState();
    // 11th agent (index 10) should wrap around to first color
    expect(state.tasks[10].agent_color).toBe("#ff6b6b");
  });

  it("kanban_init resets color state (color index resets)", async () => {
    const handler = tools.get("kanban_init")!.handler;

    // First init assigns a color
    await handler({
      title: "Test",
      subtitle: "",
      tasks: [{ id: 1, title: "Task A", agent: "alice" }],
      port: 0,
      open_browser: false,
    });
    expect(getState().tasks[0].agent_color).toBe("#ff6b6b");

    // Second init should reset, so new agent gets first color again
    await handler({
      title: "Test 2",
      subtitle: "",
      tasks: [{ id: 2, title: "Task B", agent: "bob" }],
      port: 0,
      open_browser: false,
    });
    expect(getState().tasks[0].agent_color).toBe("#ff6b6b");
  });
});

describe("kanban_init", () => {
  let tools: Map<string, RegisteredTool>;

  beforeEach(() => {
    reset();
    vi.mocked(startServer).mockClear();
    vi.mocked(startServer).mockResolvedValue({ url: "http://localhost:1234", port: 1234 });
    vi.mocked(stopServer).mockClear();
    vi.mocked(isRunning).mockClear();
    vi.mocked(isRunning).mockReturnValue(false);
    vi.mocked(exec).mockClear();
    vi.mocked(platform).mockReturnValue("darwin");
    const mock = createMockServer();
    tools = mock.tools;
    registerTools(mock.server);
  });

  it("resets state", async () => {
    // Pre-populate state via a first init
    const handler = tools.get("kanban_init")!.handler;
    await handler({
      title: "Old",
      subtitle: "",
      tasks: [{ id: 99, title: "Old Task", agent: "old-agent" }],
      port: 0,
      open_browser: false,
    });
    expect(getState().tasks).toHaveLength(1);

    // Second init should reset
    await handler({
      title: "New",
      subtitle: "",
      tasks: [],
      port: 0,
      open_browser: false,
    });
    expect(getState().tasks).toHaveLength(0);
    expect(getState().config.title).toBe("New");
  });

  it("creates tasks from array", async () => {
    const handler = tools.get("kanban_init")!.handler;
    await handler({
      title: "Test",
      subtitle: "",
      tasks: [
        { id: 1, title: "Task 1", agent: "a1" },
        { id: 2, title: "Task 2", agent: "a2" },
        { id: 3, title: "Task 3", agent: "a3" },
      ],
      port: 0,
      open_browser: false,
    });

    const state = getState();
    expect(state.tasks).toHaveLength(3);
    expect(state.tasks[0].id).toBe(1);
    expect(state.tasks[1].id).toBe(2);
    expect(state.tasks[2].id).toBe(3);
  });

  it("applies defaults (status=ready, message='', progress=0)", async () => {
    const handler = tools.get("kanban_init")!.handler;
    await handler({
      title: "Test",
      subtitle: "",
      tasks: [{ id: 1, title: "Task 1", agent: "a1" }],
      port: 0,
      open_browser: false,
    });

    const task = getState().tasks[0];
    expect(task.status).toBe("ready");
    expect(task.message).toBe("");
    expect(task.progress).toBe(0);
  });

  it("conditionally includes optional fields", async () => {
    const handler = tools.get("kanban_init")!.handler;
    await handler({
      title: "Test",
      subtitle: "",
      tasks: [
        {
          id: 1,
          title: "Full Task",
          agent: "a1",
          high: 5,
          medium: 3,
          low: 1,
          blocked_by: [2, 3],
          phase: 2,
          files: ["file1.ts", "file2.ts"],
          subtasks: ["sub1", "sub2"],
          subtasks_done: ["sub1"],
        },
      ],
      port: 0,
      open_browser: false,
    });

    const task = getState().tasks[0];
    expect(task.high).toBe(5);
    expect(task.medium).toBe(3);
    expect(task.low).toBe(1);
    expect(task.blocked_by).toEqual([2, 3]);
    expect(task.phase).toBe(2);
    expect(task.files).toEqual(["file1.ts", "file2.ts"]);
    expect(task.subtasks).toEqual(["sub1", "sub2"]);
    expect(task.subtasks_done).toEqual(["sub1"]);
  });

  it("starts server when not running (calls startServer)", async () => {
    vi.mocked(isRunning).mockReturnValue(false);
    const handler = tools.get("kanban_init")!.handler;
    await handler({
      title: "Test",
      subtitle: "",
      tasks: [],
      port: 0,
      open_browser: false,
    });

    expect(startServer).toHaveBeenCalledWith(0);
  });

  it("skips server start when already running", async () => {
    vi.mocked(isRunning).mockReturnValue(true);
    const handler = tools.get("kanban_init")!.handler;
    await handler({
      title: "Test",
      subtitle: "",
      tasks: [],
      port: 0,
      open_browser: false,
    });

    expect(startServer).not.toHaveBeenCalled();
  });

  it("returns url/port in result", async () => {
    const handler = tools.get("kanban_init")!.handler;
    const result = await handler({
      title: "Test",
      subtitle: "",
      tasks: [],
      port: 0,
      open_browser: false,
    });

    const parsed = parseResult(result);
    expect(parsed.url).toBe("http://localhost:1234");
    expect(parsed.port).toBe(1234);
  });

  it("opens browser when open_browser=true", async () => {
    const handler = tools.get("kanban_init")!.handler;
    await handler({
      title: "Test",
      subtitle: "",
      tasks: [],
      port: 0,
      open_browser: true,
    });

    expect(exec).toHaveBeenCalledWith("open http://localhost:1234", expect.any(Function));
  });

  it("skips browser when open_browser=false", async () => {
    const handler = tools.get("kanban_init")!.handler;
    await handler({
      title: "Test",
      subtitle: "",
      tasks: [],
      port: 0,
      open_browser: false,
    });

    expect(exec).not.toHaveBeenCalled();
  });
});

describe("kanban_add_task", () => {
  let tools: Map<string, RegisteredTool>;

  beforeEach(() => {
    reset();
    vi.mocked(startServer).mockClear();
    vi.mocked(stopServer).mockClear();
    vi.mocked(isRunning).mockClear();
    vi.mocked(isRunning).mockReturnValue(false);
    vi.mocked(exec).mockClear();
    vi.mocked(platform).mockReturnValue("darwin");
    const mock = createMockServer();
    tools = mock.tools;
    registerTools(mock.server);
    // Initialize dashboard first to reset color state
  });

  async function initEmpty() {
    await tools.get("kanban_init")!.handler({
      title: "Test",
      subtitle: "",
      tasks: [],
      port: 0,
      open_browser: false,
    });
  }

  it("adds task to state", async () => {
    await initEmpty();
    const handler = tools.get("kanban_add_task")!.handler;
    await handler({
      id: 42,
      title: "New Task",
      agent: "agent-x",
    });

    const state = getState();
    expect(state.tasks).toHaveLength(1);
    expect(state.tasks[0].id).toBe(42);
    expect(state.tasks[0].title).toBe("New Task");
    expect(state.tasks[0].agent).toBe("agent-x");
  });

  it("returns success with task_id", async () => {
    await initEmpty();
    const handler = tools.get("kanban_add_task")!.handler;
    const result = await handler({
      id: 7,
      title: "Task Seven",
      agent: "agent-7",
    });

    const parsed = parseResult(result);
    expect(parsed.success).toBe(true);
    expect(parsed.task_id).toBe(7);
  });

  it("assigns color via getAgentColor", async () => {
    await initEmpty();
    const handler = tools.get("kanban_add_task")!.handler;
    await handler({
      id: 1,
      title: "Task",
      agent: "agent-new",
    });

    const state = getState();
    // After init reset, first agent gets first color
    expect(state.tasks[0].agent_color).toBe("#ff6b6b");
  });

  it("applies defaults for status/message/progress", async () => {
    await initEmpty();
    const handler = tools.get("kanban_add_task")!.handler;
    await handler({
      id: 1,
      title: "Defaults Task",
      agent: "agent-d",
    });

    const task = getState().tasks[0];
    expect(task.status).toBe("ready");
    expect(task.message).toBe("");
    expect(task.progress).toBe(0);
  });

  it("includes optional fields (files/subtasks/blocked_by)", async () => {
    await initEmpty();
    const handler = tools.get("kanban_add_task")!.handler;
    await handler({
      id: 1,
      title: "Full Task",
      agent: "agent-f",
      files: ["a.ts", "b.ts"],
      subtasks: ["s1", "s2"],
      blocked_by: [10, 20],
    });

    const task = getState().tasks[0];
    expect(task.files).toEqual(["a.ts", "b.ts"]);
    expect(task.subtasks).toEqual(["s1", "s2"]);
    expect(task.blocked_by).toEqual([10, 20]);
  });
});

describe("kanban_update_task", () => {
  let tools: Map<string, RegisteredTool>;

  beforeEach(() => {
    reset();
    vi.mocked(startServer).mockClear();
    vi.mocked(stopServer).mockClear();
    vi.mocked(isRunning).mockClear();
    vi.mocked(isRunning).mockReturnValue(false);
    vi.mocked(exec).mockClear();
    vi.mocked(platform).mockReturnValue("darwin");
    const mock = createMockServer();
    tools = mock.tools;
    registerTools(mock.server);
  });

  async function initWithTask() {
    await tools.get("kanban_init")!.handler({
      title: "Test",
      subtitle: "",
      tasks: [
        { id: 1, title: "Task One", agent: "alice", status: "ready", message: "initial", progress: 0 },
      ],
      port: 0,
      open_browser: false,
    });
  }

  it("updates status", async () => {
    await initWithTask();
    const handler = tools.get("kanban_update_task")!.handler;
    await handler({ id: 1, status: "in_progress" });

    expect(getState().tasks[0].status).toBe("in_progress");
  });

  it("updates message", async () => {
    await initWithTask();
    const handler = tools.get("kanban_update_task")!.handler;
    await handler({ id: 1, message: "working on it" });

    expect(getState().tasks[0].message).toBe("working on it");
  });

  it("updates progress", async () => {
    await initWithTask();
    const handler = tools.get("kanban_update_task")!.handler;
    await handler({ id: 1, progress: 75 });

    // state normalizes progress to 0-1 range (75 / 100 = 0.75)
    expect(getState().tasks[0].progress).toBe(0.75);
  });

  it("updates subtasks_done", async () => {
    await initWithTask();
    const handler = tools.get("kanban_update_task")!.handler;
    await handler({ id: 1, subtasks_done: ["step1", "step2"] });

    expect(getState().tasks[0].subtasks_done).toEqual(["step1", "step2"]);
  });

  it("updates agent and assigns color", async () => {
    await initWithTask();
    const handler = tools.get("kanban_update_task")!.handler;
    await handler({ id: 1, agent: "bob" });

    const task = getState().tasks[0];
    expect(task.agent).toBe("bob");
    // bob is a new agent after alice, should get second color
    expect(task.agent_color).toBe("#ffd43b");
  });

  it("updates severity fields (high/medium/low)", async () => {
    await initWithTask();
    const handler = tools.get("kanban_update_task")!.handler;
    await handler({ id: 1, high: 10, medium: 5, low: 2 });

    const task = getState().tasks[0];
    expect(task.high).toBe(10);
    expect(task.medium).toBe(5);
    expect(task.low).toBe(2);
  });

  it("updates files", async () => {
    await initWithTask();
    const handler = tools.get("kanban_update_task")!.handler;
    await handler({ id: 1, files: ["new-file.ts"] });

    expect(getState().tasks[0].files).toEqual(["new-file.ts"]);
  });

  it("assigns color on agent change", async () => {
    await initWithTask();
    const handler = tools.get("kanban_update_task")!.handler;
    await handler({ id: 1, agent: "charlie", agent_color: "#abcdef" });

    const task = getState().tasks[0];
    expect(task.agent).toBe("charlie");
    expect(task.agent_color).toBe("#abcdef");
  });

  it("uses explicit agent_color without agent field", async () => {
    await initWithTask();
    const handler = tools.get("kanban_update_task")!.handler;
    await handler({ id: 1, agent_color: "#999999" });

    const task = getState().tasks[0];
    // agent should remain unchanged
    expect(task.agent).toBe("alice");
    expect(task.agent_color).toBe("#999999");
  });

  it("ignores undefined fields", async () => {
    await initWithTask();
    const handler = tools.get("kanban_update_task")!.handler;
    // Only update message; everything else stays the same
    await handler({ id: 1, message: "updated" });

    const task = getState().tasks[0];
    expect(task.status).toBe("ready");
    expect(task.progress).toBe(0);
    expect(task.message).toBe("updated");
    expect(task.agent).toBe("alice");
  });

  it("returns success with task_id", async () => {
    await initWithTask();
    const handler = tools.get("kanban_update_task")!.handler;
    const result = await handler({ id: 1, status: "done" });

    const parsed = parseResult(result);
    expect(parsed.success).toBe(true);
    expect(parsed.task_id).toBe(1);
  });
});

describe("kanban_log", () => {
  let tools: Map<string, RegisteredTool>;

  beforeEach(() => {
    reset();
    vi.mocked(startServer).mockClear();
    vi.mocked(stopServer).mockClear();
    vi.mocked(isRunning).mockClear();
    vi.mocked(isRunning).mockReturnValue(false);
    vi.mocked(exec).mockClear();
    vi.mocked(platform).mockReturnValue("darwin");
    const mock = createMockServer();
    tools = mock.tools;
    registerTools(mock.server);
  });

  async function initEmpty() {
    await tools.get("kanban_init")!.handler({
      title: "Test",
      subtitle: "",
      tasks: [],
      port: 0,
      open_browser: false,
    });
  }

  it("adds entry with correct fields", async () => {
    await initEmpty();
    const handler = tools.get("kanban_log")!.handler;
    await handler({ agent: "alice", message: "Started working" });

    const logs = getLogs();
    expect(logs.entries).toHaveLength(1);
    expect(logs.entries[0].agent).toBe("alice");
    expect(logs.entries[0].message).toBe("Started working");
  });

  it("uses getAgentColor for color", async () => {
    await initEmpty();
    const handler = tools.get("kanban_log")!.handler;
    await handler({ agent: "alice", message: "log entry" });

    const logs = getLogs();
    // First agent after init reset gets first color
    expect(logs.entries[0].color).toBe("#ff6b6b");
  });

  it("uses explicit color when provided", async () => {
    await initEmpty();
    const handler = tools.get("kanban_log")!.handler;
    await handler({ agent: "alice", message: "log entry", color: "#123456" });

    const logs = getLogs();
    expect(logs.entries[0].color).toBe("#123456");
  });

  it("sets time field", async () => {
    await initEmpty();
    const handler = tools.get("kanban_log")!.handler;
    await handler({ agent: "alice", message: "timed entry" });

    const logs = getLogs();
    expect(logs.entries[0].time).toBeDefined();
    expect(typeof logs.entries[0].time).toBe("string");
    expect(logs.entries[0].time.length).toBeGreaterThan(0);
  });

  it("returns success", async () => {
    await initEmpty();
    const handler = tools.get("kanban_log")!.handler;
    const result = await handler({ agent: "alice", message: "msg" });

    const parsed = parseResult(result);
    expect(parsed.success).toBe(true);
  });
});

describe("kanban_stop", () => {
  let tools: Map<string, RegisteredTool>;

  beforeEach(() => {
    reset();
    vi.mocked(startServer).mockClear();
    vi.mocked(stopServer).mockClear();
    vi.mocked(stopServer).mockResolvedValue(undefined);
    vi.mocked(isRunning).mockClear();
    vi.mocked(isRunning).mockReturnValue(false);
    vi.mocked(exec).mockClear();
    vi.mocked(platform).mockReturnValue("darwin");
    const mock = createMockServer();
    tools = mock.tools;
    registerTools(mock.server);
  });

  it("calls stopServer", async () => {
    const handler = tools.get("kanban_stop")!.handler;
    await handler({});

    expect(stopServer).toHaveBeenCalled();
  });

  it("resets state", async () => {
    // First add some state
    await tools.get("kanban_init")!.handler({
      title: "Test",
      subtitle: "",
      tasks: [{ id: 1, title: "Task", agent: "a" }],
      port: 0,
      open_browser: false,
    });
    expect(getState().tasks).toHaveLength(1);

    // Stop should reset
    const handler = tools.get("kanban_stop")!.handler;
    await handler({});

    const state = getState();
    expect(state.tasks).toHaveLength(0);
    expect(state.config.title).toBe("Dashboard");
  });

  it("returns success", async () => {
    const handler = tools.get("kanban_stop")!.handler;
    const result = await handler({});

    const parsed = parseResult(result);
    expect(parsed.success).toBe(true);
  });
});

describe("openBrowser", () => {
  let tools: Map<string, RegisteredTool>;

  beforeEach(() => {
    reset();
    vi.mocked(startServer).mockClear();
    vi.mocked(startServer).mockResolvedValue({ url: "http://localhost:1234", port: 1234 });
    vi.mocked(stopServer).mockClear();
    vi.mocked(isRunning).mockClear();
    vi.mocked(isRunning).mockReturnValue(false);
    vi.mocked(exec).mockClear();
    vi.mocked(platform).mockReturnValue("darwin");
    const mock = createMockServer();
    tools = mock.tools;
    registerTools(mock.server);
  });

  it("uses 'open' command on darwin", async () => {
    vi.mocked(platform).mockReturnValue("darwin");
    const handler = tools.get("kanban_init")!.handler;
    await handler({
      title: "Test",
      subtitle: "",
      tasks: [],
      port: 0,
      open_browser: true,
    });

    expect(exec).toHaveBeenCalledWith("open http://localhost:1234", expect.any(Function));
  });

  it("uses 'start' command on win32", async () => {
    vi.mocked(platform).mockReturnValue("win32");
    const handler = tools.get("kanban_init")!.handler;
    await handler({
      title: "Test",
      subtitle: "",
      tasks: [],
      port: 0,
      open_browser: true,
    });

    expect(exec).toHaveBeenCalledWith("start http://localhost:1234", expect.any(Function));
  });

  it("uses 'xdg-open' command on linux", async () => {
    vi.mocked(platform).mockReturnValue("linux");
    const handler = tools.get("kanban_init")!.handler;
    await handler({
      title: "Test",
      subtitle: "",
      tasks: [],
      port: 0,
      open_browser: true,
    });

    expect(exec).toHaveBeenCalledWith("xdg-open http://localhost:1234", expect.any(Function));
  });
});

describe("kanban_init - baseline commit capture", () => {
  let tools: Map<string, RegisteredTool>;

  beforeEach(() => {
    reset();
    vi.mocked(startServer).mockClear();
    vi.mocked(startServer).mockResolvedValue({ url: "http://localhost:1234", port: 1234 });
    vi.mocked(stopServer).mockClear();
    vi.mocked(isRunning).mockClear();
    vi.mocked(isRunning).mockReturnValue(false);
    vi.mocked(exec).mockClear();
    vi.mocked(execSync).mockClear();
    vi.mocked(platform).mockReturnValue("darwin");
    const mock = createMockServer();
    tools = mock.tools;
    registerTools(mock.server);
  });

  it("captures baseline_ref from git when project_dir is provided", async () => {
    vi.mocked(execSync).mockReturnValue("abc123def456\n");
    const handler = tools.get("kanban_init")!.handler;
    await handler({
      title: "Test",
      subtitle: "",
      tasks: [],
      port: 0,
      open_browser: false,
      project_dir: "/my/repo",
    });

    expect(execSync).toHaveBeenCalledWith("git rev-parse HEAD", {
      cwd: "/my/repo",
      encoding: "utf-8",
      timeout: 5000,
    });
    expect(getBaselineRef()).toBe("abc123def456");
  });

  it("does not call git when project_dir is not provided", async () => {
    const handler = tools.get("kanban_init")!.handler;
    await handler({
      title: "Test",
      subtitle: "",
      tasks: [],
      port: 0,
      open_browser: false,
    });

    expect(execSync).not.toHaveBeenCalled();
    expect(getBaselineRef()).toBeUndefined();
  });

  it("skips baseline_ref when git fails", async () => {
    vi.mocked(execSync).mockImplementation(() => {
      throw new Error("not a git repo");
    });
    const handler = tools.get("kanban_init")!.handler;
    await handler({
      title: "Test",
      subtitle: "",
      tasks: [],
      port: 0,
      open_browser: false,
      project_dir: "/not/a/repo",
    });

    expect(getBaselineRef()).toBeUndefined();
  });
});

describe("kanban_update_task - git checkpoints", () => {
  let tools: Map<string, RegisteredTool>;

  beforeEach(() => {
    reset();
    vi.mocked(startServer).mockClear();
    vi.mocked(startServer).mockResolvedValue({ url: "http://localhost:1234", port: 1234 });
    vi.mocked(stopServer).mockClear();
    vi.mocked(isRunning).mockClear();
    vi.mocked(isRunning).mockReturnValue(false);
    vi.mocked(exec).mockClear();
    vi.mocked(execSync).mockClear();
    vi.mocked(platform).mockReturnValue("darwin");
    const mock = createMockServer();
    tools = mock.tools;
    registerTools(mock.server);
  });

  async function initWithTask() {
    vi.mocked(execSync).mockReturnValue("baseline000\n");
    await tools.get("kanban_init")!.handler({
      title: "Test",
      subtitle: "",
      tasks: [
        { id: 1, title: "Task One", agent: "alice", status: "ready" },
      ],
      port: 0,
      open_browser: false,
      project_dir: "/my/repo",
    });
    vi.mocked(execSync).mockClear();
  }

  it("sets start_ref when status changes to in_progress", async () => {
    await initWithTask();
    vi.mocked(execSync).mockReturnValue("start111\n");
    const handler = tools.get("kanban_update_task")!.handler;
    await handler({ id: 1, status: "in_progress" });

    expect(execSync).toHaveBeenCalledWith("git rev-parse HEAD", {
      cwd: "/my/repo",
      encoding: "utf-8",
      timeout: 5000,
    });
    expect(getState().tasks[0].start_ref).toBe("start111");
  });

  it("sets end_ref when status changes to done", async () => {
    await initWithTask();
    vi.mocked(execSync).mockReturnValue("end222\n");
    const handler = tools.get("kanban_update_task")!.handler;
    await handler({ id: 1, status: "done" });

    expect(execSync).toHaveBeenCalledWith("git rev-parse HEAD", {
      cwd: "/my/repo",
      encoding: "utf-8",
      timeout: 5000,
    });
    expect(getState().tasks[0].end_ref).toBe("end222");
  });

  it("does not set refs for other status values", async () => {
    await initWithTask();
    const handler = tools.get("kanban_update_task")!.handler;
    await handler({ id: 1, status: "blocked" });

    expect(execSync).not.toHaveBeenCalled();
    expect(getState().tasks[0].start_ref).toBeUndefined();
    expect(getState().tasks[0].end_ref).toBeUndefined();
  });

  it("does not set refs when no project_dir", async () => {
    reset();
    vi.mocked(execSync).mockClear();
    await tools.get("kanban_init")!.handler({
      title: "Test",
      subtitle: "",
      tasks: [
        { id: 1, title: "Task One", agent: "alice", status: "ready" },
      ],
      port: 0,
      open_browser: false,
    });
    vi.mocked(execSync).mockClear();

    const handler = tools.get("kanban_update_task")!.handler;
    await handler({ id: 1, status: "in_progress" });

    expect(execSync).not.toHaveBeenCalled();
    expect(getState().tasks[0].start_ref).toBeUndefined();
  });

  it("skips refs when git fails", async () => {
    await initWithTask();
    vi.mocked(execSync).mockImplementation(() => {
      throw new Error("git error");
    });
    const handler = tools.get("kanban_update_task")!.handler;
    await handler({ id: 1, status: "in_progress" });

    expect(getState().tasks[0].start_ref).toBeUndefined();
  });

  it("does not call git when status is not provided", async () => {
    await initWithTask();
    const handler = tools.get("kanban_update_task")!.handler;
    await handler({ id: 1, message: "just a message update" });

    expect(execSync).not.toHaveBeenCalled();
  });
});

describe("kanban_update_task - auto log entries", () => {
  let tools: Map<string, RegisteredTool>;

  beforeEach(() => {
    reset();
    vi.mocked(startServer).mockClear();
    vi.mocked(startServer).mockResolvedValue({ url: "http://localhost:1234", port: 1234 });
    vi.mocked(stopServer).mockClear();
    vi.mocked(isRunning).mockClear();
    vi.mocked(isRunning).mockReturnValue(false);
    vi.mocked(exec).mockClear();
    vi.mocked(execSync).mockClear();
    vi.mocked(platform).mockReturnValue("darwin");
    const mock = createMockServer();
    tools = mock.tools;
    registerTools(mock.server);
  });

  async function initWithTask(taskOverrides: Record<string, unknown> = {}) {
    await tools.get("kanban_init")!.handler({
      title: "Test",
      subtitle: "",
      tasks: [
        {
          id: 1,
          title: "Task One",
          agent: "alice",
          status: "ready",
          message: "initial",
          subtasks: ["step1", "step2", "step3"],
          subtasks_done: [],
          ...taskOverrides,
        },
      ],
      port: 0,
      open_browser: false,
    });
  }

  it("logs 'Started working on' when status changes to in_progress", async () => {
    await initWithTask();
    const handler = tools.get("kanban_update_task")!.handler;
    await handler({ id: 1, status: "in_progress" });

    const logs = getLogs();
    expect(logs.entries).toHaveLength(1);
    expect(logs.entries[0].message).toBe("Started working on: Task One");
    expect(logs.entries[0].agent).toBe("alice");
  });

  it("logs 'Completed' when status changes to done", async () => {
    await initWithTask();
    const handler = tools.get("kanban_update_task")!.handler;
    await handler({ id: 1, status: "done" });

    const logs = getLogs();
    expect(logs.entries).toHaveLength(1);
    expect(logs.entries[0].message).toBe("Completed: Task One");
  });

  it("logs 'Blocked' when status changes to blocked", async () => {
    await initWithTask();
    const handler = tools.get("kanban_update_task")!.handler;
    await handler({ id: 1, status: "blocked" });

    const logs = getLogs();
    expect(logs.entries).toHaveLength(1);
    expect(logs.entries[0].message).toBe("Blocked: Task One");
  });

  it("logs 'Ready' when status changes to ready", async () => {
    await initWithTask({ status: "blocked" });
    const handler = tools.get("kanban_update_task")!.handler;
    await handler({ id: 1, status: "ready" });

    const logs = getLogs();
    expect(logs.entries).toHaveLength(1);
    expect(logs.entries[0].message).toBe("Ready: Task One");
  });

  it("does not log status when status has not changed", async () => {
    await initWithTask();
    const handler = tools.get("kanban_update_task")!.handler;
    await handler({ id: 1, status: "ready" });

    const logs = getLogs();
    expect(logs.entries).toHaveLength(0);
  });

  it("uses task agent and color for log entries", async () => {
    await initWithTask();
    const handler = tools.get("kanban_update_task")!.handler;
    await handler({ id: 1, status: "in_progress" });

    const logs = getLogs();
    expect(logs.entries[0].agent).toBe("alice");
    expect(logs.entries[0].color).toBe("#ff6b6b");
  });

  it("logs newly completed subtasks", async () => {
    await initWithTask({ subtasks_done: ["step1"] });
    const handler = tools.get("kanban_update_task")!.handler;
    await handler({ id: 1, subtasks_done: ["step1", "step2", "step3"] });

    const logs = getLogs();
    const subtaskLogs = logs.entries.filter(e => e.message.startsWith("Completed subtask:"));
    expect(subtaskLogs).toHaveLength(2);
    expect(subtaskLogs[0].message).toBe("Completed subtask: step2");
    expect(subtaskLogs[1].message).toBe("Completed subtask: step3");
  });

  it("does not log already-completed subtasks", async () => {
    await initWithTask({ subtasks_done: ["step1", "step2"] });
    const handler = tools.get("kanban_update_task")!.handler;
    await handler({ id: 1, subtasks_done: ["step1", "step2", "step3"] });

    const logs = getLogs();
    const subtaskLogs = logs.entries.filter(e => e.message.startsWith("Completed subtask:"));
    expect(subtaskLogs).toHaveLength(1);
    expect(subtaskLogs[0].message).toBe("Completed subtask: step3");
  });

  it("logs message change when status did not change", async () => {
    await initWithTask();
    const handler = tools.get("kanban_update_task")!.handler;
    await handler({ id: 1, message: "new status update" });

    const logs = getLogs();
    expect(logs.entries).toHaveLength(1);
    expect(logs.entries[0].message).toBe("new status update");
  });

  it("does not log message when status also changed", async () => {
    await initWithTask();
    const handler = tools.get("kanban_update_task")!.handler;
    await handler({ id: 1, status: "in_progress", message: "started" });

    const logs = getLogs();
    // Should only have the status change log, not the message log
    expect(logs.entries).toHaveLength(1);
    expect(logs.entries[0].message).toBe("Started working on: Task One");
  });

  it("does not log message when it has not changed", async () => {
    await initWithTask();
    const handler = tools.get("kanban_update_task")!.handler;
    await handler({ id: 1, message: "initial" });

    const logs = getLogs();
    expect(logs.entries).toHaveLength(0);
  });

  it("logs both status change and new subtasks in same update", async () => {
    await initWithTask({ subtasks_done: [] });
    const handler = tools.get("kanban_update_task")!.handler;
    await handler({ id: 1, status: "in_progress", subtasks_done: ["step1"] });

    const logs = getLogs();
    expect(logs.entries).toHaveLength(2);
    expect(logs.entries[0].message).toBe("Started working on: Task One");
    expect(logs.entries[1].message).toBe("Completed subtask: step1");
  });

  it("sets time on auto-generated log entries", async () => {
    await initWithTask();
    const handler = tools.get("kanban_update_task")!.handler;
    await handler({ id: 1, status: "in_progress" });

    const logs = getLogs();
    expect(logs.entries[0].time).toBeDefined();
    expect(typeof logs.entries[0].time).toBe("string");
    expect(logs.entries[0].time.length).toBeGreaterThan(0);
  });
});
