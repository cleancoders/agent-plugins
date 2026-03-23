import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { startServer, stopServer, resetFilesCache, isRunning, buildNewFileDiff } from "../src/http-server.js";
import { reset, initDashboard, addTask, addLog, getLogs, addSignal, getSignalStatus, addChatMessage } from "../src/state.js";

vi.mock("node:child_process", () => ({
  execSync: vi.fn(),
}));

let mockReadFileSyncImpl: ((...args: any[]) => any) | null = null;
vi.mock("node:fs", async (importOriginal) => {
  const original = await importOriginal<typeof import("node:fs")>();
  return {
    ...original,
    default: {
      ...original,
      readFileSync: (...args: any[]) => {
        if (mockReadFileSyncImpl) return mockReadFileSyncImpl(...args);
        return original.readFileSync(...(args as Parameters<typeof original.readFileSync>));
      },
      readFile: original.readFile,
      mkdirSync: original.mkdirSync,
      writeFileSync: original.writeFileSync,
      existsSync: original.existsSync,
      rmSync: original.rmSync,
      mkdtempSync: original.mkdtempSync,
    },
  };
});

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

  it("uses baseline ref when configured to get committed and uncommitted changes", async () => {
    initDashboard({ title: "t", subtitle: "s", project_dir: "/my/project", baseline_ref: "abc123" });
    mockExecSync
      .mockReturnValueOnce("M\tsrc/committed.ts")
      .mockReturnValueOnce("M\tsrc/uncommitted.ts");

    const { status, body } = await fetchJson(`${baseUrl}/api/files`);

    expect(status).toBe(200);
    expect(body.files).toHaveLength(2);
    expect(body.files[0]).toEqual({ path: "src/committed.ts", status: "M", task_ids: [] });
    expect(body.files[1]).toEqual({ path: "src/uncommitted.ts", status: "M", task_ids: [] });
    expect(mockExecSync).toHaveBeenCalledWith("git diff --name-status abc123..HEAD", expect.objectContaining({ cwd: "/my/project" }));
    expect(mockExecSync).toHaveBeenCalledWith("git diff --name-status", expect.objectContaining({ cwd: "/my/project" }));
  });

  it("deduplicates files when baseline ref produces overlapping committed and uncommitted changes", async () => {
    initDashboard({ title: "t", subtitle: "s", project_dir: "/my/project", baseline_ref: "abc123" });
    mockExecSync
      .mockReturnValueOnce("M\tsrc/shared.ts\nA\tsrc/committed-only.ts")
      .mockReturnValueOnce("M\tsrc/shared.ts\nM\tsrc/uncommitted-only.ts");

    const { body } = await fetchJson(`${baseUrl}/api/files`);

    expect(body.files).toHaveLength(3);
    const paths = body.files.map((f: any) => f.path);
    expect(paths).toContain("src/shared.ts");
    expect(paths).toContain("src/committed-only.ts");
    expect(paths).toContain("src/uncommitted-only.ts");
  });

  it("filters by task files when task_id is provided and task has files array", async () => {
    initDashboard({ title: "t", subtitle: "s", project_dir: "/my/project" });
    addTask({
      id: 1, title: "Task A", agent: "a", agent_color: "#000", status: "in_progress",
      message: "", progress: 0, files: ["src/foo.ts"],
    });
    mockExecSync.mockReturnValue("M\tsrc/foo.ts\nA\tsrc/bar.ts");

    const { body } = await fetchJson(`${baseUrl}/api/files?task_id=1`);

    expect(body.files).toHaveLength(1);
    expect(body.files[0].path).toBe("src/foo.ts");
  });

  it("uses task start_ref..end_ref when both are set", async () => {
    initDashboard({ title: "t", subtitle: "s", project_dir: "/my/project" });
    addTask({
      id: 1, title: "Task A", agent: "a", agent_color: "#000", status: "done",
      message: "", progress: 1, start_ref: "aaa111", end_ref: "bbb222",
    });
    mockExecSync.mockReturnValue("M\tsrc/done.ts");

    const { body } = await fetchJson(`${baseUrl}/api/files?task_id=1`);

    expect(body.files).toHaveLength(1);
    expect(body.files[0].path).toBe("src/done.ts");
    expect(mockExecSync).toHaveBeenCalledWith("git diff --name-status aaa111..bbb222", expect.objectContaining({ cwd: "/my/project" }));
  });

  it("uses task start_ref..HEAD when only start_ref is set", async () => {
    initDashboard({ title: "t", subtitle: "s", project_dir: "/my/project" });
    addTask({
      id: 2, title: "Task B", agent: "a", agent_color: "#000", status: "in_progress",
      message: "", progress: 0.5, start_ref: "ccc333",
    });
    mockExecSync.mockReturnValue("A\tsrc/wip.ts");

    const { body } = await fetchJson(`${baseUrl}/api/files?task_id=2`);

    expect(body.files).toHaveLength(1);
    expect(body.files[0].path).toBe("src/wip.ts");
    expect(mockExecSync).toHaveBeenCalledWith("git diff --name-status ccc333..HEAD", expect.objectContaining({ cwd: "/my/project" }));
  });

  it("falls back to default behavior when task_id matches no task", async () => {
    initDashboard({ title: "t", subtitle: "s", project_dir: "/my/project" });
    mockExecSync.mockReturnValue("M\tsrc/foo.ts");

    const { body } = await fetchJson(`${baseUrl}/api/files?task_id=999`);

    expect(body.files).toHaveLength(1);
    expect(body.files[0].path).toBe("src/foo.ts");
  });

  it("falls through to files filter when start_ref equals end_ref", async () => {
    initDashboard({ title: "t", subtitle: "s", project_dir: "/my/project" });
    addTask({
      id: 1, title: "Task A", agent: "a", agent_color: "#000", status: "done",
      message: "", progress: 1, start_ref: "same111", end_ref: "same111",
      files: ["src/foo.ts"],
    });
    mockExecSync
      .mockReturnValueOnce("M\tsrc/foo.ts\nA\tsrc/bar.ts")
      .mockReturnValueOnce("");

    const { body } = await fetchJson(`${baseUrl}/api/files?task_id=1`);

    expect(body.files).toHaveLength(1);
    expect(body.files[0].path).toBe("src/foo.ts");
    expect(mockExecSync).not.toHaveBeenCalledWith(
      expect.stringContaining("same111"),
      expect.anything()
    );
  });

  it("falls through to baseline when start_ref equals end_ref and no files array", async () => {
    initDashboard({ title: "t", subtitle: "s", project_dir: "/my/project", baseline_ref: "base000" });
    addTask({
      id: 1, title: "Task A", agent: "a", agent_color: "#000", status: "done",
      message: "", progress: 1, start_ref: "same111", end_ref: "same111",
    });
    mockExecSync
      .mockReturnValueOnce("M\tsrc/all.ts")
      .mockReturnValueOnce("");

    const { body } = await fetchJson(`${baseUrl}/api/files?task_id=1`);

    expect(body.files).toHaveLength(1);
    expect(body.files[0].path).toBe("src/all.ts");
    expect(mockExecSync).toHaveBeenCalledWith(
      "git diff --name-status base000..HEAD",
      expect.objectContaining({ cwd: "/my/project" })
    );
  });

  it("includes uncommitted changes for in-progress task with start_ref only", async () => {
    initDashboard({ title: "t", subtitle: "s", project_dir: "/my/project" });
    addTask({
      id: 2, title: "Task B", agent: "a", agent_color: "#000", status: "in_progress",
      message: "", progress: 0.5, start_ref: "ccc333",
    });
    mockExecSync
      .mockReturnValueOnce("M\tsrc/committed.ts")
      .mockReturnValueOnce("M\tsrc/uncommitted.ts");

    const { body } = await fetchJson(`${baseUrl}/api/files?task_id=2`);

    expect(body.files).toHaveLength(2);
    const paths = body.files.map((f: any) => f.path);
    expect(paths).toContain("src/committed.ts");
    expect(paths).toContain("src/uncommitted.ts");
    expect(mockExecSync).toHaveBeenCalledWith(
      "git diff --name-status ccc333..HEAD",
      expect.objectContaining({ cwd: "/my/project" })
    );
    expect(mockExecSync).toHaveBeenCalledWith(
      "git diff --name-status",
      expect.objectContaining({ cwd: "/my/project" })
    );
  });

  it("filters by task files when in-progress task has start_ref and files array", async () => {
    initDashboard({ title: "t", subtitle: "s", project_dir: "/my/project" });
    addTask({
      id: 2, title: "Task B", agent: "a", agent_color: "#000", status: "in_progress",
      message: "", progress: 0.5, start_ref: "ccc333", files: ["src/committed.ts"],
    });
    mockExecSync
      .mockReturnValueOnce("M\tsrc/committed.ts")
      .mockReturnValueOnce("M\tsrc/uncommitted.ts");

    const { body } = await fetchJson(`${baseUrl}/api/files?task_id=2`);

    expect(body.files).toHaveLength(1);
    expect(body.files[0].path).toBe("src/committed.ts");
  });

  it("falls back to default when task has no refs or files", async () => {
    initDashboard({ title: "t", subtitle: "s", project_dir: "/my/project" });
    addTask({
      id: 3, title: "Task C", agent: "a", agent_color: "#000", status: "in_progress",
      message: "", progress: 0,
    });
    mockExecSync.mockReturnValue("M\tsrc/all.ts");

    const { body } = await fetchJson(`${baseUrl}/api/files?task_id=3`);

    expect(body.files).toHaveLength(1);
    expect(body.files[0].path).toBe("src/all.ts");
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

  it("uses baseline ref to concatenate committed and uncommitted diffs", async () => {
    initDashboard({ title: "t", subtitle: "s", project_dir: "/my/project", baseline_ref: "abc123" });
    mockExecSync
      .mockReturnValueOnce("committed diff\n")
      .mockReturnValueOnce("uncommitted diff\n");

    const { body } = await fetchJson(`${baseUrl}/api/diff?file=src/foo.ts`);

    expect(body.file).toBe("src/foo.ts");
    expect(body.diff).toBe("committed diff\nuncommitted diff\n");
    expect(mockExecSync).toHaveBeenCalledWith(
      'git diff abc123..HEAD -- "src/foo.ts"',
      expect.objectContaining({ cwd: "/my/project" })
    );
    expect(mockExecSync).toHaveBeenCalledWith(
      'git diff -- "src/foo.ts"',
      expect.objectContaining({ cwd: "/my/project" })
    );
  });

  it("uses start_ref..end_ref when both query params provided", async () => {
    initDashboard({ title: "t", subtitle: "s", project_dir: "/my/project" });
    mockExecSync.mockReturnValue("task scoped diff");

    const { body } = await fetchJson(`${baseUrl}/api/diff?file=src/foo.ts&start_ref=aaa&end_ref=bbb`);

    expect(body.diff).toBe("task scoped diff");
    expect(mockExecSync).toHaveBeenCalledWith(
      'git diff aaa..bbb -- "src/foo.ts"',
      expect.objectContaining({ cwd: "/my/project" })
    );
  });

  it("uses start_ref..HEAD when only start_ref query param provided", async () => {
    initDashboard({ title: "t", subtitle: "s", project_dir: "/my/project" });
    mockExecSync.mockReturnValue("in progress diff");

    const { body } = await fetchJson(`${baseUrl}/api/diff?file=src/foo.ts&start_ref=ccc`);

    expect(body.diff).toBe("in progress diff");
    expect(mockExecSync).toHaveBeenCalledWith(
      'git diff ccc..HEAD -- "src/foo.ts"',
      expect.objectContaining({ cwd: "/my/project" })
    );
  });

  it("returns synthetic diff with is_new when diff is empty and status=A", async () => {
    initDashboard({ title: "t", subtitle: "s", project_dir: "/my/project" });
    mockExecSync.mockReturnValue("");
    mockReadFileSyncImpl = () => "line one\nline two\n";

    const { body } = await fetchJson(`${baseUrl}/api/diff?file=src/new-file.ts&status=A`);

    mockReadFileSyncImpl = null;
    expect(body.is_new).toBe(true);
    expect(body.file).toBe("src/new-file.ts");
    expect(body.diff).toContain("--- /dev/null");
    expect(body.diff).toContain("+++ b/src/new-file.ts");
    expect(body.diff).toContain("+line one");
    expect(body.diff).toContain("+line two");
  });

  it("returns normal empty diff when status is not A", async () => {
    initDashboard({ title: "t", subtitle: "s", project_dir: "/my/project" });
    mockExecSync.mockReturnValue("");

    const { body } = await fetchJson(`${baseUrl}/api/diff?file=src/foo.ts&status=M`);

    expect(body.is_new).toBeUndefined();
    expect(body.diff).toBe("");
  });

  it("returns normal diff when git diff produces output even with status=A", async () => {
    initDashboard({ title: "t", subtitle: "s", project_dir: "/my/project" });
    mockExecSync.mockReturnValue("some actual diff output");

    const { body } = await fetchJson(`${baseUrl}/api/diff?file=src/foo.ts&status=A`);

    expect(body.is_new).toBeUndefined();
    expect(body.diff).toBe("some actual diff output");
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

describe("GET /vendor/* static files", () => {
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

  it("serves vendor JS file with application/javascript content-type", async () => {
    const res = await fetch(`${baseUrl}/vendor/highlight.min.js`);

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/javascript");
  });

  it("serves vendor CSS file with text/css content-type", async () => {
    const res = await fetch(`${baseUrl}/vendor/highlight-theme.css`);

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/css");
  });

  it("returns 404 for nonexistent vendor file", async () => {
    const { status, body } = await fetchJson(`${baseUrl}/vendor/nope.js`);

    expect(status).toBe(404);
    expect(body).toEqual({ error: "Not found" });
  });

  it("rejects paths with .. traversal", async () => {
    const { status, body } = await fetchJson(`${baseUrl}/vendor/../../../etc/passwd`);

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

  it("returns leader and project in config when set", async () => {
    initDashboard({ title: "T", subtitle: "S", leader: "alice", project: "my-app" });

    const { status, body } = await fetchJson(`${baseUrl}/api/status`);

    expect(status).toBe(200);
    expect(body.config.leader).toBe("alice");
    expect(body.config.project).toBe("my-app");
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
    expect(res.headers.get("access-control-allow-methods")).toBe("GET, POST, OPTIONS");
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

describe("buildNewFileDiff", () => {
  it("generates a unified diff with all lines as additions", () => {
    const diff = buildNewFileDiff("src/new.ts", "line one\nline two\n");

    expect(diff).toBe(
      "--- /dev/null\n" +
      "+++ b/src/new.ts\n" +
      "@@ -0,0 +1,2 @@\n" +
      "+line one\n" +
      "+line two\n"
    );
  });

  it("handles single-line file without trailing newline", () => {
    const diff = buildNewFileDiff("README.md", "hello");

    expect(diff).toBe(
      "--- /dev/null\n" +
      "+++ b/README.md\n" +
      "@@ -0,0 +1,1 @@\n" +
      "+hello\n"
    );
  });

  it("handles multi-line file without trailing newline", () => {
    const diff = buildNewFileDiff("file.txt", "a\nb\nc");

    expect(diff).toBe(
      "--- /dev/null\n" +
      "+++ b/file.txt\n" +
      "@@ -0,0 +1,3 @@\n" +
      "+a\n" +
      "+b\n" +
      "+c\n"
    );
  });

  it("handles empty file content", () => {
    const diff = buildNewFileDiff("empty.ts", "");

    expect(diff).toContain("--- /dev/null");
    expect(diff).toContain("+++ b/empty.ts");
  });
});

describe("POST /api/signal", () => {
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

  it("returns success when signal is sent", async () => {
    initDashboard({ title: "t", subtitle: "s" });

    const res = await fetch(`${baseUrl}/api/signal`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agent: "alice", action: "poke" }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });

  it("stores the signal in state", async () => {
    initDashboard({ title: "t", subtitle: "s" });

    await fetch(`${baseUrl}/api/signal`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agent: "alice", action: "shake" }),
    });

    const status = getSignalStatus();
    expect(status).toHaveLength(1);
    expect(status[0].agent).toBe("alice");
    expect(status[0].action).toBe("shake");
  });

  it("returns 400 when agent is missing", async () => {
    initDashboard({ title: "t", subtitle: "s" });

    const res = await fetch(`${baseUrl}/api/signal`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "poke" }),
    });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBeDefined();
  });

  it("returns 400 when action is missing", async () => {
    initDashboard({ title: "t", subtitle: "s" });

    const res = await fetch(`${baseUrl}/api/signal`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agent: "alice" }),
    });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBeDefined();
  });
});

describe("GET /api/signals", () => {
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

  it("returns empty signals array initially", async () => {
    const { status, body } = await fetchJson(`${baseUrl}/api/signals`);

    expect(status).toBe(200);
    expect(body.signals).toEqual([]);
  });

  it("returns pending signals after POST", async () => {
    initDashboard({ title: "t", subtitle: "s" });

    await fetch(`${baseUrl}/api/signal`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agent: "alice", action: "poke" }),
    });

    const { status, body } = await fetchJson(`${baseUrl}/api/signals`);

    expect(status).toBe(200);
    expect(body.signals).toHaveLength(1);
    expect(body.signals[0].agent).toBe("alice");
    expect(body.signals[0].action).toBe("poke");
    expect(body.signals[0].acknowledged).toBe(false);
  });
});

describe("GET /api/chat", () => {
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

  it("returns empty chat state when no messages exist", async () => {
    const { status, body } = await fetchJson(`${baseUrl}/api/chat`);

    expect(status).toBe(200);
    expect(body).toEqual({ messages: [], waiting: false, pending_questions: 0 });
  });

  it("returns messages after they are added", async () => {
    addChatMessage({ sender: "agent", text: "Hello?", waiting: true });

    const { status, body } = await fetchJson(`${baseUrl}/api/chat`);

    expect(status).toBe(200);
    expect(body.messages).toHaveLength(1);
    expect(body.messages[0].text).toBe("Hello?");
    expect(body.waiting).toBe(true);
    expect(body.pending_questions).toBe(1);
  });
});

describe("POST /api/chat", () => {
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

  it("answers the oldest pending question", async () => {
    addChatMessage({ sender: "agent", text: "What should I do?", waiting: true });

    const res = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "Do the thing" }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.message_id).toBeDefined();
    expect(body.response_to).toBe(1);
  });

  it("creates free-form message when no question is pending", async () => {
    const res = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "Just chatting" }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.message_id).toBeDefined();
    expect(body.response_to).toBeUndefined();
  });

  it("returns 400 when text is missing", async () => {
    const res = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ other: "field" }),
    });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("text is required");
  });

  it("returns 400 when text is whitespace only", async () => {
    const res = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "   " }),
    });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("text is required");
  });

  it("returns 400 for invalid JSON", async () => {
    const res = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json at all",
    });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("Invalid JSON");
  });
});
