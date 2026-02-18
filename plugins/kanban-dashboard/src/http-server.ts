import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { getState, getLogs, getProjectDir, getBaselineRef } from "./state.js";

let server: http.Server | null = null;

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

let filesCache: { data: unknown; time: number; key: string } | null = null;
const FILES_CACHE_TTL = 2000;

function sendJson(
  res: http.ServerResponse,
  statusCode: number,
  data: unknown
): void {
  const body = JSON.stringify(data);
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Cache-Control": "no-cache",
    ...CORS_HEADERS,
  });
  res.end(body);
}

function parseGitNameStatus(
  output: string,
  state: ReturnType<typeof getState>
): { path: string; status: string; task_ids: number[] }[] {
  return output
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => {
      const [status, ...pathParts] = line.split("\t");
      const filePath = pathParts.join("\t");
      const taskIds = state.tasks
        .filter(
          (t) => t.files && t.files.some((f) => filePath.endsWith(f) || f.endsWith(filePath))
        )
        .map((t) => t.id);
      return { path: filePath, status, task_ids: taskIds };
    });
}

function getFilesWithBaseline(
  projectDir: string,
  baselineRef: string | undefined,
  state: ReturnType<typeof getState>
): { path: string; status: string; task_ids: number[] }[] {
  if (baselineRef) {
    const committedOutput = execSync(`git diff --name-status ${baselineRef}..HEAD`, {
      cwd: projectDir, encoding: "utf-8", timeout: 5000,
    }).trim();
    const uncommittedOutput = execSync("git diff --name-status", {
      cwd: projectDir, encoding: "utf-8", timeout: 5000,
    }).trim();

    const fileMap = new Map<string, { path: string; status: string; task_ids: number[] }>();
    for (const entry of parseGitNameStatus(committedOutput, state)) {
      fileMap.set(entry.path, entry);
    }
    for (const entry of parseGitNameStatus(uncommittedOutput, state)) {
      if (!fileMap.has(entry.path)) {
        fileMap.set(entry.path, entry);
      }
    }
    return Array.from(fileMap.values());
  }

  const output = execSync("git diff --name-status", {
    cwd: projectDir, encoding: "utf-8", timeout: 5000,
  }).trim();
  return parseGitNameStatus(output, state);
}

function handleRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse
): void {
  const method = req.method ?? "GET";
  const url = req.url ?? "/";

  if (method === "OPTIONS") {
    res.writeHead(204, CORS_HEADERS);
    res.end();
    return;
  }

  if (method === "GET" && url === "/") {
    const filePath = path.resolve(__dirname, "..", "public", "index.html");
    fs.readFile(filePath, (err, data) => {
      if (err) {
        sendJson(res, 500, { error: "Failed to load index.html" });
        return;
      }
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(data);
    });
    return;
  }

  // Serve static CSS and JS files
  if (method === "GET" && (url.startsWith("/css/") || url.startsWith("/js/"))) {
    const mimeTypes: Record<string, string> = {
      ".css": "text/css",
      ".js": "application/javascript",
    };
    const ext = path.extname(url);
    const contentType = mimeTypes[ext];
    if (!contentType || url.includes("..")) {
      sendJson(res, 404, { error: "Not found" });
      return;
    }
    const filePath = path.resolve(__dirname, "..", "public", url.slice(1));
    fs.readFile(filePath, (err, data) => {
      if (err) {
        sendJson(res, 404, { error: "Not found" });
        return;
      }
      res.writeHead(200, {
        "Content-Type": contentType,
        "Cache-Control": "no-cache",
        ...CORS_HEADERS,
      });
      res.end(data);
    });
    return;
  }

  if (method === "GET" && url.startsWith("/api/files")) {
    const projectDir = getProjectDir();
    if (!projectDir) {
      sendJson(res, 200, { error: "No project directory configured" });
      return;
    }

    const params = new URL(url, "http://localhost").searchParams;
    const taskId = params.get("task_id");

    const now = Date.now();
    const cacheKey = taskId ? `task_${taskId}` : "__all__";
    if (filesCache && filesCache.key === cacheKey && now - filesCache.time < FILES_CACHE_TTL) {
      sendJson(res, 200, filesCache.data);
      return;
    }

    try {
      const state = getState();
      const baselineRef = getBaselineRef();

      // If task_id is provided, check for task-scoped refs
      if (taskId) {
        const task = state.tasks.find((t) => String(t.id) === taskId);
        if (task) {
          // Task has start_ref and end_ref: use that range
          if (task.start_ref && task.end_ref) {
            const output = execSync(`git diff --name-status ${task.start_ref}..${task.end_ref}`, {
              cwd: projectDir, encoding: "utf-8", timeout: 5000,
            }).trim();
            const files = parseGitNameStatus(output, state);
            const data = { files };
            filesCache = { data, time: now, key: cacheKey };
            sendJson(res, 200, data);
            return;
          }
          // Task has start_ref only (in progress): diff from start to HEAD
          if (task.start_ref) {
            const output = execSync(`git diff --name-status ${task.start_ref}..HEAD`, {
              cwd: projectDir, encoding: "utf-8", timeout: 5000,
            }).trim();
            const files = parseGitNameStatus(output, state);
            const data = { files };
            filesCache = { data, time: now, key: cacheKey };
            sendJson(res, 200, data);
            return;
          }
          // Task has files array: use baseline or unstaged diff, filter by files
          if (task.files && task.files.length > 0) {
            const allFiles = getFilesWithBaseline(projectDir, baselineRef, state);
            const files = allFiles.filter((f) =>
              task.files!.some((tf) => f.path.endsWith(tf) || tf.endsWith(f.path))
            );
            const data = { files };
            filesCache = { data, time: now, key: cacheKey };
            sendJson(res, 200, data);
            return;
          }
        }
      }

      const files = getFilesWithBaseline(projectDir, baselineRef, state);
      const data = { files };
      filesCache = { data, time: now, key: cacheKey };
      sendJson(res, 200, data);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "git diff failed";
      sendJson(res, 200, { error: message });
    }
    return;
  }

  if (method === "GET" && url.startsWith("/api/diff?")) {
    const projectDir = getProjectDir();
    if (!projectDir) {
      sendJson(res, 200, { error: "No project directory configured" });
      return;
    }

    const params = new URL(url, "http://localhost").searchParams;
    const file = params.get("file");
    if (!file || file.includes("..")) {
      sendJson(res, 400, { error: "Invalid file path" });
      return;
    }

    const startRef = params.get("start_ref");
    const endRef = params.get("end_ref");

    try {
      let diff: string;
      if (startRef) {
        const ref = endRef ? `${startRef}..${endRef}` : `${startRef}..HEAD`;
        diff = execSync(`git diff ${ref} -- ${JSON.stringify(file)}`, {
          cwd: projectDir, encoding: "utf-8", timeout: 10000,
        });
      } else {
        const baselineRef = getBaselineRef();
        if (baselineRef) {
          const committedDiff = execSync(`git diff ${baselineRef}..HEAD -- ${JSON.stringify(file)}`, {
            cwd: projectDir, encoding: "utf-8", timeout: 10000,
          });
          const uncommittedDiff = execSync(`git diff -- ${JSON.stringify(file)}`, {
            cwd: projectDir, encoding: "utf-8", timeout: 10000,
          });
          diff = committedDiff + uncommittedDiff;
        } else {
          diff = execSync(`git diff -- ${JSON.stringify(file)}`, {
            cwd: projectDir, encoding: "utf-8", timeout: 10000,
          });
        }
      }
      sendJson(res, 200, { file, diff });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "git diff failed";
      sendJson(res, 200, { error: message });
    }
    return;
  }

  if (method === "GET" && url === "/api/status") {
    sendJson(res, 200, getState());
    return;
  }

  if (method === "GET" && url === "/api/log") {
    sendJson(res, 200, getLogs());
    return;
  }

  sendJson(res, 404, { error: "Not found" });
}

export function startServer(
  port?: number
): Promise<{ port: number; url: string }> {
  return new Promise((resolve, reject) => {
    if (server) {
      reject(new Error("Server is already running"));
      return;
    }

    server = http.createServer(handleRequest);

    server.on("error", (err) => {
      server = null;
      reject(err);
    });

    server.listen(port || 0, () => {
      const addr = server!.address();
      if (!addr || typeof addr === "string") {
        reject(new Error("Unexpected server address format"));
        return;
      }
      const actualPort = addr.port;
      resolve({ port: actualPort, url: `http://localhost:${actualPort}` });
    });
  });
}

export function stopServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!server) {
      resolve();
      return;
    }

    server.close((err) => {
      server = null;
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

export function isRunning(): boolean {
  return server !== null;
}

export function resetFilesCache(): void {
  filesCache = null;
}
