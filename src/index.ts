#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerTools } from "./server.js";
import { loadConfig } from "./config.js";
import { logger } from "./utils/logger.js";

// Single source of truth for the version  -  read from package.json so the
// advertised MCP version can never drift from the package again.
const pkg = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "package.json"), "utf-8")
) as { version: string };

const config = loadConfig();

const server = new McpServer({
  name: "enfusion-mcp",
  version: pkg.version,
});

registerTools(server, config);

const transport = new StdioServerTransport();
await server.connect(transport);
logger.info("enfusion-mcp server started");
