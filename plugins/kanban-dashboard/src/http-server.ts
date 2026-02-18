import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { getState, getLogs } from "./state.js";

let server: http.Server | null = null;

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

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
