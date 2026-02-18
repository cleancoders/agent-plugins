import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { startServer, stopServer, resetFilesCache, isRunning } from "../src/http-server.js";
import { reset, initDashboard, addTask, addLog, getLogs } from "../src/state.js";

vi.mock("node:child_process", () => ({
  execSync: vi.fn(),
}));

import { execSync } from "node:child_process";
const mockExecSync = vi.mocked(execSync);

async function fetchJson(url: string): Promise<{ status: number; body: any }> {
  const res = await fetch(url);
  const body = await res.json();
  return { status: res.status, body };
}

describe("GET /api/files", () => {
  let baseUrl: string;

  beforeEach(async () => {
    reset();
    resetFilesCache();
    mockExecSync.mockReset();
    const info = await startServer(0);
    baseUrl = info.url;
  });

  afterEach(async () => {
    await stopServer();
  });

  it("returns error JSON when no project_dir configured", async () => {
    initDashboard({ title: "t", subtitle: "s" });

    const { status, body } = await fetchJson(`${baseUrl}/api/files`);

    expect(status).toBe(200);
    expect(body).toEqual({ error: "No project directory configured" });
    expect(mockExecSync).not.toHaveBeenCalled();
  });

  it("parses git diff output correctly", async () => {
    initDashboard({ title: "t", subtitle: "s", project_dir: "/my/project" });
    mockExecSync.mockReturnValue("M\tsrc/foo.ts\nA\tsrc/bar.ts\nD\told/file.ts");

    const { status, body } = await fetchJson(`${baseUrl}/api/files`);

    expect(status).toBe(200);
    expect(body.files).toHaveLength(3);
    expect(body.files[0]).toEqual({ path: "src/foo.ts", status: "M", task_ids: [] });
    expect(body.files[1]).toEqual({ path: "src/bar.ts", status: "A", task_ids: [] });
    expect(body.files[2]).toEqual({ path: "old/file.ts", status: "D", task_ids: [] });
    expect(mockExecSync).toHaveBeenCalledWith("git diff --name-status", {
      cwd: "/my/project",
      encoding: "utf-8",
      timeout: 5000,
    });
  });

  it("returns empty files array when git diff output is empty", async () => {
    initDashboard({ title: "t", subtitle: "s", project_dir: "/my/project" });
    mockExecSync.mockReturnValue("");

    const { status, body } = await fetchJson(`${baseUrl}/api/files`);

    expect(status).toBe(200);
    expect(body.files).toEqual([]);
  });

  it("associates files with tasks based on path matching", async () => {
    initDashboard({ title: "t", subtitle: "s", project_dir: "/my/project" });

    addTask({
      id: 1,
      title: "Task A",
      agent: "agent-1",
      agent_color: "#ff0000",
      status: "in_progress",
      message: "",
      progress: 50,
      files: ["src/foo.ts", "src/bar.ts"],
    });
    addTask({
      id: 2,
      title: "Task B",
      agent: "agent-2",
      agent_color: "#00ff00",
      status: "ready",
      message: "",
      progress: 0,
      files: ["src/bar.ts"],
    });

    mockExecSync.mockReturnValue("M\tsrc/foo.ts\nA\tsrc/bar.ts\nD\tunrelated.ts");

    const { status, body } = await fetchJson(`${baseUrl}/api/files`);

    expect(status).toBe(200);
    expect(body.files).toHaveLength(3);
    expect(body.files[0]).toEqual({ path: "src/foo.ts", status: "M", task_ids: [1] });
    expect(body.files[1]).toEqual({ path: "src/bar.ts", status: "A", task_ids: [1, 2] });
    expect(body.files[2]).toEqual({ path: "unrelated.ts", status: "D", task_ids: [] });
  });

  it("returns cached data within TTL", async () => {
    initDashboard({ title: "t", subtitle: "s", project_dir: "/my/project" });
    mockExecSync.mockReturnValue("M\tsrc/foo.ts");

    const first = await fetchJson(`${baseUrl}/api/files`);
    expect(first.body.files).toHaveLength(1);
    expect(mockExecSync).toHaveBeenCalledTimes(1);

    // Second request should use cache (no additional execSync call)
    const second = await fetchJson(`${baseUrl}/api/files`);
    expect(second.body.files).toHaveLength(1);
    expect(mockExecSync).toHaveBeenCalledTimes(1);
  });

  it("returns error JSON when git diff throws", async () => {
    initDashboard({ title: "t", subtitle: "s", project_dir: "/my/project" });
    mockExecSync.mockImplementation(() => {
      throw new Error("Command failed: git diff");
    });

    const { status, body } = await fetchJson(`${baseUrl}/api/files`);

    expect(status).toBe(200);
    expect(body).toEqual({ error: "Command failed: git diff" });
  });
});

describe("GET /api/diff", () => {
  let baseUrl: string;

  beforeEach(async () => {
    reset();
    resetFilesCache();
    mockExecSync.mockReset();
    const info = await startServer(0);
    baseUrl = info.url;
  });

  afterEach(async () => {
    await stopServer();
  });

  it("returns error JSON when no project_dir configured", async () => {
    initDashboard({ title: "t", subtitle: "s" });

    const { status, body } = await fetchJson(`${baseUrl}/api/diff?file=src/foo.ts`);

    expect(status).toBe(200);
    expect(body).toEqual({ error: "No project directory configured" });
    expect(mockExecSync).not.toHaveBeenCalled();
  });

  it("returns 400 for missing file parameter", async () => {
    initDashboard({ title: "t", subtitle: "s", project_dir: "/my/project" });

    const { status, body } = await fetchJson(`${baseUrl}/api/diff?other=value`);

    expect(status).toBe(400);
    expect(body).toEqual({ error: "Invalid file path" });
    expect(mockExecSync).not.toHaveBeenCalled();
  });

  it("returns 400 for paths containing '..'", async () => {
    initDashboard({ title: "t", subtitle: "s", project_dir: "/my/project" });

    const { status, body } = await fetchJson(`${baseUrl}/api/diff?file=../etc/passwd`);

    expect(status).toBe(400);
    expect(body).toEqual({ error: "Invalid file path" });
    expect(mockExecSync).not.toHaveBeenCalled();
  });

  it("returns diff for valid file path", async () => {
    initDashboard({ title: "t", subtitle: "s", project_dir: "/my/project" });
    const fakeDiff = "diff --git a/src/foo.ts b/src/foo.ts\n--- a/src/foo.ts\n+++ b/src/foo.ts\n@@ -1 +1 @@\n-old\n+new";
    mockExecSync.mockReturnValue(fakeDiff);

    const { status, body } = await fetchJson(`${baseUrl}/api/diff?file=src/foo.ts`);

    expect(status).toBe(200);
    expect(body).toEqual({ file: "src/foo.ts", diff: fakeDiff });
    expect(mockExecSync).toHaveBeenCalledWith(
      'git diff -- "src/foo.ts"',
      { cwd: "/my/project", encoding: "utf-8", timeout: 10000 }
    );
  });

  it("handles git errors gracefully", async () => {
    initDashboard({ title: "t", subtitle: "s", project_dir: "/my/project" });
    mockExecSync.mockImplementation(() => {
      throw new Error("Command failed: git diff");
    });

    const { status, body } = await fetchJson(`${baseUrl}/api/diff?file=src/foo.ts`);

    expect(status).toBe(200);
    expect(body).toEqual({ error: "Command failed: git diff" });
  });
});

describe("GET /", () => {
  let baseUrl: string;

  beforeEach(async () => {
    reset();
    resetFilesCache();
    mockExecSync.mockReset();
    const info = await startServer(0);
    baseUrl = info.url;
  });

  afterEach(async () => {
    await stopServer();
  });

  it("returns 200 with text/html content-type", async () => {
    const res = await fetch(`${baseUrl}/`);

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/html; charset=utf-8");
  });

  it("response body contains HTML content", async () => {
    const res = await fetch(`${baseUrl}/`);
    const body = await res.text();

    expect(body).toContain("<!DOCTYPE html>");
    expect(body).toContain("<html");
  });
});

describe("GET /css/* and GET /js/* static files", () => {
  let baseUrl: string;

  beforeEach(async () => {
    reset();
    resetFilesCache();
    mockExecSync.mockReset();
    const info = await startServer(0);
    baseUrl = info.url;
  });

  afterEach(async () => {
    await stopServer();
  });

  it("serves CSS file with text/css content-type", async () => {
    const res = await fetch(`${baseUrl}/css/base.css`);

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/css");
  });

  it("serves JS file with application/javascript content-type", async () => {
    const res = await fetch(`${baseUrl}/js/dashboard.js`);

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/javascript");
  });

  it("returns 404 for nonexistent CSS file", async () => {
    const { status, body } = await fetchJson(`${baseUrl}/css/nope.css`);

    expect(status).toBe(404);
    expect(body).toEqual({ error: "Not found" });
  });

  it("returns 404 for nonexistent JS file", async () => {
    const { status, body } = await fetchJson(`${baseUrl}/js/nope.js`);

    expect(status).toBe(404);
    expect(body).toEqual({ error: "Not found" });
  });

  it("rejects paths with .. traversal", async () => {
    const { status, body } = await fetchJson(`${baseUrl}/css/../../../etc/passwd`);

    expect(status).toBe(404);
    expect(body).toEqual({ error: "Not found" });
  });

  it("rejects unknown extensions", async () => {
    const { status, body } = await fetchJson(`${baseUrl}/js/foo.html`);

    expect(status).toBe(404);
    expect(body).toEqual({ error: "Not found" });
  });
});

describe("GET /api/status", () => {
  let baseUrl: string;

  beforeEach(async () => {
    reset();
    resetFilesCache();
    mockExecSync.mockReset();
    const info = await startServer(0);
    baseUrl = info.url;
  });

  afterEach(async () => {
    await stopServer();
  });

  it("returns state JSON with tasks array and config object", async () => {
    initDashboard({ title: "My Board", subtitle: "v1" });

    const { status, body } = await fetchJson(`${baseUrl}/api/status`);

    expect(status).toBe(200);
    expect(body.tasks).toEqual([]);
    expect(body.config).toEqual({ title: "My Board", subtitle: "v1" });
  });

  it("response includes server_time as ISO string", async () => {
    initDashboard({ title: "t", subtitle: "s" });

    const { body } = await fetchJson(`${baseUrl}/api/status`);

    expect(body.server_time).toBeDefined();
    expect(new Date(body.server_time).toISOString()).toBe(body.server_time);
  });

  it("includes CORS headers", async () => {
    initDashboard({ title: "t", subtitle: "s" });

    const res = await fetch(`${baseUrl}/api/status`);

    expect(res.headers.get("access-control-allow-origin")).toBe("*");
  });
});

describe("GET /api/log", () => {
  let baseUrl: string;

  beforeEach(async () => {
    reset();
    resetFilesCache();
    mockExecSync.mockReset();
    const info = await startServer(0);
    baseUrl = info.url;
  });

  afterEach(async () => {
    await stopServer();
  });

  it("returns empty entries array initially", async () => {
    const { status, body } = await fetchJson(`${baseUrl}/api/log`);

    expect(status).toBe(200);
    expect(body).toEqual({ entries: [] });
  });

  it("returns entries after addLog", async () => {
    addLog({ time: "2026-02-18T10:00:00Z", agent: "agent-1", color: "#ff0000", message: "started task" });
    addLog({ time: "2026-02-18T10:01:00Z", agent: "agent-2", color: "#00ff00", message: "finished task" });

    const { status, body } = await fetchJson(`${baseUrl}/api/log`);

    expect(status).toBe(200);
    expect(body.entries).toHaveLength(2);
    expect(body.entries[0]).toEqual({
      time: "2026-02-18T10:00:00Z",
      agent: "agent-1",
      color: "#ff0000",
      message: "started task",
    });
    expect(body.entries[1]).toEqual({
      time: "2026-02-18T10:01:00Z",
      agent: "agent-2",
      color: "#00ff00",
      message: "finished task",
    });
  });
});

describe("OPTIONS", () => {
  let baseUrl: string;

  beforeEach(async () => {
    reset();
    resetFilesCache();
    mockExecSync.mockReset();
    const info = await startServer(0);
    baseUrl = info.url;
  });

  afterEach(async () => {
    await stopServer();
  });

  it("returns 204 with CORS headers", async () => {
    const res = await fetch(`${baseUrl}/api/status`, { method: "OPTIONS" });

    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(res.headers.get("access-control-allow-methods")).toBe("GET, OPTIONS");
    expect(res.headers.get("access-control-allow-headers")).toBe("Content-Type");
  });
});

describe("404 fallback", () => {
  let baseUrl: string;

  beforeEach(async () => {
    reset();
    resetFilesCache();
    mockExecSync.mockReset();
    const info = await startServer(0);
    baseUrl = info.url;
  });

  afterEach(async () => {
    await stopServer();
  });

  it("returns 404 for unknown path", async () => {
    const { status, body } = await fetchJson(`${baseUrl}/unknown`);

    expect(status).toBe(404);
    expect(body).toEqual({ error: "Not found" });
  });
});

describe("Server lifecycle", () => {
  beforeEach(() => {
    reset();
    resetFilesCache();
    mockExecSync.mockReset();
  });

  afterEach(async () => {
    await stopServer();
  });

  it("startServer rejects if already running", async () => {
    await startServer(0);

    await expect(startServer(0)).rejects.toThrow("Server is already running");
  });

  it("stopServer resolves when not running", async () => {
    await expect(stopServer()).resolves.toBeUndefined();
  });

  it("isRunning reflects server state", async () => {
    expect(isRunning()).toBe(false);

    await startServer(0);
    expect(isRunning()).toBe(true);

    await stopServer();
    expect(isRunning()).toBe(false);
  });
});
