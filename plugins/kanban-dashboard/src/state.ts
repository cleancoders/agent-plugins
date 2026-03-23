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

export interface Signal {
  action: string;
  timestamp: string;
  source: string;
}

interface PendingSignal extends Signal {
  agent: string;
  acknowledged: boolean;
}

export interface DashboardConfig {
  title: string;
  subtitle: string;
  project_dir?: string;
  baseline_ref?: string;
  leader?: string;
  project?: string;
}

const defaultConfig: DashboardConfig = { title: "Dashboard", subtitle: "" };

let tasks: Task[] = [];
let logs: LogEntry[] = [];
let signals: PendingSignal[] = [];
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

export function addSignal(agent: string, signal: Signal): void {
  signals.push({ ...signal, agent, acknowledged: false });
}

export function consumeSignals(agent: string): Signal[] {
  const agentSignals = signals.filter(s => s.agent === agent && !s.acknowledged);
  for (const s of signals) {
    if (s.agent === agent && !s.acknowledged) s.acknowledged = true;
  }
  return agentSignals.map(({ action, timestamp, source }) => ({ action, timestamp, source }));
}

export function getSignalStatus(): Array<{ agent: string; action: string; timestamp: string; acknowledged: boolean }> {
  return signals.map(s => ({
    agent: s.agent,
    action: s.action,
    timestamp: s.timestamp,
    acknowledged: s.acknowledged,
  }));
}

export interface ChatMessage {
  id: number;
  sender: "agent" | "user";
  text: string;
  timestamp: string;
  waiting: boolean;
  answered: boolean;
  response_to?: number;
}

let chat: ChatMessage[] = [];
let chatCounter = 0;
let readFreeformIds = new Set<number>();

export function addChatMessage(msg: { sender: "agent" | "user"; text: string; waiting: boolean; response_to?: number }): ChatMessage {
  chatCounter++;
  const entry: ChatMessage = {
    id: chatCounter,
    sender: msg.sender,
    text: msg.text,
    timestamp: new Date().toISOString(),
    waiting: msg.waiting,
    answered: false,
    ...(msg.response_to !== undefined && { response_to: msg.response_to }),
  };
  chat.push(entry);
  if (chat.length > 500) {
    chat = chat.slice(chat.length - 500);
  }
  return { ...entry };
}

export function getChatState(): { messages: ChatMessage[]; waiting: boolean; pending_questions: number } {
  const pendingQuestions = chat.filter(m => m.sender === "agent" && m.waiting && !m.answered);
  return {
    messages: chat.map(m => ({ ...m })),
    waiting: pendingQuestions.length > 0,
    pending_questions: pendingQuestions.length,
  };
}

export function answerOldestQuestion(text: string): ChatMessage | null {
  const pending = chat.find(m => m.sender === "agent" && m.waiting && !m.answered);
  if (!pending) return null;
  pending.answered = true;
  const userMsg = addChatMessage({ sender: "user", text, waiting: false, response_to: pending.id });
  return userMsg;
}

export function addFreeformMessage(text: string): ChatMessage {
  return addChatMessage({ sender: "user", text, waiting: false });
}

export function getUnreadFreeformMessages(): Array<{ id: number; text: string; timestamp: string }> {
  const freeform = chat.filter(m =>
    m.sender === "user" && m.response_to === undefined && !readFreeformIds.has(m.id)
  );
  for (const m of freeform) {
    readFreeformIds.add(m.id);
  }
  return freeform.map(m => ({ id: m.id, text: m.text, timestamp: m.timestamp }));
}

export function getChatMessageById(id: number): ChatMessage | null {
  const msg = chat.find(m => m.id === id);
  return msg ? { ...msg } : null;
}

export function reset(): void {
  tasks = [];
  logs = [];
  signals = [];
  config = { ...defaultConfig };
  chat = [];
  chatCounter = 0;
  readFreeformIds = new Set<number>();
}
