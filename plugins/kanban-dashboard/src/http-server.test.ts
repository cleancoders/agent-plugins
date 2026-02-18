import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { startServer, stopServer, resetFilesCache } from "./http-server.js";
import { reset, initDashboard, addTask } from "./state.js";

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
