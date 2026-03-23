# Kanban Dashboard Chat Feature — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a bidirectional chat channel between the orchestrator agent and the user through the kanban dashboard, with floating bubble UI and browser notifications.

**Architecture:** Two new MCP tools (`kanban_chat`, `kanban_chat_poll`) communicate via in-memory chat state in `state.ts`. Two new HTTP endpoints (`GET /api/chat`, `POST /api/chat`) serve the browser. A new vanilla JS/CSS chat widget (floating bubble + overlay panel) polls for messages and handles notifications.

**Tech Stack:** TypeScript (backend), vanilla JavaScript/CSS (frontend), Vitest (unit tests), Zod (schema validation)

**Spec:** `docs/superpowers/specs/2026-03-23-kanban-chat-design.md`

---

### Task 1: Chat State Management

**Files:**
- Modify: `plugins/kanban-dashboard/src/state.ts`
- Test: `plugins/kanban-dashboard/test/state.test.ts`

This task adds the `ChatMessage` interface, chat state variables, and all state mutation/query functions. All other tasks depend on this.

- [ ] **Step 1: Write failing test — addChatMessage for agent message**

In `test/state.test.ts`, add a new describe block:

```typescript
describe("chat state", () => {
  beforeEach(() => {
    reset();
  });

  it("addChatMessage stores an agent message visible in getChatState", () => {
    addChatMessage({ sender: "agent", text: "Hello", waiting: false });
    const { messages } = getChatState();
    expect(messages).toHaveLength(1);
    expect(messages[0].id).toBe(1);
    expect(messages[0].sender).toBe("agent");
    expect(messages[0].text).toBe("Hello");
    expect(messages[0].waiting).toBe(false);
    expect(messages[0].answered).toBe(false);
    expect(messages[0].timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
```

Also add `addChatMessage` and `getChatState` to the import statement at the top of the test file.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd plugins/kanban-dashboard && npx vitest run test/state.test.ts`
Expected: FAIL — `addChatMessage` and `getChatState` are not exported from state.ts

- [ ] **Step 3: Write minimal implementation**

In `src/state.ts`, add the interface and state variables after the existing signal state:

```typescript
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
```

Also update the `reset()` function to clear chat state:

```typescript
export function reset(): void {
  tasks = [];
  logs = [];
  signals = [];
  config = { ...defaultConfig };
  chat = [];
  chatCounter = 0;
  readFreeformIds = new Set<number>();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd plugins/kanban-dashboard && npx vitest run test/state.test.ts`
Expected: PASS

- [ ] **Step 5: Write failing test — auto-incrementing IDs**

```typescript
  it("auto-increments message IDs", () => {
    addChatMessage({ sender: "agent", text: "first", waiting: false });
    addChatMessage({ sender: "user", text: "second", waiting: false });
    const { messages } = getChatState();
    expect(messages[0].id).toBe(1);
    expect(messages[1].id).toBe(2);
  });
```

- [ ] **Step 6: Run test — should pass immediately (already implemented)**

Run: `cd plugins/kanban-dashboard && npx vitest run test/state.test.ts`
Expected: PASS

- [ ] **Step 7: Write failing test — waiting message with getChatState convenience flags**

```typescript
  it("getChatState returns waiting: true when a question is pending", () => {
    addChatMessage({ sender: "agent", text: "What color?", waiting: true });
    const state = getChatState();
    expect(state.waiting).toBe(true);
    expect(state.pending_questions).toBe(1);
  });

  it("getChatState returns waiting: false when no questions pending", () => {
    addChatMessage({ sender: "agent", text: "FYI", waiting: false });
    const state = getChatState();
    expect(state.waiting).toBe(false);
    expect(state.pending_questions).toBe(0);
  });
```

- [ ] **Step 8: Run test — should pass**

Run: `cd plugins/kanban-dashboard && npx vitest run test/state.test.ts`
Expected: PASS

- [ ] **Step 9: Write failing test — answerOldestQuestion**

```typescript
  it("answerOldestQuestion marks the oldest pending question as answered", () => {
    addChatMessage({ sender: "agent", text: "Q1?", waiting: true });
    addChatMessage({ sender: "agent", text: "Q2?", waiting: true });
    const userMsg = answerOldestQuestion("Answer to Q1");
    expect(userMsg).not.toBeNull();
    expect(userMsg!.response_to).toBe(1);
    const { messages } = getChatState();
    const q1 = messages.find(m => m.id === 1)!;
    expect(q1.answered).toBe(true);
    expect(q1.waiting).toBe(true); // waiting stays true (immutable)
  });
```

Add `answerOldestQuestion` to the import.

- [ ] **Step 10: Run test to verify it fails**

Run: `cd plugins/kanban-dashboard && npx vitest run test/state.test.ts`
Expected: FAIL — `answerOldestQuestion` not exported

- [ ] **Step 11: Implement answerOldestQuestion**

In `src/state.ts`:

```typescript
export function answerOldestQuestion(text: string): ChatMessage | null {
  const pending = chat.find(m => m.sender === "agent" && m.waiting && !m.answered);
  if (!pending) return null;
  pending.answered = true;
  const userMsg = addChatMessage({ sender: "user", text, waiting: false, response_to: pending.id });
  return userMsg;
}
```

- [ ] **Step 12: Run test to verify it passes**

Run: `cd plugins/kanban-dashboard && npx vitest run test/state.test.ts`
Expected: PASS

- [ ] **Step 13: Write failing test — answerOldestQuestion with no pending question (free-form)**

```typescript
  it("answerOldestQuestion returns null when no question is pending", () => {
    const result = answerOldestQuestion("Unsolicited msg");
    expect(result).toBeNull();
  });
```

- [ ] **Step 14: Run test — should pass**

Run: `cd plugins/kanban-dashboard && npx vitest run test/state.test.ts`
Expected: PASS

- [ ] **Step 15: Write failing test — addFreeformMessage**

```typescript
  it("addFreeformMessage creates a user message with no response_to", () => {
    const msg = addFreeformMessage("Hey there");
    expect(msg.sender).toBe("user");
    expect(msg.text).toBe("Hey there");
    expect(msg.response_to).toBeUndefined();
    expect(msg.waiting).toBe(false);
  });
```

Add `addFreeformMessage` to the import.

- [ ] **Step 16: Run test to verify it fails**

Run: `cd plugins/kanban-dashboard && npx vitest run test/state.test.ts`
Expected: FAIL — `addFreeformMessage` not exported

- [ ] **Step 17: Implement addFreeformMessage**

In `src/state.ts`:

```typescript
export function addFreeformMessage(text: string): ChatMessage {
  return addChatMessage({ sender: "user", text, waiting: false });
}
```

- [ ] **Step 18: Run test to verify it passes**

Run: `cd plugins/kanban-dashboard && npx vitest run test/state.test.ts`
Expected: PASS

- [ ] **Step 19: Write failing test — getUnreadFreeformMessages**

```typescript
  it("getUnreadFreeformMessages returns unread free-form user messages", () => {
    addChatMessage({ sender: "agent", text: "Q?", waiting: true });
    answerOldestQuestion("Answer");
    addFreeformMessage("Hey, FYI");
    addFreeformMessage("Another note");
    const unread = getUnreadFreeformMessages();
    expect(unread).toHaveLength(2);
    expect(unread[0].text).toBe("Hey, FYI");
    expect(unread[1].text).toBe("Another note");
  });

  it("getUnreadFreeformMessages marks messages as read", () => {
    addFreeformMessage("First");
    const first = getUnreadFreeformMessages();
    expect(first).toHaveLength(1);
    const second = getUnreadFreeformMessages();
    expect(second).toHaveLength(0);
  });

  it("getUnreadFreeformMessages excludes question responses", () => {
    addChatMessage({ sender: "agent", text: "Q?", waiting: true });
    answerOldestQuestion("Answer");
    addFreeformMessage("Free message");
    const unread = getUnreadFreeformMessages();
    expect(unread).toHaveLength(1);
    expect(unread[0].text).toBe("Free message");
  });
```

Add `getUnreadFreeformMessages` to the import.

- [ ] **Step 20: Run test to verify it fails**

Run: `cd plugins/kanban-dashboard && npx vitest run test/state.test.ts`
Expected: FAIL — `getUnreadFreeformMessages` not exported

- [ ] **Step 21: Implement getUnreadFreeformMessages**

In `src/state.ts`:

```typescript
export function getUnreadFreeformMessages(): Array<{ id: number; text: string; timestamp: string }> {
  const freeform = chat.filter(m =>
    m.sender === "user" && m.response_to === undefined && !readFreeformIds.has(m.id)
  );
  for (const m of freeform) {
    readFreeformIds.add(m.id);
  }
  return freeform.map(m => ({ id: m.id, text: m.text, timestamp: m.timestamp }));
}
```

- [ ] **Step 22: Run test to verify it passes**

Run: `cd plugins/kanban-dashboard && npx vitest run test/state.test.ts`
Expected: PASS

- [ ] **Step 23: Write failing test — getChatMessageById**

```typescript
  it("getChatMessageById returns the message for a valid ID", () => {
    addChatMessage({ sender: "agent", text: "Q?", waiting: true });
    const msg = getChatMessageById(1);
    expect(msg).not.toBeNull();
    expect(msg!.text).toBe("Q?");
  });

  it("getChatMessageById returns null for unknown ID", () => {
    expect(getChatMessageById(999)).toBeNull();
  });
```

Add `getChatMessageById` to the import.

- [ ] **Step 24: Run test to verify it fails**

Run: `cd plugins/kanban-dashboard && npx vitest run test/state.test.ts`
Expected: FAIL — `getChatMessageById` not exported

- [ ] **Step 25: Implement getChatMessageById**

In `src/state.ts`:

```typescript
export function getChatMessageById(id: number): ChatMessage | null {
  const msg = chat.find(m => m.id === id);
  return msg ? { ...msg } : null;
}
```

- [ ] **Step 26: Run test to verify it passes**

Run: `cd plugins/kanban-dashboard && npx vitest run test/state.test.ts`
Expected: PASS

- [ ] **Step 27: Write failing test — reset clears chat state**

```typescript
  it("reset clears chat messages and counter", () => {
    addChatMessage({ sender: "agent", text: "Hi", waiting: false });
    addFreeformMessage("Hey");
    reset();
    const { messages } = getChatState();
    expect(messages).toHaveLength(0);
    // Counter resets: next ID should be 1 again
    addChatMessage({ sender: "agent", text: "After reset", waiting: false });
    const state = getChatState();
    expect(state.messages[0].id).toBe(1);
  });

  it("reset clears readFreeformIds", () => {
    addFreeformMessage("Read me");
    getUnreadFreeformMessages(); // marks as read
    reset();
    addFreeformMessage("New after reset");
    const unread = getUnreadFreeformMessages();
    expect(unread).toHaveLength(1);
  });
```

- [ ] **Step 28: Run test — should pass**

Run: `cd plugins/kanban-dashboard && npx vitest run test/state.test.ts`
Expected: PASS

- [ ] **Step 29: Write failing test — 500 message cap**

```typescript
  it("caps chat history at 500 messages, dropping oldest", () => {
    for (let i = 0; i < 502; i++) {
      addChatMessage({ sender: "agent", text: `msg-${i}`, waiting: false });
    }
    const { messages } = getChatState();
    expect(messages).toHaveLength(500);
    expect(messages[0].text).toBe("msg-2");
    expect(messages[499].text).toBe("msg-501");
  });
```

- [ ] **Step 30: Run test — should pass**

Run: `cd plugins/kanban-dashboard && npx vitest run test/state.test.ts`
Expected: PASS

- [ ] **Step 31: Write failing test — FIFO queue answers oldest question first**

```typescript
  it("FIFO: answers oldest unanswered question first", () => {
    addChatMessage({ sender: "agent", text: "Q1?", waiting: true });
    addChatMessage({ sender: "agent", text: "Q2?", waiting: true });
    addChatMessage({ sender: "agent", text: "Q3?", waiting: true });
    answerOldestQuestion("A1");
    answerOldestQuestion("A2");
    const { messages } = getChatState();
    const q1 = messages.find(m => m.id === 1)!;
    const q2 = messages.find(m => m.id === 2)!;
    const q3 = messages.find(m => m.id === 3)!;
    expect(q1.answered).toBe(true);
    expect(q2.answered).toBe(true);
    expect(q3.answered).toBe(false);
    expect(getChatState().pending_questions).toBe(1);
  });
```

- [ ] **Step 32: Run test — should pass**

Run: `cd plugins/kanban-dashboard && npx vitest run test/state.test.ts`
Expected: PASS

- [ ] **Step 33: Commit**

```bash
cd plugins/kanban-dashboard && git add src/state.ts test/state.test.ts && git commit -m "feat(kanban): add chat state management — ChatMessage, FIFO queue, free-form messages"
```

---

### Task 2: MCP Tools — kanban_chat and kanban_chat_poll

**Files:**
- Modify: `plugins/kanban-dashboard/src/tools.ts`
- Test: `plugins/kanban-dashboard/test/tools.test.ts`

Depends on: Task 1

- [ ] **Step 1: Write failing test — kanban_chat sends a plain message**

In `test/tools.test.ts`, add a new describe block. Follow the existing pattern with `createMockServer()` and `parseResult()`:

```typescript
describe("kanban_chat tool", () => {
  let tools: Map<string, RegisteredTool>;

  beforeEach(() => {
    reset();
    const mock = createMockServer();
    tools = mock.tools;
    registerTools(mock.server);
  });

  it("sends a plain message and returns message_id", async () => {
    const handler = tools.get("kanban_chat")!.handler;
    const result = parseResult(await handler({ message: "Hello team", wait_for_response: false }));
    expect(result.success).toBe(true);
    expect(result.message_id).toBe(1);
    expect(result.status).toBeUndefined();
  });
});
```

Add `getChatState` to the import from `../src/state.js`.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd plugins/kanban-dashboard && npx vitest run test/tools.test.ts`
Expected: FAIL — no tool named `kanban_chat`

- [ ] **Step 3: Implement kanban_chat tool**

In `src/tools.ts`, add the import for `addChatMessage`, `getChatState`, `getChatMessageById`, `getUnreadFreeformMessages`, `answerOldestQuestion`, `addFreeformMessage` from `./state.js`, and add `addLog` if not already imported.

Register the tool after `kanban_check_signals`:

```typescript
  // 7. kanban_chat
  server.tool(
    'kanban_chat',
    'Send a message or question to the user via the dashboard chat. Use wait_for_response: true to ask a question and then poll with kanban_chat_poll for the answer.',
    {
      message: z.string().describe('The message text to display'),
      wait_for_response: z.boolean().optional().default(false).describe('If true, marks as a question awaiting user response'),
    },
    async ({ message, wait_for_response }) => {
      const msg = addChatMessage({ sender: "agent", text: message as string, waiting: wait_for_response as boolean });
      if (wait_for_response) {
        const state = getState();
        const leader = state.config.leader || "Orchestrator";
        addLog({ time: new Date().toLocaleTimeString(), agent: leader, color: "#4fc3f7", message: `${leader} is waiting for user input` });
        return { content: [{ type: 'text' as const, text: JSON.stringify({ success: true, message_id: msg.id, status: "waiting" }) }] };
      }
      return { content: [{ type: 'text' as const, text: JSON.stringify({ success: true, message_id: msg.id }) }] };
    }
  );
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd plugins/kanban-dashboard && npx vitest run test/tools.test.ts`
Expected: PASS

- [ ] **Step 5: Write failing test — kanban_chat with wait_for_response adds log entry**

```typescript
  it("sends a question with wait_for_response and adds activity log", async () => {
    // Init dashboard with leader name
    const initHandler = tools.get("kanban_init")!.handler;
    await initHandler({ title: "T", tasks: [], open_browser: false, leader: "Alice" });

    const handler = tools.get("kanban_chat")!.handler;
    const result = parseResult(await handler({ message: "Which DB?", wait_for_response: true }));
    expect(result.success).toBe(true);
    expect(result.status).toBe("waiting");
    expect(result.message_id).toBe(1);

    const { entries } = getLogs();
    expect(entries.some(e => e.message.includes("Alice is waiting for user input"))).toBe(true);
  });
```

Add `getLogs` to the import from `../src/state.js` if not already present.

- [ ] **Step 6: Run test — should pass**

Run: `cd plugins/kanban-dashboard && npx vitest run test/tools.test.ts`
Expected: PASS

- [ ] **Step 7: Write failing test — kanban_chat_poll with waiting question**

```typescript
describe("kanban_chat_poll tool", () => {
  let tools: Map<string, RegisteredTool>;

  beforeEach(() => {
    reset();
    const mock = createMockServer();
    tools = mock.tools;
    registerTools(mock.server);
  });

  it("returns waiting when question not yet answered", async () => {
    const chatHandler = tools.get("kanban_chat")!.handler;
    const chatResult = parseResult(await chatHandler({ message: "Q?", wait_for_response: true }));

    const pollHandler = tools.get("kanban_chat_poll")!.handler;
    const result = parseResult(await pollHandler({ message_id: chatResult.message_id }));
    expect(result.status).toBe("waiting");
  });
});
```

- [ ] **Step 8: Run test to verify it fails**

Run: `cd plugins/kanban-dashboard && npx vitest run test/tools.test.ts`
Expected: FAIL — no tool named `kanban_chat_poll`

- [ ] **Step 9: Implement kanban_chat_poll tool**

In `src/tools.ts`, register after `kanban_chat`:

```typescript
  // 8. kanban_chat_poll
  server.tool(
    'kanban_chat_poll',
    'Poll for the user\'s response to a chat question (by message_id), or check for unsolicited user messages (message_id: 0).',
    {
      message_id: z.number().describe('The message ID from kanban_chat, or 0 for unread free-form messages'),
    },
    async ({ message_id }) => {
      const id = message_id as number;
      if (id === 0) {
        const msgs = getUnreadFreeformMessages();
        return { content: [{ type: 'text' as const, text: JSON.stringify({ status: "ok", messages: msgs }) }] };
      }
      const msg = getChatMessageById(id);
      if (!msg) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ status: "error", error: "message not found" }) }] };
      }
      if (msg.sender !== "agent" || !msg.waiting) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ status: "error", error: "message is not a question" }) }] };
      }
      if (msg.answered) {
        // Find the user response
        const chatState = getChatState();
        const response = chatState.messages.find(m => m.response_to === id);
        return { content: [{ type: 'text' as const, text: JSON.stringify({ status: "answered", response: response?.text || "" }) }] };
      }
      return { content: [{ type: 'text' as const, text: JSON.stringify({ status: "waiting" }) }] };
    }
  );
```

- [ ] **Step 10: Run test to verify it passes**

Run: `cd plugins/kanban-dashboard && npx vitest run test/tools.test.ts`
Expected: PASS

- [ ] **Step 11: Write failing test — kanban_chat_poll returns answered after user responds**

```typescript
  it("returns answered with response text after question is answered", async () => {
    const chatHandler = tools.get("kanban_chat")!.handler;
    const chatResult = parseResult(await chatHandler({ message: "Q?", wait_for_response: true }));

    // Simulate user answering via state directly
    answerOldestQuestion("My answer");

    const pollHandler = tools.get("kanban_chat_poll")!.handler;
    const result = parseResult(await pollHandler({ message_id: chatResult.message_id }));
    expect(result.status).toBe("answered");
    expect(result.response).toBe("My answer");
  });
```

Add `answerOldestQuestion` to the import from `../src/state.js`.

- [ ] **Step 12: Run test — should pass**

Run: `cd plugins/kanban-dashboard && npx vitest run test/tools.test.ts`
Expected: PASS

- [ ] **Step 13: Write failing test — kanban_chat_poll error cases**

```typescript
  it("returns error for non-existent message_id", async () => {
    const pollHandler = tools.get("kanban_chat_poll")!.handler;
    const result = parseResult(await pollHandler({ message_id: 999 }));
    expect(result.status).toBe("error");
    expect(result.error).toBe("message not found");
  });

  it("returns error for non-waiting message", async () => {
    const chatHandler = tools.get("kanban_chat")!.handler;
    await chatHandler({ message: "FYI", wait_for_response: false });

    const pollHandler = tools.get("kanban_chat_poll")!.handler;
    const result = parseResult(await pollHandler({ message_id: 1 }));
    expect(result.status).toBe("error");
    expect(result.error).toBe("message is not a question");
  });

  it("returns error when polling a user message ID", async () => {
    addFreeformMessage("User said hi");

    const pollHandler = tools.get("kanban_chat_poll")!.handler;
    const result = parseResult(await pollHandler({ message_id: 1 }));
    expect(result.status).toBe("error");
    expect(result.error).toBe("message is not a question");
  });
```

- [ ] **Step 14: Run test — should pass**

Run: `cd plugins/kanban-dashboard && npx vitest run test/tools.test.ts`
Expected: PASS

- [ ] **Step 15: Write failing test — kanban_chat_poll with message_id: 0 for free-form messages**

```typescript
  it("returns unread free-form messages with message_id: 0", async () => {
    addFreeformMessage("Hey orchestrator");
    addFreeformMessage("One more thing");

    const pollHandler = tools.get("kanban_chat_poll")!.handler;
    const result = parseResult(await pollHandler({ message_id: 0 }));
    expect(result.status).toBe("ok");
    expect(result.messages).toHaveLength(2);
    expect(result.messages[0].text).toBe("Hey orchestrator");

    // Second call returns empty (already read)
    const result2 = parseResult(await pollHandler({ message_id: 0 }));
    expect(result2.messages).toHaveLength(0);
  });
```

Add `addFreeformMessage` to the import from `../src/state.js`.

- [ ] **Step 16: Run test — should pass**

Run: `cd plugins/kanban-dashboard && npx vitest run test/tools.test.ts`
Expected: PASS

- [ ] **Step 17: Commit**

```bash
cd plugins/kanban-dashboard && git add src/tools.ts test/tools.test.ts && git commit -m "feat(kanban): add kanban_chat and kanban_chat_poll MCP tools"
```

---

### Task 3: HTTP Endpoints — GET /api/chat and POST /api/chat

**Files:**
- Modify: `plugins/kanban-dashboard/src/http-server.ts`
- Test: `plugins/kanban-dashboard/test/http-server.test.ts`

Depends on: Task 1

- [ ] **Step 1: Write failing test — GET /api/chat returns empty chat state**

In `test/http-server.test.ts`, add a new describe block following the existing pattern (start server in beforeEach, stop in afterEach):

```typescript
describe("GET /api/chat", () => {
  let baseUrl: string;

  beforeEach(async () => {
    reset();
    resetFilesCache();
    mockExecSync.mockReset();
    const info = await startServer(0);
    baseUrl = info.url;
  });

  afterEach(async () => {
    await stopServer();
  });

  it("returns empty chat state when no messages exist", async () => {
    const { status, body } = await fetchJson(`${baseUrl}/api/chat`);
    expect(status).toBe(200);
    expect(body.messages).toEqual([]);
    expect(body.waiting).toBe(false);
    expect(body.pending_questions).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd plugins/kanban-dashboard && npx vitest run test/http-server.test.ts`
Expected: FAIL — 404 for /api/chat

- [ ] **Step 3: Implement GET /api/chat endpoint**

In `src/http-server.ts`, add `getChatState` to the import from `./state.js`. Then add the route handler before the 404 catch-all:

```typescript
  if (method === "GET" && url === "/api/chat") {
    sendJson(res, 200, getChatState());
    return;
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd plugins/kanban-dashboard && npx vitest run test/http-server.test.ts`
Expected: PASS

- [ ] **Step 5: Write failing test — GET /api/chat returns messages**

```typescript
  it("returns messages after chat messages are added", async () => {
    addChatMessage({ sender: "agent", text: "Hello", waiting: false });
    addChatMessage({ sender: "agent", text: "Any questions?", waiting: true });

    const { status, body } = await fetchJson(`${baseUrl}/api/chat`);
    expect(status).toBe(200);
    expect(body.messages).toHaveLength(2);
    expect(body.waiting).toBe(true);
    expect(body.pending_questions).toBe(1);
  });
```

Add `addChatMessage` to the import from `../src/state.js`.

- [ ] **Step 6: Run test — should pass**

Run: `cd plugins/kanban-dashboard && npx vitest run test/http-server.test.ts`
Expected: PASS

- [ ] **Step 7: Write failing test — POST /api/chat answers a pending question**

```typescript
describe("POST /api/chat", () => {
  let baseUrl: string;

  beforeEach(async () => {
    reset();
    resetFilesCache();
    mockExecSync.mockReset();
    const info = await startServer(0);
    baseUrl = info.url;
  });

  afterEach(async () => {
    await stopServer();
  });

  it("answers the oldest pending question", async () => {
    addChatMessage({ sender: "agent", text: "Q1?", waiting: true });

    const res = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "Answer to Q1" }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.message_id).toBeDefined();
    expect(body.response_to).toBe(1);
  });
});
```

- [ ] **Step 8: Run test to verify it fails**

Run: `cd plugins/kanban-dashboard && npx vitest run test/http-server.test.ts`
Expected: FAIL — 404 for POST /api/chat

- [ ] **Step 9: Implement POST /api/chat endpoint**

In `src/http-server.ts`, add `answerOldestQuestion` and `addFreeformMessage` to the import from `./state.js`. Then add the route handler:

```typescript
  if (method === "POST" && url === "/api/chat") {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      try {
        const data = JSON.parse(body);
        if (!data.text || typeof data.text !== "string" || data.text.trim() === "") {
          sendJson(res, 400, { error: "text is required" });
          return;
        }
        const answered = answerOldestQuestion(data.text);
        if (answered) {
          sendJson(res, 200, { success: true, message_id: answered.id, response_to: answered.response_to });
        } else {
          const msg = addFreeformMessage(data.text);
          sendJson(res, 200, { success: true, message_id: msg.id });
        }
      } catch {
        sendJson(res, 400, { error: "Invalid JSON" });
      }
    });
    return;
  }
```

- [ ] **Step 10: Run test to verify it passes**

Run: `cd plugins/kanban-dashboard && npx vitest run test/http-server.test.ts`
Expected: PASS

- [ ] **Step 11: Write failing test — POST /api/chat creates free-form message when no question pending**

```typescript
  it("creates a free-form message when no question is pending", async () => {
    const res = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "Hey there" }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.response_to).toBeUndefined();
  });
```

- [ ] **Step 12: Run test — should pass**

Run: `cd plugins/kanban-dashboard && npx vitest run test/http-server.test.ts`
Expected: PASS

- [ ] **Step 13: Write failing test — POST /api/chat returns 400 for missing text**

```typescript
  it("returns 400 when text is missing", async () => {
    const res = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 when text is empty", async () => {
    const res = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "   " }),
    });
    expect(res.status).toBe(400);
  });
```

- [ ] **Step 14: Run test — should pass**

Run: `cd plugins/kanban-dashboard && npx vitest run test/http-server.test.ts`
Expected: PASS

- [ ] **Step 15: Commit**

```bash
cd plugins/kanban-dashboard && git add src/http-server.ts test/http-server.test.ts && git commit -m "feat(kanban): add GET/POST /api/chat HTTP endpoints"
```

---

### Task 4: Frontend — Chat CSS

**Files:**
- Create: `plugins/kanban-dashboard/public/css/chat.css`
- Modify: `plugins/kanban-dashboard/public/index.html` (add stylesheet link)

Depends on: None (can run in parallel with Tasks 1-3)

- [ ] **Step 1: Create chat.css**

Create `plugins/kanban-dashboard/public/css/chat.css`:

```css
/* Chat bubble */
.chat-bubble {
  position: fixed;
  bottom: 20px;
  right: 20px;
  width: 52px;
  height: 52px;
  border-radius: 50%;
  background: var(--blue, #4fc3f7);
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.4);
  z-index: 1000;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}

.chat-bubble:hover {
  transform: scale(1.08);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
}

.chat-bubble-badge {
  position: absolute;
  top: -4px;
  right: -4px;
  background: var(--red, #ff6b6b);
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  min-width: 18px;
  height: 18px;
  border-radius: 9px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 4px;
}

.chat-bubble-badge:empty {
  display: none;
}

.chat-bubble.waiting {
  animation: chat-pulse 1.5s ease-in-out infinite;
}

@keyframes chat-pulse {
  0%, 100% { box-shadow: 0 2px 12px rgba(0, 0, 0, 0.4); }
  50% { box-shadow: 0 0 0 8px rgba(79, 195, 247, 0.3), 0 2px 12px rgba(0, 0, 0, 0.4); }
}

/* Chat panel */
.chat-panel {
  position: fixed;
  bottom: 80px;
  right: 20px;
  width: 360px;
  max-height: 480px;
  background: var(--bg-card, #16213e);
  border: 1px solid var(--border, #2a2a5a);
  border-radius: 12px;
  display: none;
  flex-direction: column;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
  z-index: 1001;
  overflow: hidden;
}

.chat-panel.open {
  display: flex;
}

.chat-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border, #2a2a5a);
  background: var(--bg-column, #1a1a2e);
}

.chat-panel-title {
  font-weight: 700;
  font-size: 14px;
  color: var(--blue, #4fc3f7);
}

.chat-panel-close {
  background: none;
  border: none;
  color: var(--text-muted, #888);
  font-size: 18px;
  cursor: pointer;
  padding: 0 4px;
  line-height: 1;
}

.chat-panel-close:hover {
  color: var(--text-light, #fff);
}

/* Messages area */
.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 200px;
  max-height: 340px;
}

.chat-msg {
  max-width: 80%;
  padding: 8px 12px;
  border-radius: 12px;
  font-size: 13px;
  line-height: 1.4;
  word-wrap: break-word;
  white-space: pre-wrap;
}

.chat-msg.agent {
  align-self: flex-start;
  background: var(--bg-column, #1a1a2e);
  color: var(--text-light, #e0e0e0);
  border-bottom-left-radius: 4px;
}

.chat-msg.user {
  align-self: flex-end;
  background: var(--blue, #4fc3f7);
  color: #000;
  border-bottom-right-radius: 4px;
}

.chat-msg.waiting-question {
  border-left: 3px solid var(--yellow, #ffd43b);
}

.chat-msg-time {
  font-size: 10px;
  color: var(--text-dim, #666);
  margin-top: 2px;
}

.chat-msg.user .chat-msg-time {
  color: rgba(0, 0, 0, 0.5);
}

/* Waiting indicator */
.chat-waiting-indicator {
  display: none;
  padding: 6px 12px;
  font-size: 12px;
  color: var(--yellow, #ffd43b);
  background: rgba(255, 212, 59, 0.08);
  border-top: 1px solid var(--border, #2a2a5a);
  text-align: center;
}

.chat-waiting-indicator.visible {
  display: block;
}

/* Input area */
.chat-input-area {
  display: flex;
  gap: 8px;
  padding: 10px;
  border-top: 1px solid var(--border, #2a2a5a);
  background: var(--bg-column, #1a1a2e);
}

.chat-input {
  flex: 1;
  background: var(--bg-main, #0d1b2a);
  border: 1px solid var(--border, #2a2a5a);
  border-radius: 8px;
  padding: 8px 12px;
  color: var(--text-light, #e0e0e0);
  font-size: 13px;
  font-family: inherit;
  resize: none;
  min-height: 36px;
  max-height: 80px;
  outline: none;
}

.chat-input:focus {
  border-color: var(--blue, #4fc3f7);
}

.chat-input.highlight {
  border-color: var(--yellow, #ffd43b);
  box-shadow: 0 0 0 2px rgba(255, 212, 59, 0.2);
}

.chat-send-btn {
  background: var(--blue, #4fc3f7);
  color: #000;
  border: none;
  border-radius: 8px;
  padding: 0 14px;
  font-weight: 700;
  font-size: 13px;
  cursor: pointer;
  white-space: nowrap;
}

.chat-send-btn:hover {
  opacity: 0.9;
}

/* Empty state */
.chat-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-dim, #666);
  font-size: 13px;
  min-height: 200px;
}

/* Mobile */
@media (max-width: 767px) {
  .chat-panel {
    right: 10px;
    left: 10px;
    width: auto;
    bottom: 74px;
    max-height: 60vh;
  }

  .chat-bubble {
    bottom: 14px;
    right: 14px;
    width: 46px;
    height: 46px;
    font-size: 20px;
  }
}
```

- [ ] **Step 2: Add stylesheet link to index.html**

In `plugins/kanban-dashboard/public/index.html`, after the signals.css link (line 13), add:

```html
<link rel="stylesheet" href="/css/chat.css">
```

- [ ] **Step 3: Commit**

```bash
cd plugins/kanban-dashboard && git add public/css/chat.css public/index.html && git commit -m "feat(kanban): add chat panel CSS and link in index.html"
```

---

### Task 5: Frontend — Chat JavaScript

**Files:**
- Create: `plugins/kanban-dashboard/public/js/chat.js`
- Modify: `plugins/kanban-dashboard/public/index.html` (add script tag + HTML elements)

Depends on: Task 3 (HTTP endpoints), Task 4 (CSS)

- [ ] **Step 1: Add chat HTML elements to index.html**

In `plugins/kanban-dashboard/public/index.html`, before the `<button class="log-fab"` line (line 155), add:

```html
<button class="chat-bubble" id="chat-bubble" title="Chat">
  <span>&#128172;</span>
  <span class="chat-bubble-badge" id="chat-badge"></span>
</button>

<div class="chat-panel" id="chat-panel">
  <div class="chat-panel-header">
    <span class="chat-panel-title">Chat</span>
    <button class="chat-panel-close" id="chat-close" title="Close">&times;</button>
  </div>
  <div class="chat-messages" id="chat-messages">
    <div class="chat-empty" id="chat-empty">No messages yet</div>
  </div>
  <div class="chat-waiting-indicator" id="chat-waiting">Waiting for your response...</div>
  <div class="chat-input-area">
    <textarea class="chat-input" id="chat-input" placeholder="Type a message..." rows="1"></textarea>
    <button class="chat-send-btn" id="chat-send">Send</button>
  </div>
</div>
```

Also add the script tag after the modal.js script tag (line 169):

```html
<script src="/js/chat.js"></script>
```

- [ ] **Step 2: Create chat.js**

Create `plugins/kanban-dashboard/public/js/chat.js`:

```javascript
//region Chat State

let chatMessages = [];
let chatPanelOpen = false;
let lastSeenId = 0;
let lastWaitingId = 0;
let notificationPermission = 'default';
let leaderName = 'The orchestrator';

//endregion

//region Notification

function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission().then(p => { notificationPermission = p; });
  }
}

function showNotification() {
  if (!('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;
  if (document.hasFocus() && chatPanelOpen) return;
  const n = new Notification(`${leaderName} needs your input`, {
    icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">💬</text></svg>',
  });
  n.onclick = () => {
    window.focus();
    openChatPanel();
    n.close();
  };
}

//endregion

//region Rendering

function renderChatMessages() {
  const container = document.getElementById('chat-messages');
  const empty = document.getElementById('chat-empty');
  if (chatMessages.length === 0) {
    empty.style.display = '';
    return;
  }
  empty.style.display = 'none';

  const html = chatMessages.map(m => {
    const cls = m.sender === 'agent' ? 'agent' : 'user';
    const waitCls = m.waiting && !m.answered ? ' waiting-question' : '';
    const time = m.timestamp ? new Date(m.timestamp).toLocaleTimeString() : '';
    return `<div class="chat-msg ${cls}${waitCls}">
      <div>${escapeHtml(m.text)}</div>
      <div class="chat-msg-time">${time}</div>
    </div>`;
  }).join('');
  container.innerHTML = html;
  container.scrollTop = container.scrollHeight;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function updateChatBadge() {
  const badge = document.getElementById('chat-badge');
  const unread = chatMessages.filter(m => m.id > lastSeenId).length;
  badge.textContent = chatPanelOpen ? '' : (unread > 0 ? String(unread) : '');
}

function updateWaitingState(waiting) {
  const bubble = document.getElementById('chat-bubble');
  const indicator = document.getElementById('chat-waiting');
  const input = document.getElementById('chat-input');

  if (waiting) {
    bubble.classList.add('waiting');
    indicator.classList.add('visible');
    input.classList.add('highlight');
  } else {
    bubble.classList.remove('waiting');
    indicator.classList.remove('visible');
    input.classList.remove('highlight');
  }
}

//endregion

//region Panel Controls

function openChatPanel() {
  chatPanelOpen = true;
  document.getElementById('chat-panel').classList.add('open');
  lastSeenId = chatMessages.length > 0 ? chatMessages[chatMessages.length - 1].id : 0;
  updateChatBadge();
  const input = document.getElementById('chat-input');
  input.focus();
  const container = document.getElementById('chat-messages');
  container.scrollTop = container.scrollHeight;
}

function closeChatPanel() {
  chatPanelOpen = false;
  document.getElementById('chat-panel').classList.remove('open');
}

//endregion

//region Send Message

async function sendChatMessage() {
  const input = document.getElementById('chat-input');
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  input.style.height = 'auto';

  try {
    await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    pollChat();
  } catch (e) {
    console.warn('[chat] Failed to send:', e);
  }
}

//endregion

//region Polling

async function pollChat() {
  try {
    const res = await fetch('/api/chat');
    const data = await res.json();

    if (data.messages) {
      const prevWaiting = chatMessages.filter(m => m.waiting && !m.answered);
      chatMessages = data.messages;
      renderChatMessages();
      updateChatBadge();
      updateWaitingState(data.waiting);

      // Check for new waiting message to trigger notification + auto-open
      if (data.waiting) {
        const currentWaiting = chatMessages.filter(m => m.waiting && !m.answered);
        const newestWaiting = currentWaiting[0]; // oldest unanswered
        if (newestWaiting && newestWaiting.id !== lastWaitingId) {
          lastWaitingId = newestWaiting.id;
          showNotification();
          if (!chatPanelOpen) openChatPanel();
        }
      }
    }

    // Update leader name from status config
    if (window._dashboardConfig && window._dashboardConfig.leader) {
      leaderName = window._dashboardConfig.leader;
    }
  } catch (e) {
    // Silently ignore — dashboard may not be ready
  }
}

//endregion

//region Event Listeners

document.getElementById('chat-bubble')?.addEventListener('click', () => {
  if (chatPanelOpen) closeChatPanel();
  else openChatPanel();
  requestNotificationPermission();
});

document.getElementById('chat-close')?.addEventListener('click', closeChatPanel);

document.getElementById('chat-send')?.addEventListener('click', sendChatMessage);

document.getElementById('chat-input')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendChatMessage();
  }
});

// Auto-resize textarea
document.getElementById('chat-input')?.addEventListener('input', (e) => {
  const el = e.target;
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 80) + 'px';
});

//endregion

// Poll on same interval as status
setInterval(pollChat, 1500);
pollChat();
```

- [ ] **Step 3: Expose dashboard config to chat.js**

In `plugins/kanban-dashboard/public/js/dashboard.js`, inside the `poll()` function, after the config handling block (after line 277 `metaEl.style.display = parts.length > 0 ? '' : 'none';`), add:

```javascript
      window._dashboardConfig = data.config;
```

This lets chat.js read the leader name from the dashboard config.

- [ ] **Step 4: Commit**

```bash
cd plugins/kanban-dashboard && git add public/js/chat.js public/js/dashboard.js public/index.html && git commit -m "feat(kanban): add chat bubble, panel, and notification UI"
```

---

### Task 6: Integration Test — Full Chat Flow

**Files:**
- Test: `plugins/kanban-dashboard/test/http-server.test.ts`

Depends on: Tasks 1, 3

This task adds an integration test that exercises the full flow: agent sends question via state, user answers via HTTP POST, then verifies state.

- [ ] **Step 1: Write integration test — full question-answer flow via HTTP**

In `test/http-server.test.ts`, add to the `POST /api/chat` describe block:

```typescript
  it("full flow: agent question -> user answer -> state reflects answered", async () => {
    // Agent sends question
    addChatMessage({ sender: "agent", text: "Which database?", waiting: true });

    // Verify GET shows waiting
    const before = await fetchJson(`${baseUrl}/api/chat`);
    expect(before.body.waiting).toBe(true);
    expect(before.body.pending_questions).toBe(1);

    // User answers
    const postRes = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "PostgreSQL" }),
    });
    const postBody = await postRes.json();
    expect(postBody.response_to).toBe(1);

    // Verify GET shows answered
    const after = await fetchJson(`${baseUrl}/api/chat`);
    expect(after.body.waiting).toBe(false);
    expect(after.body.pending_questions).toBe(0);
    expect(after.body.messages).toHaveLength(2);
    const question = after.body.messages[0];
    expect(question.waiting).toBe(true);
    expect(question.answered).toBe(true);
  });

  it("FIFO: answers questions in order", async () => {
    addChatMessage({ sender: "agent", text: "Q1?", waiting: true });
    addChatMessage({ sender: "agent", text: "Q2?", waiting: true });

    // First answer goes to Q1
    const res1 = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "A1" }),
    });
    const body1 = await res1.json();
    expect(body1.response_to).toBe(1);

    // Second answer goes to Q2
    const res2 = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "A2" }),
    });
    const body2 = await res2.json();
    expect(body2.response_to).toBe(2);

    // All answered
    const after = await fetchJson(`${baseUrl}/api/chat`);
    expect(after.body.waiting).toBe(false);
    expect(after.body.pending_questions).toBe(0);
  });
```

- [ ] **Step 2: Run test to verify it passes**

Run: `cd plugins/kanban-dashboard && npx vitest run test/http-server.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
cd plugins/kanban-dashboard && git add test/http-server.test.ts && git commit -m "test(kanban): add chat integration tests — full Q&A flow and FIFO ordering"
```

---

### Task 7: Run Full Test Suite and Build

**Files:** None (verification only)

Depends on: Tasks 1-6

- [ ] **Step 1: Run all unit tests**

Run: `cd plugins/kanban-dashboard && npx vitest run`
Expected: All tests PASS

- [ ] **Step 2: Run build**

Run: `cd plugins/kanban-dashboard && npm run build`
Expected: Clean build with no errors

- [ ] **Step 3: Bump version**

Update `plugins/kanban-dashboard/VERSION` to `1.6.0` and prepend a changelog entry to `plugins/kanban-dashboard/CHANGES`:

```
## 1.6.0

- Add bidirectional chat between orchestrator and user via dashboard
- New MCP tools: kanban_chat, kanban_chat_poll
- Floating chat bubble with browser notifications when input is needed
- FIFO question queue — multiple questions answered in order
- Free-form messaging — user can send messages anytime
```

- [ ] **Step 4: Final commit**

```bash
cd plugins/kanban-dashboard && git add VERSION CHANGES && git commit -m "chore(kanban): bump version to 1.6.0 — chat feature"
```
