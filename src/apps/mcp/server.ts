/** Minimal MCP stdio server (JSON-RPC 2.0) with no extra runtime dependency. */

import { createInterface } from 'node:readline'
import { createRequire } from 'node:module'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import type { ToolSet } from '../dsh/tools.ts'

export const MCP_PROTOCOL_VERSION = '2024-11-05'
export const SERVER_NAME = 'dsh-biorxiv'

const require = createRequire(import.meta.url)
const packageJson = require('../../../package.json') as { version: string }
export const SERVER_VERSION = packageJson.version

export interface McpRequest {
  jsonrpc: '2.0'
  id?: string | number | null
  method: string
  params?: unknown
}

export interface McpResponse {
  jsonrpc: '2.0'
  id: string | number | null
  result?: unknown
  error?: { code: number; message: string }
}

function error(id: string | number | null, code: number, message: string): McpResponse {
  return { jsonrpc: '2.0', id, error: { code, message } }
}

function contentText(blocks: Array<{ type: string; text?: string }>): string {
  return blocks
    .filter((block) => block.type === 'text')
    .map((block) => block.text ?? '')
    .join('\n')
}

export async function handleMcpRequest(request: McpRequest, tools: ToolSet): Promise<McpResponse | null> {
  const id = request.id ?? null
  if (request.method === 'notifications/initialized') return null
  if (request.method === 'initialize') {
    return {
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
      },
    }
  }
  if (request.method === 'ping') return { jsonrpc: '2.0', id, result: {} }
  if (request.method === 'tools/list') {
    return {
      jsonrpc: '2.0',
      id,
      result: {
        tools: Object.values(tools).map((tool) => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.parameters,
        })),
      },
    }
  }
  if (request.method === 'tools/call') {
    const params = request.params as { name?: unknown; arguments?: unknown } | undefined
    if (params === null || typeof params !== 'object' || typeof params.name !== 'string') {
      return error(id, -32602, 'invalid tools/call params')
    }
    const tool = (tools as unknown as Record<string, ToolDefinition | undefined>)[params.name]
    if (tool === undefined) return error(id, -32602, `unknown tool: ${params.name}`)
    const args = params.arguments !== null && typeof params.arguments === 'object' ? params.arguments : {}
    try {
      const value = await (tool as unknown as { execute: (args: unknown) => Promise<unknown> }).execute(args)
      const blocks = tool.output.render(args as never, value as never)
      const text = contentText(blocks as Array<{ type: string; text?: string }>)
      const isError = Boolean((value as { ok?: boolean }).ok === false)
      return {
        jsonrpc: '2.0',
        id,
        result: { content: [{ type: 'text', text }], structuredContent: value, isError },
      }
    } catch (caught) {
      return {
        jsonrpc: '2.0',
        id,
        result: {
          content: [{ type: 'text', text: caught instanceof Error ? caught.message : 'tool failed' }],
          isError: true,
        },
      }
    }
  }
  return error(id, -32601, `method not found: ${request.method}`)
}

export function runMcpServer(
  tools: ToolSet,
  input: NodeJS.ReadableStream = process.stdin,
  output: NodeJS.WritableStream = process.stdout,
): void {
  const lines = createInterface({ input, crlfDelay: Infinity })
  lines.on('line', (line) => {
    void (async () => {
      let request: McpRequest
      try {
        request = JSON.parse(line) as McpRequest
      } catch {
        output.write(JSON.stringify(error(null, -32700, 'parse error')) + '\n')
        return
      }
      const response = await handleMcpRequest(request, tools)
      if (response !== null) output.write(JSON.stringify(response) + '\n')
    })()
  })
}
