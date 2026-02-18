---
name: kanban-team
description: Use when creating agent teams with TeamCreate - launches a live kanban dashboard to monitor team progress in the browser
---

# Kanban Dashboard for Agent Teams

When you create an agent team with TeamCreate, use the kanban-dashboard MCP tools to give the user a live browser-based dashboard showing task progress across all teammates.

**You (the team lead) are the sole driver of the dashboard.** Teammates do not call kanban tools. You update the board as teammates report back to you.

## Workflow

### 1. Initialize the dashboard after creating tasks

After you have created tasks with TaskCreate and before spawning teammates, call `kanban_init`:

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
      progress: 0,
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

Each time a teammate sends you a message or goes idle after completing work, update the dashboard:

**When a teammate starts work:**
```
kanban_update_task({ id: <task-id>, status: "in_progress", message: "Working on it" })
```

**When a teammate reports progress:**
```
kanban_update_task({ id: <task-id>, progress: <0-100>, message: "<what they reported>" })
```

**When a teammate completes a task:**
```
kanban_update_task({ id: <task-id>, status: "done", progress: 100, message: "Complete" })
```

Blocked tasks whose dependencies are all done will automatically move to `ready` on the dashboard.

### 3. Log notable events

Use `kanban_log` for important activity that isn't a task status change:

```
kanban_log({ agent: "<agent-name>", message: "<what happened>" })
```

### 4. Stop the dashboard when done

After all tasks are complete and you are shutting down the team:

```
kanban_stop()
```

## Tips

- Use the task's `message` field to show the latest status from each teammate - it appears on the card.
- Use `files` to track which files a task modifies - the dashboard can show git diffs for them.
- Use `subtasks` and `subtasks_done` arrays to show checklist progress within a task.
- The dashboard auto-opens in the browser on init. The user can refresh anytime to see current state.
