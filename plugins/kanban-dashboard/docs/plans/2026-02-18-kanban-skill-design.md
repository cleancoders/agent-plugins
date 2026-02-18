# Kanban Dashboard Skill Design

## Problem

The kanban-dashboard plugin exposes MCP tools but Claude has no reason to use them automatically when creating agent teams. Users must manually add instructions to CLAUDE.md for the dashboard to be used.

## Solution

A `SKILL.md` file inside the plugin at `skills/kanban-team/SKILL.md` that triggers when Claude creates agent teams with TeamCreate.

## Design Decisions

- **Team lead only** calls kanban tools - teammates don't need the plugin or special instructions
- **Triggers on TeamCreate only** - not on parallel agent dispatching (those are short-lived)
- **Bundled with plugin** - lives in `plugins/kanban-dashboard/skills/kanban-team/SKILL.md`

## Skill Description (always in context)

"Use when creating agent teams with TeamCreate - launches a live kanban dashboard to monitor team progress in the browser"

## Skill Body

Instructions for the team lead:

1. After creating tasks with TaskCreate, map them to kanban format and call `kanban_init`
2. On each teammate message/idle notification, call `kanban_update_task` with status/progress changes
3. When all work is done, call `kanban_stop`

## Status Mapping

| Claude TaskList | Kanban |
|---|---|
| pending + blockedBy | blocked |
| pending + no blockers | ready |
| in_progress | in_progress |
| completed | done |
