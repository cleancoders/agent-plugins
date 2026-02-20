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

### 2. Tell teammates their subtasks when dispatching

**This is critical for live progress tracking.** When you spawn or message a teammate with their task assignment, include the exact subtask names from the kanban so they can report progress against them.

Include this in every task dispatch message:

```
As you work, send me a progress message after completing each of these subtasks:
- Subtask A
- Subtask B
- Subtask C

For each update, tell me:
1. Which subtask you just finished
2. Which files you have created or modified so far
3. Which subtask you are starting next
```

This way, when a teammate messages you with "Finished Subtask A, modified src/foo.ts and src/bar.ts, starting Subtask B," you have everything needed to update the dashboard.

**Set the task to `in_progress` BEFORE spawning the teammate:**
```
kanban_update_task({ id: <task-id>, status: "in_progress", message: "Starting work" })
```
Then spawn the teammate. This ensures the dashboard reflects active work immediately.

### 3. Update the dashboard after EVERY teammate interaction

**Every time you receive a message from a teammate — whether it is a progress report, a question, an idle notification, or a completion message — update the kanban board.** Do not batch updates. Do not wait. The user is watching the dashboard in real time.

**When a teammate reports completing a subtask:**

Update `subtasks_done` with the cumulative list of completed subtask strings, include files reported so far, and set the message. Progress is auto-calculated from the ratio of done subtasks to total subtasks.

```
kanban_update_task({
  id: <task-id>,
  subtasks_done: ["Subtask A"],
  files: ["src/foo.ts", "src/bar.ts"],
  message: "Finished Subtask A, starting Subtask B"
})
```

As more subtasks complete, send the cumulative list:

```
kanban_update_task({
  id: <task-id>,
  subtasks_done: ["Subtask A", "Subtask B"],
  files: ["src/foo.ts", "src/bar.ts", "src/baz.ts"],
  message: "Subtask B done, moving to Subtask C"
})
```

**When a teammate sends a message but hasn't completed a subtask yet** (e.g., asking a question or reporting an issue), still update the message field:

```
kanban_update_task({
  id: <task-id>,
  message: "Investigating issue with API endpoint"
})
```

**When a teammate completes a task:**

Include the final `subtasks_done` array and the full `files` array. This enables per-task file diff inspection in the dashboard modal.

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

### 4. Log notable events

Status changes, subtask completions, and message updates are automatically logged to the dashboard activity feed. Use `kanban_log` only for supplementary context that is not captured by task updates:

```
kanban_log({ agent: "<agent-name>", message: "<what happened>" })
```

### 5. Stop the dashboard when done

After all tasks are complete and you are shutting down the team:

```
kanban_stop()
```

## Tips

- **Update immediately, every time.** The dashboard polls every 1.5 seconds. If you don't call `kanban_update_task`, the card will appear frozen to the user. Update on every teammate message.
- **Tell teammates their subtask names.** Teammates cannot report subtask progress if they don't know the names. Always include the subtask list in your dispatch message.
- **Track files incrementally.** Include all files modified so far in every update, not just at completion. The `files` array is replaced on each update (not appended), so always send the full list.
- Use the task's `message` field to show the latest status from each teammate -- it appears on the card.
- Break every task into `subtasks` at init time. Update `subtasks_done` incrementally as teammates report progress -- this drives the progress bar automatically.
- The dashboard auto-opens in the browser on init. The user can refresh anytime to see current state.
