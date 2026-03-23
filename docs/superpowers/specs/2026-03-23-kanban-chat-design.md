# Kanban Dashboard Chat Feature — Design Spec

## Overview

Add a bidirectional chat channel between the orchestrator agent and the user through the kanban dashboard UI. The orchestrator can send messages and questions; the user can respond from the browser. When the orchestrator is waiting for input, the dashboard shows a visual indicator and fires a browser notification.

## Data Model

Chat state lives in `state.ts` alongside tasks, logs, and signals. Resets on `kanban_init` and `kanban_stop`.

```typescript
interface ChatMessage {
  id: number;           // Auto-incrementing, starts at 1
  sender: "agent" | "user";
  text: string;
  timestamp: string;    // ISO 8601
  waiting: boolean;     // True if this message is a question (immutable after creation)
  answered: boolean;    // True once the user has responded to a waiting message
  response_to?: number; // For user messages: the waiting message ID this answers (if any)
}
```

State additions:
- `chat: ChatMessage[]` — message history, capped at 500 messages (oldest dropped when exceeded)
- `chatCounter: number` — auto-incrementing message ID, resets to 0
- `readFreeformIds: Set<number>` — tracks which free-form user messages have been retrieved by the orchestrator via `message_id: 0` polling

### `waiting` Field Semantics

The `waiting` field is immutable after creation — it means "this message is a question." It stays `true` even after being answered. The pending question queue is determined by filtering on `waiting === true && answered === false`.

### Question Queue Invariant

Multiple `waiting` messages can exist simultaneously. They form a FIFO queue. The frontend surfaces the oldest unanswered question first. When the user responds, it answers the oldest pending question (sets `answered: true`), then the next one surfaces. Each `kanban_chat_poll` call checks its specific `message_id`, so multiple orchestrator loops can poll their respective questions concurrently.

### Free-Form User Messages

Users can send messages at any time, even when no question is pending. These are stored as `ChatMessage` with `sender: "user"`, `waiting: false`, `answered: false`, and no `response_to`. The orchestrator retrieves unsolicited user messages via `kanban_chat_poll` with `message_id: 0` (special convention meaning "get any unread user messages"). The `readFreeformIds` set tracks which have been returned to prevent duplicates on subsequent polls.

## MCP Tools

### `kanban_chat` — Send a message or question

The orchestrator calls this to send a message to the user.

**Parameters:**
- `message` (string, required) — the text to display
- `wait_for_response` (boolean, optional, default false) — if true, marks the message as a question needing user input

**Returns:**
- If `wait_for_response: false`: `{ success: true, message_id: number }`
- If `wait_for_response: true`: `{ success: true, message_id: number, status: "waiting" }`

When `wait_for_response: true`, an activity log entry is auto-added: `"{leader} is waiting for user input"` (uses the `leader` name from `DashboardConfig`, falling back to "Orchestrator").

### `kanban_chat_poll` — Poll for responses

The orchestrator calls this in a loop to wait for the user's answer to a specific question, or to check for unsolicited user messages.

**Parameters:**
- `message_id` (number, required) — the message ID returned from `kanban_chat`, or `0` to get unread free-form user messages

**Returns (when `message_id > 0`):**
- If no response yet: `{ status: "waiting" }`
- If user responded: `{ status: "answered", response: "the user's text" }`

**Returns (when `message_id == 0`):**
- `{ status: "ok", messages: Array<{ id: number, text: string, timestamp: string }> }` — unread free-form user messages (simplified shape, excludes irrelevant fields). Messages are marked as read in `readFreeformIds` after retrieval.

**Error cases:**
- If `message_id` does not exist: `{ status: "error", error: "message not found" }`
- If `message_id` refers to a non-waiting message: `{ status: "error", error: "message is not a question" }`
- If `message_id` refers to a user message: `{ status: "error", error: "message is not a question" }`

**Orchestrator workflow:**
1. Call `kanban_chat` with `wait_for_response: true`
2. Loop calling `kanban_chat_poll` with the returned `message_id` until `status: "answered"`

This mirrors how `AskUserQuestion` blocks in the terminal.

## HTTP Endpoints

### `GET /api/chat` — Frontend polls for chat state

**Returns:** `{ messages: ChatMessage[], waiting: boolean, pending_questions: number }`

- `waiting` — true if any agent message has `waiting === true && answered === false`
- `pending_questions` — count of unanswered waiting messages
- `messages` — full chat history for rendering on load/refresh

Frontend polls this on the same 1.5s interval as `/api/status`.

### `POST /api/chat` — User sends a message

**Body:** `{ text: string }`

**Validation:** Returns 400 if `text` is missing or empty.

Creates a `ChatMessage` with `sender: "user"`. If there are pending questions (`waiting === true && answered === false`), answers the oldest one (sets `answered: true` on the question, sets `response_to` on the user message). If no pending questions, creates a free-form user message.

**Returns:** `{ success: true, message_id: number, response_to?: number }` — `response_to` is included when the message answered a pending question.

## Frontend

### Floating Chat Bubble

- Positioned bottom-right corner
- Chat icon button styled consistently with existing dashboard elements
- Badge shows unread message count (messages since user last opened the panel) — tracked client-side via `lastSeenId`
- Pulses/glows when orchestrator is waiting for input

### Chat Panel (overlay)

- Opens on bubble click, anchored bottom-right above the bubble
- Header: "Chat" title + close button
- Scrollable message area: agent messages left-aligned, user messages right-aligned
- Input field + send button at the bottom — always enabled (free-form messages allowed anytime)
- When questions are pending: the oldest unanswered question is highlighted, "Waiting for your response" indicator above input
- Send on Enter, Shift+Enter for newline
- Auto-scrolls to latest message on new messages
- Auto-opens when a new `waiting` message arrives
- Renders full message history on initial load/page refresh

### Browser Notification

- Fires once when a new `waiting` message appears (only if panel is closed or tab not focused)
- Generic text: `"{leader} needs your input"` (uses leader name from config, falls back to "The orchestrator needs your input")
- Clicking the notification focuses the tab and opens the chat panel
- Requires `Notification.requestPermission()` — prompt user on first interaction if not already granted

### New Files

- `public/js/chat.js` — chat polling, rendering, notification logic
- `public/css/chat.css` — bubble, panel, message bubble styles

## State Reset & Integration

- `kanban_init` resets chat state (clears messages, resets counter to 0, clears `readFreeformIds`)
- `kanban_stop` clears chat state
- Chat polling starts on page load alongside existing status/log polling
- Chat is independent of the signal system — poke/shake/skip continue as before
- Activity log gets an auto-entry when orchestrator sends a `waiting` message
- All return values from MCP tools are wrapped in the standard MCP content envelope: `{ content: [{ type: 'text', text: JSON.stringify(...) }] }`

## Architecture Summary

```
Orchestrator Agent
    |
    | kanban_chat (send message/question)
    | kanban_chat_poll (wait for response / check free-form messages)
    v
MCP Server (state.ts)
    |
    | GET /api/chat (frontend polls, full history)
    | POST /api/chat (user sends message, auto-answers oldest pending question)
    v
Browser Dashboard
    |
    | Floating bubble + overlay panel
    | Browser notification on waiting
    | Question queue: oldest unanswered surfaces first
    v
User
```
