export interface Task {
  id: number;
  title: string;
  agent: string;
  agent_color: string;
  status: "blocked" | "ready" | "in_progress" | "done";
  message: string;
  progress: number;
  high?: number;
  medium?: number;
  low?: number;
  blocked_by?: number[];
  phase?: number;
  files?: string[];
  subtasks?: string[];
  subtasks_done?: string[];
  start_ref?: string;
  end_ref?: string;
  messages?: Array<{ time: string; text: string }>;
}

export interface LogEntry {
  time: string;
  agent: string;
  color: string;
  message: string;
}

export interface DashboardConfig {
  title: string;
  subtitle: string;
  project_dir?: string;
  baseline_ref?: string;
}

const defaultConfig: DashboardConfig = { title: "Dashboard", subtitle: "" };

let tasks: Task[] = [];
let logs: LogEntry[] = [];
let config: DashboardConfig = { ...defaultConfig };

export function initDashboard(cfg: DashboardConfig): void {
  config = { ...cfg };
}

export function addTask(task: Task): void {
  tasks.push({ ...task });
}

export function updateTask(id: number, updates: Partial<Task>): void {
  const index = tasks.findIndex((t) => t.id === id);
  if (index === -1) return;

  tasks[index] = { ...tasks[index], ...updates };

  if (updates.message !== undefined && updates.message !== "") {
    if (!tasks[index].messages) {
      tasks[index].messages = [];
    }
    tasks[index].messages!.push({
      time: new Date().toLocaleTimeString(),
      text: updates.message,
    });
  }

  if (updates.progress !== undefined && updates.progress > 1) {
    tasks[index].progress = updates.progress / 100;
  }

  const subtasks = tasks[index].subtasks;
  if (subtasks && subtasks.length > 0) {
    tasks[index].progress = (tasks[index].subtasks_done?.length || 0) / subtasks.length;
  }

  if (tasks[index].status === 'in_progress' && tasks[index].progress === 0) {
    tasks[index].progress = 0.02;
  }

  if (updates.status === "done") {
    unblockDependents();
  }
}

function unblockDependents(): void {
  const doneIds = new Set(
    tasks.filter((t) => t.status === "done").map((t) => t.id)
  );

  for (const task of tasks) {
    if (
      task.status === "blocked" &&
      task.blocked_by &&
      task.blocked_by.length > 0 &&
      task.blocked_by.every((depId) => doneIds.has(depId))
    ) {
      task.status = "ready";
    }
  }
}

export function addLog(entry: LogEntry): void {
  logs.push({ ...entry });
}

export function getState(): {
  tasks: Task[];
  config: DashboardConfig;
  server_time: string;
} {
  return {
    tasks: tasks.map((t) => ({ ...t })),
    config: { ...config },
    server_time: new Date().toISOString(),
  };
}

export function getLogs(): { entries: LogEntry[] } {
  return {
    entries: logs.map((e) => ({ ...e })),
  };
}

export function getProjectDir(): string | undefined {
  return config.project_dir;
}

export function getBaselineRef(): string | undefined {
  return config.baseline_ref;
}

export function reset(): void {
  tasks = [];
  logs = [];
  config = { ...defaultConfig };
}
