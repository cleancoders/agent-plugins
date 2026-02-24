#!/usr/bin/env node
// Starts the kanban dashboard locally with sample data for UI development.
// Creates a temp git repo with multi-language diffs so the diff modal works.
// Usage: npm run demo

const { initDashboard, addTask, addLog } = require("../dist/state.js");
const { startServer } = require("../dist/http-server.js");
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

// --- Temp git repo with real diffs ---

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "kanban-demo-"));
const git = (cmd) => execSync(`git ${cmd}`, { cwd: tmpDir, stdio: "ignore" });
const write = (rel, content) => {
  const full = path.join(tmpDir, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
};

git("init");
git('config user.email "demo@example.com"');
git('config user.name "Demo"');

//region Initial file contents (committed baseline)

write("src/auth/service.ts", `import { sign, verify } from "jsonwebtoken";
import { db } from "../db";
import type { User, TokenPair } from "./types";

const ACCESS_TTL = "15m";

export async function login(email: string, password: string): Promise<TokenPair> {
  const user = await db.users.findByEmail(email);
  if (!user || !user.verifyPassword(password)) {
    throw new Error("Invalid credentials");
  }
  return generateTokens(user);
}

function generateTokens(user: User): TokenPair {
  const accessToken = sign({ sub: user.id }, process.env.JWT_SECRET!, {
    expiresIn: ACCESS_TTL,
  });
  return { accessToken, refreshToken: "" };
}
`);

write("src/auth/middleware.ts", `import { verify } from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header) {
    return res.status(401).json({ error: "Missing token" });
  }
  const token = header.replace("Bearer ", "");
  const payload = verify(token, process.env.JWT_SECRET!);
  req.user = payload;
  next();
}
`);

write("src/auth/types.ts", `export interface User {
  id: string;
  email: string;
  name: string;
  verifyPassword(password: string): boolean;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}
`);

write("src/components/Header.tsx", `import React from "react";

interface HeaderProps {
  title: string;
}

export function Header({ title }: HeaderProps) {
  return (
    <header className="app-header">
      <h1>{title}</h1>
      <nav>
        <a href="/dashboard">Dashboard</a>
        <a href="/settings">Settings</a>
      </nav>
    </header>
  );
}
`);

write("src/components/Sidebar.tsx", `import React from "react";

const NAV_ITEMS = [
  { label: "Home", path: "/" },
  { label: "Projects", path: "/projects" },
  { label: "Team", path: "/team" },
];

export function Sidebar() {
  return (
    <aside className="sidebar">
      <ul>
        {NAV_ITEMS.map((item) => (
          <li key={item.path}>
            <a href={item.path}>{item.label}</a>
          </li>
        ))}
      </ul>
    </aside>
  );
}
`);

write("migrations/001_users.sql", `CREATE TABLE users (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email      VARCHAR(255) NOT NULL UNIQUE,
    name       VARCHAR(255) NOT NULL,
    password   TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_users_email ON users (email);
`);

write("migrations/002_sessions.sql", `CREATE TABLE sessions (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID NOT NULL REFERENCES users(id),
    token      TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);
`);

write(".github/workflows/ci.yml", `name: CI
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npm test
`);

write("src/core/handler.clj", `(ns acme.core.handler
  (:require [ring.util.response :as response]
            [acme.db :as db]))

(defn get-user [request]
  (let [id (get-in request [:params :id])
        user (db/find-user id)]
    (if user
      (response/response user)
      (response/not-found {:error "User not found"}))))

(defn list-users [_request]
  (response/response (db/all-users)))
`);

write("config/settings.py", `"""Application configuration."""

import os

class Config:
    """Base configuration."""
    SECRET_KEY = os.environ.get("SECRET_KEY", "dev-secret")
    DATABASE_URL = os.environ.get("DATABASE_URL", "sqlite:///app.db")
    DEBUG = False
    RATE_LIMIT = "100/hour"

class DevelopmentConfig(Config):
    DEBUG = True

class ProductionConfig(Config):
    pass
`);

git("add -A");
git('commit -m "Initial commit"');

//endregion

//region Modified files (unstaged changes that produce diffs)

write("src/auth/service.ts", `import { sign, verify } from "jsonwebtoken";
import { db } from "../db";
import { hash } from "../crypto";
import type { User, TokenPair } from "./types";

const ACCESS_TTL = "15m";
const REFRESH_TTL = "7d";

export async function login(email: string, password: string): Promise<TokenPair> {
  const user = await db.users.findByEmail(email);
  if (!user || !user.verifyPassword(password)) {
    throw new Error("Invalid credentials");
  }
  await db.users.updateLastLogin(user.id);
  return generateTokens(user);
}

export async function refresh(refreshToken: string): Promise<TokenPair> {
  const payload = verify(refreshToken, process.env.JWT_REFRESH_SECRET!);
  const user = await db.users.findById(payload.sub as string);
  if (!user) {
    throw new Error("User not found");
  }
  // Rotate refresh token to prevent reuse
  await db.sessions.revoke(refreshToken);
  return generateTokens(user);
}

export async function logout(refreshToken: string): Promise<void> {
  await db.sessions.revoke(refreshToken);
}

function generateTokens(user: User): TokenPair {
  const accessToken = sign(
    { sub: user.id, email: user.email },
    process.env.JWT_SECRET!,
    { expiresIn: ACCESS_TTL }
  );
  const refreshToken = sign(
    { sub: user.id },
    process.env.JWT_REFRESH_SECRET!,
    { expiresIn: REFRESH_TTL }
  );
  return { accessToken, refreshToken };
}
`);

write("src/auth/middleware.ts", `import { verify, TokenExpiredError } from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or malformed token" });
  }

  try {
    const token = header.slice(7);
    const payload = verify(token, process.env.JWT_SECRET!);
    req.user = payload;
    next();
  } catch (err) {
    if (err instanceof TokenExpiredError) {
      return res.status(401).json({ error: "Token expired", code: "TOKEN_EXPIRED" });
    }
    return res.status(401).json({ error: "Invalid token" });
  }
}

export function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    try {
      req.user = verify(header.slice(7), process.env.JWT_SECRET!);
    } catch {
      // Ignore invalid tokens for optional auth
    }
  }
  next();
}
`);

write("src/auth/types.ts", `export interface User {
  id: string;
  email: string;
  name: string;
  lastLogin?: Date;
  verifyPassword(password: string): boolean;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface TokenPayload {
  sub: string;
  email?: string;
  iat: number;
  exp: number;
}
`);

write("src/components/Header.tsx", `import React from "react";
import { UserMenu } from "./UserMenu";

interface HeaderProps {
  title: string;
  userName?: string;
  onLogout?: () => void;
}

export function Header({ title, userName, onLogout }: HeaderProps) {
  return (
    <header className="app-header">
      <div className="header-left">
        <h1>{title}</h1>
      </div>
      <nav className="header-nav">
        <a href="/dashboard">Dashboard</a>
        <a href="/analytics">Analytics</a>
        <a href="/settings">Settings</a>
      </nav>
      <div className="header-right">
        {userName && <UserMenu name={userName} onLogout={onLogout} />}
      </div>
    </header>
  );
}
`);

write("src/components/Sidebar.tsx", `import React, { useState } from "react";

interface NavItem {
  label: string;
  path: string;
  icon: string;
  badge?: number;
}

const NAV_ITEMS: NavItem[] = [
  { label: "Home", path: "/", icon: "home" },
  { label: "Projects", path: "/projects", icon: "folder" },
  { label: "Team", path: "/team", icon: "users" },
  { label: "Reports", path: "/reports", icon: "chart", badge: 3 },
];

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside className={\`sidebar \${collapsed ? "collapsed" : ""}\`}>
      <button className="sidebar-toggle" onClick={() => setCollapsed(!collapsed)}>
        {collapsed ? ">>" : "<<"}
      </button>
      <ul>
        {NAV_ITEMS.map((item) => (
          <li key={item.path}>
            <a href={item.path}>
              <span className="icon">{item.icon}</span>
              {!collapsed && <span className="label">{item.label}</span>}
              {!collapsed && item.badge && (
                <span className="badge">{item.badge}</span>
              )}
            </a>
          </li>
        ))}
      </ul>
    </aside>
  );
}
`);

write("migrations/001_users.sql", `CREATE TABLE users (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email      VARCHAR(255) NOT NULL UNIQUE,
    name       VARCHAR(255) NOT NULL,
    password   TEXT NOT NULL,
    last_login TIMESTAMPTZ,
    role       VARCHAR(50) NOT NULL DEFAULT 'user',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_users_email ON users (email);
CREATE INDEX idx_users_role  ON users (role);
`);

write("migrations/002_sessions.sql", `CREATE TABLE sessions (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token      TEXT NOT NULL UNIQUE,
    revoked    BOOLEAN NOT NULL DEFAULT false,
    user_agent TEXT,
    ip_addr    INET,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_sessions_token   ON sessions (token) WHERE NOT revoked;
CREATE INDEX idx_sessions_user_id ON sessions (user_id);
`);

write(".github/workflows/ci.yml", `name: CI
on:
  push:
    branches: [main]
  pull_request:

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run lint

  test:
    runs-on: ubuntu-latest
    needs: lint
    strategy:
      matrix:
        node-version: [18, 20, 22]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: \${{ matrix.node-version }}
          cache: npm
      - run: npm ci
      - run: npm test

  build:
    runs-on: ubuntu-latest
    needs: test
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run build
`);

write("src/core/handler.clj", `(ns acme.core.handler
  (:require [ring.util.response :as response]
            [acme.db :as db]
            [acme.auth :as auth]
            [clojure.tools.logging :as log]))

(defn get-user [request]
  (auth/require-auth! request)
  (let [id (get-in request [:params :id])
        user (db/find-user id)]
    (if user
      (-> (response/response (dissoc user :password))
          (response/content-type "application/json"))
      (do (log/warn "User not found:" id)
          (response/not-found {:error "User not found"})))))

(defn list-users [request]
  (auth/require-auth! request)
  (let [limit (get-in request [:params :limit] 50)
        offset (get-in request [:params :offset] 0)
        users (db/all-users {:limit limit :offset offset})]
    (-> (response/response {:users users :total (count users)})
        (response/content-type "application/json"))))

(defn update-user [request]
  (auth/require-role! request :admin)
  (let [id (get-in request [:params :id])
        body (:body request)
        updated (db/update-user! id body)]
    (response/response updated)))
`);

write("config/settings.py", `"""Application configuration."""

import os
from datetime import timedelta

class Config:
    """Base configuration."""
    SECRET_KEY = os.environ.get("SECRET_KEY", "dev-secret")
    DATABASE_URL = os.environ.get("DATABASE_URL", "sqlite:///app.db")
    DEBUG = False
    RATE_LIMIT = "100/hour"
    SESSION_LIFETIME = timedelta(hours=24)
    CORS_ORIGINS = os.environ.get("CORS_ORIGINS", "*").split(",")
    LOG_LEVEL = os.environ.get("LOG_LEVEL", "INFO")

class DevelopmentConfig(Config):
    DEBUG = True
    LOG_LEVEL = "DEBUG"
    RATE_LIMIT = "1000/hour"

class ProductionConfig(Config):
    SESSION_LIFETIME = timedelta(hours=8)

    @classmethod
    def validate(cls):
        """Ensure required env vars are set in production."""
        required = ["SECRET_KEY", "DATABASE_URL"]
        missing = [k for k in required if not os.environ.get(k)]
        if missing:
            raise RuntimeError(f"Missing env vars: {', '.join(missing)}")
`);

//endregion

// --- Dashboard state ---

initDashboard({
  title: "Acme Feature Sprint",
  subtitle: "Demo Dashboard",
  project_dir: tmpDir,
});

addTask({
  id: 1, title: "Set up project scaffolding", agent: "architect",
  agent_color: "#69db7c", status: "done", message: "All scaffolding complete",
  progress: 1,
  subtasks: ["Init repo", "Add TypeScript", "Add linter"],
  subtasks_done: ["Init repo", "Add TypeScript", "Add linter"],
});

addTask({
  id: 2, title: "Implement auth service (TypeScript)", agent: "backend-dev",
  agent_color: "#ff6b6b", status: "in_progress", message: "JWT token refresh working, testing edge cases",
  progress: 0.65,
  files: ["src/auth/service.ts", "src/auth/middleware.ts", "src/auth/types.ts"],
  subtasks: ["Login endpoint", "JWT generation", "Token refresh", "Logout endpoint", "Rate limiting"],
  subtasks_done: ["Login endpoint", "JWT generation", "Token refresh"],
  high: 1, medium: 2,
});

addTask({
  id: 3, title: "Design dashboard UI (React TSX)", agent: "frontend-dev",
  agent_color: "#ffd43b", status: "in_progress", message: "Polishing responsive layout",
  progress: 0.40,
  files: ["src/components/Header.tsx", "src/components/Sidebar.tsx"],
  subtasks: ["Header component", "Sidebar nav", "Card grid", "Theme system"],
  subtasks_done: ["Header component", "Sidebar nav"],
});

addTask({
  id: 4, title: "Write API integration tests", agent: "tester",
  agent_color: "#748ffc", status: "blocked", message: "Waiting on auth service",
  progress: 0, blocked_by: [2],
  subtasks: ["Auth endpoint tests", "User CRUD tests", "Error handling tests"],
});

addTask({
  id: 5, title: "Set up CI/CD pipeline (YAML)", agent: "devops",
  agent_color: "#f783ac", status: "ready", message: "",
  progress: 0,
  files: [".github/workflows/ci.yml"],
  subtasks: ["GitHub Actions config", "Docker build", "Deploy staging"],
});

addTask({
  id: 6, title: "Database schema migration (SQL)", agent: "backend-dev",
  agent_color: "#ff6b6b", status: "done", message: "Migrations applied",
  progress: 1,
  files: ["migrations/001_users.sql", "migrations/002_sessions.sql"],
  low: 1,
});

addTask({
  id: 7, title: "Clojure API handlers", agent: "backend-dev",
  agent_color: "#ff6b6b", status: "in_progress", message: "Adding auth + pagination",
  progress: 0.5,
  files: ["src/core/handler.clj"],
  subtasks: ["get-user", "list-users", "update-user", "delete-user"],
  subtasks_done: ["get-user", "list-users"],
});

addTask({
  id: 8, title: "Python app config", agent: "devops",
  agent_color: "#f783ac", status: "in_progress", message: "Adding production validation",
  progress: 0.6,
  files: ["config/settings.py"],
  subtasks: ["Base config", "Dev config", "Prod config"],
  subtasks_done: ["Base config", "Dev config"],
});

addLog({ time: "09:00:00", agent: "architect", color: "#69db7c", message: "Project scaffolding complete — handing off to team" });
addLog({ time: "09:15:00", agent: "backend-dev", color: "#ff6b6b", message: "Starting auth service implementation" });
addLog({ time: "09:20:00", agent: "frontend-dev", color: "#ffd43b", message: "Beginning dashboard UI component work" });
addLog({ time: "09:45:00", agent: "backend-dev", color: "#ff6b6b", message: "Login endpoint done, moving to JWT generation" });
addLog({ time: "10:00:00", agent: "backend-dev", color: "#ff6b6b", message: "Found XSS vulnerability in token payload — fixing (high severity)" });
addLog({ time: "10:15:00", agent: "frontend-dev", color: "#ffd43b", message: "Header and sidebar components merged" });
addLog({ time: "10:30:00", agent: "backend-dev", color: "#ff6b6b", message: "JWT refresh flow implemented, 2 medium findings logged" });
addLog({ time: "10:45:00", agent: "devops", color: "#f783ac", message: "Ready to start CI/CD setup once scaffolding stabilizes" });
addLog({ time: "11:00:00", agent: "tester", color: "#748ffc", message: "Test plan drafted — blocked on auth service completion" });
addLog({ time: "11:15:00", agent: "backend-dev", color: "#ff6b6b", message: "Clojure API handlers: added auth guards and pagination" });
addLog({ time: "11:30:00", agent: "devops", color: "#f783ac", message: "Python config: adding production env var validation" });

// --- Start server ---

(async () => {
  const { url } = await startServer(0);
  console.log(`\nKanban dashboard running at: ${url}`);
  console.log(`Temp git repo: ${tmpDir}\n`);
  console.log("Press Ctrl+C to stop.\n");

  process.on("SIGINT", () => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    process.exit(0);
  });

  try {
    execSync(`open ${url}`, { stdio: "ignore" });
  } catch {
    // non-macOS — user can open the URL manually
  }
})();