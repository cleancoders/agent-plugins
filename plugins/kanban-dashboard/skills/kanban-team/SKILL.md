---
name: kanban-team
description: Use when creating agent teams with TeamCreate - launches a live kanban dashboard to monitor team progress in the browser
---

# Kanban Dashboard for Agent Teams

When you create an agent team with TeamCreate, use the kanban-dashboard MCP tools to give the user a live browser-based dashboard showing task progress across all teammates.

**You (the team lead) are the sole driver of the dashboard.** Teammates do not call kanban tools. You update the board as teammates report back to you.

## Workflow

### 1. Initialize the dashboard after creating tasks

After you have created tasks with TaskCreate and before spawning teammates, call `kanban_init`. Break each task into subtasks -- progress is auto-calculated from `subtasks_done.length / subtasks.length`, so every task should include a `subtasks` array:

```
kanban_init({
  title: "<team or project name>",
  subtitle: "<brief description of the work>",
  tasks: [
    {
      id: <task-id-number>,
      title: "<task subject>",
      agent: "<teammate name who will own this>",
      status: "<see status mapping below>",
      message: "",
      subtasks: ["Subtask A", "Subtask B", "Subtask C"],
      blocked_by: [<ids of tasks that block this one>]
    }
    // ... one entry per task
  ],
  project_dir: "<absolute path to the project git repo>"
})
```

**Status mapping from TaskList to kanban:**

| TaskList state | Kanban status |
|---|---|
| pending + has blockedBy | `blocked` |
| pending + no blockers | `ready` |
| in_progress | `in_progress` |
| completed | `done` |

### 2. Update tasks as teammates report progress

Each time a teammate sends you a message or goes idle after completing work, update the dashboard. Ask teammates to report which files they modified so you can include them in updates.

**When a teammate starts work:**
```
kanban_update_task({ id: <task-id>, status: "in_progress", message: "Working on it" })
```

**When a teammate reports completing a subtask:**

Update `subtasks_done` with the full list of completed subtask strings. Progress is auto-calculated from the ratio of done subtasks to total subtasks.

```
kanban_update_task({
  id: <task-id>,
  subtasks_done: ["Subtask A"],
  message: "Finished Subtask A, starting Subtask B"
})
```

As more subtasks complete, send the cumulative list:

```
kanban_update_task({
  id: <task-id>,
  subtasks_done: ["Subtask A", "Subtask B"],
  message: "Subtask B done, moving to Subtask C"
})
```

**When a teammate completes a task:**

Include the final `subtasks_done` array and the `files` array listing all files the teammate modified. This enables per-task file diff inspection in the dashboard modal.

```
kanban_update_task({
  id: <task-id>,
  status: "done",
  subtasks_done: ["Subtask A", "Subtask B", "Subtask C"],
  files: ["src/feature.ts", "tests/feature.test.ts"],
  message: "All subtasks complete"
})
```

Blocked tasks whose dependencies are all done will automatically move to `ready` on the dashboard.

**Fallback for tasks without subtasks:** If a task has no `subtasks` array, you can set `progress` directly as a float from `0.0` to `1.0`. Prefer subtask tracking whenever possible.

### 3. Log notable events

Status changes, subtask completions, and message updates are automatically logged to the dashboard activity feed. Use `kanban_log` only for supplementary context that is not captured by task updates:

```
kanban_log({ agent: "<agent-name>", message: "<what happened>" })
```

### 4. Stop the dashboard when done

After all tasks are complete and you are shutting down the team:

```
kanban_stop()
```

## Tips

- Use the task's `message` field to show the latest status from each teammate -- it appears on the card.
- Always ask teammates to report which files they modified. Include them in the `files` array so the dashboard can show git diffs.
- Break every task into `subtasks` at init time. Update `subtasks_done` incrementally as teammates report progress -- this drives the progress bar automatically.
- The dashboard auto-opens in the browser on init. The user can refresh anytime to see current state.
