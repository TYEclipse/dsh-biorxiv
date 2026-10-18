#!/usr/bin/env node
/** MCP stdio entrypoint: dsh-biorxiv-mcp. */
import { buildTools } from "../dsh/tools.js";
import { createDeps } from "../../index.js";
import { runMcpServer } from "./server.js";
runMcpServer(buildTools(createDeps({ summaryEnabled: process.env.DSH_BIORXIV_SUMMARY === '1' })));
//# sourceMappingURL=main.js.map