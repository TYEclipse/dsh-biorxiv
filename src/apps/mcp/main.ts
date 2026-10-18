#!/usr/bin/env node
/** MCP stdio entrypoint: dsh-biorxiv-mcp. */

import { buildTools } from '../dsh/tools.ts'
import { createDeps } from '../../index.ts'
import { runMcpServer } from './server.ts'

runMcpServer(buildTools(createDeps({ summaryEnabled: process.env.DSH_BIORXIV_SUMMARY === '1' })))
