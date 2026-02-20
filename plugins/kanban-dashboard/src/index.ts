import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerTools } from './tools.js';
import { stopServer } from './http-server.js';
import { reset } from './state.js';

const server = new McpServer({
  name: 'kanban-dashboard',
  version: '1.3.0',
});

async function cleanup() {
  await stopServer();
  reset();
  process.exit(0);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

async function main() {
  registerTools(server);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
