import { describe, it, expect, beforeEach, vi } from "vitest";
import { registerTools } from "./tools.js";
import { getState, getProjectDir, reset } from "./state.js";

type ToolHandler = (args: Record<string, unknown>) => Promise<unknown>;

interface RegisteredTool {
  name: string;
  description: string;
  schema: Record<string, unknown>;
  handler: ToolHandler;
}

function createMockServer(): { server: any; tools: Map<string, RegisteredTool> } {
  const tools = new Map<string, RegisteredTool>();
  const server = {
    tool: (name: string, description: string, schema: Record<string, unknown>, handler: ToolHandler) => {
      tools.set(name, { name, description, schema, handler });
    },
  };
  return { server, tools };
}

describe("kanban_init tool - project_dir parameter", () => {
  let tools: Map<string, RegisteredTool>;
  let mockServer: any;

  beforeEach(() => {
    reset();
    const mock = createMockServer();
    mockServer = mock.server;
    tools = mock.tools;
    registerTools(mockServer);
  });

  it("passes project_dir to initDashboard when provided", async () => {
    const handler = tools.get("kanban_init")!.handler;

    await handler({
      title: "Test Dashboard",
      subtitle: "Test Subtitle",
      tasks: [],
      port: 0,
      open_browser: false,
      project_dir: "/my/project/path",
    });

    expect(getProjectDir()).toBe("/my/project/path");
  });

  it("works without project_dir (backward compatibility)", async () => {
    const handler = tools.get("kanban_init")!.handler;

    await handler({
      title: "Test Dashboard",
      subtitle: "Test Subtitle",
      tasks: [],
      port: 0,
      open_browser: false,
    });

    expect(getProjectDir()).toBeUndefined();
  });

  it("stores project_dir in dashboard config accessible via getState", async () => {
    const handler = tools.get("kanban_init")!.handler;

    await handler({
      title: "Test Dashboard",
      subtitle: "",
      tasks: [],
      port: 0,
      open_browser: false,
      project_dir: "/some/repo",
    });

    const state = getState();
    expect(state.config.project_dir).toBe("/some/repo");
  });
});
