import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { resolve } from "node:path";
import { VERSION } from "./core/constants.js";
import { IOAYN_TOOLS } from "./core/tools.js";
import { createStore } from "./core/workspace.js";

const rootDir = resolve(process.env.IOAYN_PROJECT_DIR || process.cwd());
const store = createStore(rootDir);

const server = new McpServer({ name: "ioayn", version: VERSION });

for (const tool of IOAYN_TOOLS) {
  server.registerTool(
    tool.name,
    { title: tool.title, description: tool.description, inputSchema: tool.inputSchema },
    async (input) => tool.execute(input, store) as never,
  );
}

const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`IOAYN MCP ${VERSION} connected for ${store.canonicalRoot}`);
