# Kanban Dashboard Chat Feature — Design Spec

## Overview

Add a bidirectional chat channel between the orchestrator agent and the user through the kanban dashboard UI. The orchestrator can send messages and questions; the user can respond from the browser. When the orchestrator is waiting for input, the dashboard shows a visual indicator and fires a browser notification.

## Data Model

Chat state lives in `state.ts` alongside tasks, logs, and signals. Resets on `kanban_init` and `kanban_stop`.

```typescript
interface ChatMessage {
  id: number;           // Auto-incrementing
  sender: "agent" | "user";
  text: string;
  timestamp: string;    // ISO 8601
  waiting: boolean;     // True if this is a question awaiting user response
  answered: boolean;    // True once the user has responded to a waiting message
}
```

State additions:
- `chat: ChatMessage[]` — message history
- `chatCounter: number` — auto-incrementing message ID

The `waiting` field on the most recent agent message drives the notification and visual indicator. When the user responds, that message gets `answered: true` and `waiting: false`.

## MCP Tools

### `kanban_chat` — Send a message or question

The orchestrator calls this to send a message to the user.

**Parameters:**
- `message` (string, required) — the text to display
- `wait_for_response` (boolean, optional, default false) — if true, marks the message as a question needing user input

**Returns:**
- If `wait_for_response: false`: `{ success: true, message_id: number }`
- If `wait_for_response: true`: `{ success: true, message_id: number, status: "waiting" }`

When `wait_for_response: true`, an activity log entry is auto-added: "Orchestrator is waiting for user input".

### `kanban_chat_poll` — Poll for user's response

The orchestrator calls this in a loop to wait for the user's answer.

**Parameters:**
- `message_id` (number, required) — the message ID returned from `kanban_chat`

**Returns:**
- If no response yet: `{ status: "waiting" }`
- If user responded: `{ status: "answered", response: "the user's text" }`

**Orchestrator workflow:**
1. Call `kanban_chat` with `wait_for_response: true`
2. Loop calling `kanban_chat_poll` with the returned `message_id` until `status: "answered"`

This mirrors how `AskUserQuestion` blocks in the terminal.

## HTTP Endpoints

### `GET /api/chat` — Frontend polls for chat state

**Returns:** `{ messages: ChatMessage[], waiting: boolean }`

`waiting` is a convenience flag — true if the latest agent message has `waiting: true` and `answered: false`. Frontend polls this on the same 1.5s interval as `/api/status`.

### `POST /api/chat` — User sends a message

**Body:** `{ text: string }`

Creates a `ChatMessage` with `sender: "user"`. If there's a pending `waiting` message, marks it `answered: true` and `waiting: false`.

**Returns:** `{ success: true, message_id: number }`

## Frontend

### Floating Chat Bubble

- Positioned bottom-right corner
- Chat icon button styled consistently with existing dashboard elements
- Badge shows unread message count (messages since user last opened the panel)
- Pulses/glows when orchestrator is waiting for input

### Chat Panel (overlay)

- Opens on bubble click, anchored bottom-right above the bubble
- Header: "Chat" title + close button
- Scrollable message area: agent messages left-aligned, user messages right-aligned
- Input field + send button at the bottom
- When `waiting: true`: input field highlighted/focused, "Orchestrator is waiting for your response" indicator above input
- Send on Enter, Shift+Enter for newline
- Auto-scrolls to latest message
- Auto-opens when a new `waiting` message arrives

### Browser Notification

- Fires once when a new `waiting` message appears (only if panel is closed or tab not focused)
- Generic text: "The orchestrator needs your input"
- Clicking the notification focuses the tab and opens the chat panel
- Requires `Notification.requestPermission()` — prompt user on first interaction if not already granted

### New Files

- `public/js/chat.js` — chat polling, rendering, notification logic
- `public/css/chat.css` — bubble, panel, message bubble styles

## State Reset & Integration

- `kanban_init` resets chat state (clears messages, resets counter)
- `kanban_stop` clears chat state
- Chat polling starts on page load alongside existing status/log polling
- Chat is independent of the signal system — poke/shake/skip continue as before
- Activity log gets an auto-entry when orchestrator sends a `waiting` message

## Architecture Summary

```
Orchestrator Agent
    |
    | kanban_chat (send message/question)
    | kanban_chat_poll (wait for response)
    v
MCP Server (state.ts)
    |
    | GET /api/chat (frontend polls)
    | POST /api/chat (user sends message)
    v
Browser Dashboard
    |
    | Floating bubble + overlay panel
    | Browser notification on waiting
    v
User
```
