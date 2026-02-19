import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { Task, DashboardConfig, initDashboard, addTask, updateTask, addLog, reset, getState, getProjectDir } from './state.js';
import { startServer, stopServer, isRunning } from './http-server.js';
import { exec, execSync } from 'child_process';
import { platform } from 'os';

const COLOR_POOL = [
  '#ff6b6b', '#ffd43b', '#69db7c', '#4dabf7', '#da77f2',
  '#ff922b', '#38d9a9', '#e599f7', '#74c0fc', '#f06595'
];

let agentColors = new Map<string, string>();
let colorIndex = 0;

function getAgentColor(agent: string, explicitColor?: string): string {
  if (explicitColor) {
    agentColors.set(agent, explicitColor);
    return explicitColor;
  }
  const existing = agentColors.get(agent);
  if (existing) return existing;
  const color = COLOR_POOL[colorIndex % COLOR_POOL.length];
  colorIndex++;
  agentColors.set(agent, color);
  return color;
}

function openBrowser(url: string): void {
  const os = platform();
  let command: string;
  if (os === 'darwin') {
    command = `open ${url}`;
  } else if (os === 'win32') {
    command = `start ${url}`;
  } else {
    command = `xdg-open ${url}`;
  }
  exec(command, () => {});
}

export function registerTools(server: McpServer): void {

  // 1. kanban_init
  server.tool(
    'kanban_init',
    'Initialize the KanBan dashboard with a title and task list. Opens a browser to the live dashboard. IMPORTANT: Only use this tool when coordinating an agent Team created with TeamCreate. Do NOT use when dispatching parallel subagents without a Team.',
    {
      title: z.string().describe('Dashboard title'),
      subtitle: z.string().optional().describe('Dashboard subtitle'),
      tasks: z.array(z.object({
        id: z.number(),
        title: z.string(),
        agent: z.string(),
        agent_color: z.string().optional(),
        status: z.enum(['blocked', 'ready', 'in_progress', 'done']).optional().default('ready'),
        message: z.string().optional().default(''),
        progress: z.number().optional().default(0),
        high: z.number().optional(),
        medium: z.number().optional(),
        low: z.number().optional(),
        blocked_by: z.array(z.number()).optional(),
        phase: z.number().optional(),
        files: z.array(z.string()).optional(),
        subtasks: z.array(z.string()).optional(),
        subtasks_done: z.array(z.string()).optional(),
      })).describe('Initial task list'),
      port: z.number().optional().describe('Fixed port (0 for auto)'),
      open_browser: z.boolean().optional().default(true).describe('Open browser automatically'),
      project_dir: z.string().optional().describe('Absolute path to the project git repository for file diff inspection'),
    },
    async ({ title, subtitle, tasks, port, open_browser, project_dir }) => {
      reset();
      agentColors.clear();
      colorIndex = 0;

      let baseline_ref: string | undefined;
      if (project_dir) {
        try {
          baseline_ref = execSync('git rev-parse HEAD', { cwd: project_dir, encoding: 'utf-8', timeout: 5000 }).trim();
        } catch {
          // skip baseline_ref if git fails
        }
      }

      initDashboard({ title, subtitle: subtitle || '', project_dir, baseline_ref });

      for (const t of tasks) {
        const color = getAgentColor(t.agent, t.agent_color);
        const task: Task = {
          id: t.id,
          title: t.title,
          agent: t.agent,
          agent_color: color,
          status: t.status ?? 'ready',
          message: t.message ?? '',
          progress: t.progress ?? 0,
          ...(t.high !== undefined && { high: t.high }),
          ...(t.medium !== undefined && { medium: t.medium }),
          ...(t.low !== undefined && { low: t.low }),
          ...(t.blocked_by !== undefined && { blocked_by: t.blocked_by }),
          ...(t.phase !== undefined && { phase: t.phase }),
          ...(t.files !== undefined && { files: t.files }),
          ...(t.subtasks !== undefined && { subtasks: t.subtasks }),
          ...(t.subtasks_done !== undefined && { subtasks_done: t.subtasks_done }),
        };
        addTask(task);
      }

      let url: string;
      let actualPort: number;

      if (!isRunning()) {
        const result = await startServer(port || 0);
        url = result.url;
        actualPort = result.port;
      } else {
        const state = getState();
        actualPort = port || 0;
        url = `http://localhost:${actualPort}`;
      }

      if (open_browser) {
        openBrowser(url);
      }

      return { content: [{ type: 'text' as const, text: JSON.stringify({ url, port: actualPort }) }] };
    }
  );

  // 2. kanban_add_task
  server.tool(
    'kanban_add_task',
    'Add a new task to the KanBan dashboard.',
    {
      id: z.number(),
      title: z.string(),
      agent: z.string(),
      agent_color: z.string().optional(),
      status: z.enum(['blocked', 'ready', 'in_progress', 'done']).optional().default('ready'),
      message: z.string().optional().default(''),
      progress: z.number().optional().default(0),
      files: z.array(z.string()).optional(),
      subtasks: z.array(z.string()).optional(),
      blocked_by: z.array(z.number()).optional(),
    },
    async ({ id, title, agent, agent_color, status, message, progress, files, subtasks, blocked_by }) => {
      const color = getAgentColor(agent, agent_color);
      const task: Task = {
        id,
        title,
        agent,
        agent_color: color,
        status: status ?? 'ready',
        message: message ?? '',
        progress: progress ?? 0,
        ...(files !== undefined && { files }),
        ...(subtasks !== undefined && { subtasks }),
        ...(blocked_by !== undefined && { blocked_by }),
      };
      addTask(task);
      return { content: [{ type: 'text' as const, text: JSON.stringify({ success: true, task_id: id }) }] };
    }
  );

  // 3. kanban_update_task
  server.tool(
    'kanban_update_task',
    'Update an existing task on the KanBan dashboard.',
    {
      id: z.number(),
      status: z.enum(['blocked', 'ready', 'in_progress', 'done']).optional(),
      message: z.string().optional(),
      progress: z.number().optional(),
      subtasks_done: z.array(z.string()).optional(),
      agent: z.string().optional(),
      agent_color: z.string().optional(),
      high: z.number().optional(),
      medium: z.number().optional(),
      low: z.number().optional(),
      files: z.array(z.string()).optional(),
    },
    async ({ id, status, message, progress, subtasks_done, agent, agent_color, high, medium, low, files }) => {
      const updates: Partial<Task> = {};

      if (status !== undefined) updates.status = status;
      if (message !== undefined) updates.message = message;
      if (progress !== undefined) updates.progress = progress;
      if (subtasks_done !== undefined) updates.subtasks_done = subtasks_done;
      if (agent !== undefined) {
        updates.agent = agent;
        updates.agent_color = getAgentColor(agent, agent_color);
      } else if (agent_color !== undefined) {
        updates.agent_color = agent_color;
      }
      if (high !== undefined) updates.high = high;
      if (medium !== undefined) updates.medium = medium;
      if (low !== undefined) updates.low = low;
      if (files !== undefined) updates.files = files;

      if (status === 'in_progress' || status === 'done') {
        const projectDir = getProjectDir();
        if (projectDir) {
          try {
            const ref = execSync('git rev-parse HEAD', { cwd: projectDir, encoding: 'utf-8', timeout: 5000 }).trim();
            if (status === 'in_progress') {
              updates.start_ref = ref;
            } else {
              updates.end_ref = ref;
            }
          } catch {
            // skip ref if git fails
          }
        }
      }

      const existingState = getState();
      const existingTask = existingState.tasks.find(t => t.id === id);

      updateTask(id, updates);

      const updatedState = getState();
      const updatedTask = updatedState.tasks.find(t => t.id === id);

      if (updatedTask) {
        const logAgent = updatedTask.agent;
        const logColor = updatedTask.agent_color;

        if (status !== undefined && (!existingTask || existingTask.status !== status)) {
          const statusMessages: Record<string, string> = {
            'in_progress': `Started working on: ${updatedTask.title}`,
            'done': `Completed: ${updatedTask.title}`,
            'blocked': `Blocked: ${updatedTask.title}`,
            'ready': `Ready: ${updatedTask.title}`,
          };
          const msg = statusMessages[status];
          if (msg) {
            addLog({ time: new Date().toLocaleTimeString(), agent: logAgent, color: logColor, message: msg });
          }
        }

        if (subtasks_done !== undefined && existingTask) {
          const oldDone = new Set(existingTask.subtasks_done || []);
          for (const st of subtasks_done) {
            if (!oldDone.has(st)) {
              addLog({ time: new Date().toLocaleTimeString(), agent: logAgent, color: logColor, message: `Completed subtask: ${st}` });
            }
          }
        }

        if (message !== undefined && status === undefined && existingTask && existingTask.message !== message) {
          addLog({ time: new Date().toLocaleTimeString(), agent: logAgent, color: logColor, message });
        }
      }

      return { content: [{ type: 'text' as const, text: JSON.stringify({ success: true, task_id: id }) }] };
    }
  );

  // 4. kanban_log
  server.tool(
    'kanban_log',
    'Add a log entry to the KanBan dashboard activity log.',
    {
      agent: z.string(),
      message: z.string(),
      color: z.string().optional(),
    },
    async ({ agent, message, color }) => {
      const agentColor = getAgentColor(agent, color);
      addLog({
        time: new Date().toLocaleTimeString(),
        agent,
        color: agentColor,
        message,
      });
      return { content: [{ type: 'text' as const, text: JSON.stringify({ success: true }) }] };
    }
  );

  // 5. kanban_stop
  server.tool(
    'kanban_stop',
    'Stop the KanBan dashboard server and reset all state.',
    {},
    async () => {
      await stopServer();
      reset();
      return { content: [{ type: 'text' as const, text: JSON.stringify({ success: true }) }] };
    }
  );
}
