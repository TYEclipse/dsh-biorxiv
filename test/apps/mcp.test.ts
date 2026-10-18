import { PassThrough } from 'node:stream'
import { describe, expect, it } from 'vitest'
import { MemoryCache } from '../../src/adapters/cache.ts'
import type { JsonClient } from '../../src/adapters/europepmc.ts'
import { buildTools, type ToolSet } from '../../src/apps/dsh/tools.ts'
import { handleMcpRequest, runMcpServer } from '../../src/apps/mcp/server.ts'

const searchPayload = {
  hitCount: 1,
  resultList: {
    result: [
      {
        doi: '10.1101/2026.01.01.000001',
        title: 'Protein language model',
        authorString: 'Doe J',
        firstPublicationDate: '2026-01-02',
        abstractText: 'A paper',
        citedByCount: 1,
        bookOrReportDetails: { publisher: 'bioRxiv' },
      },
    ],
  },
}

function tools() {
  const client: JsonClient = {
    async getJson<T>(url: string): Promise<T> {
      if (url.includes('europepmc')) return searchPayload as T
      return { collection: [] } as T
    },
  }
  return buildTools({ client, cache: new MemoryCache() })
}

describe('handleMcpRequest', () => {
  it('handles initialize', async () => {
    const response = await handleMcpRequest({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }, tools())
    expect(response).toMatchObject({
      jsonrpc: '2.0',
      id: 1,
      result: { protocolVersion: '2024-11-05', serverInfo: { name: 'dsh-biorxiv' } },
    })
  })

  it('lists all four tools with JSON schemas', async () => {
    const response = await handleMcpRequest({ jsonrpc: '2.0', id: 2, method: 'tools/list' }, tools())
    const result = response.result as { tools: Array<{ name: string; inputSchema: unknown }> }
    expect(result.tools.map((tool) => tool.name)).toEqual([
      'biorxiv_search',
      'biorxiv_paper',
      'biorxiv_latest',
      'biorxiv_export',
      'biorxiv_digest',
    ])
    expect(result.tools[0]?.inputSchema).toMatchObject({ type: 'object' })
  })

  it('calls a tool and returns text content', async () => {
    const response = await handleMcpRequest(
      {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: { name: 'biorxiv_search', arguments: { topic: 'protein language model', limit: 1 } },
      },
      tools(),
    )
    const result = response.result as { content: Array<{ type: string; text: string }>; isError: boolean; structuredContent: { ok: boolean } }
    expect(result.isError).toBe(false)
    expect(result.structuredContent.ok).toBe(true)
    expect(result.content[0]?.text).toContain('Protein language model')
  })

  it('returns JSON-RPC errors for unknown methods and tools', async () => {
    const method = await handleMcpRequest({ jsonrpc: '2.0', id: 4, method: 'nope' }, tools())
    expect(method.error?.code).toBe(-32601)
    const tool = await handleMcpRequest(
      { jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'nope', arguments: {} } },
      tools(),
    )
    expect(tool.error?.code).toBe(-32602)
  })

  it('ignores initialized notifications', async () => {
    expect(await handleMcpRequest({ jsonrpc: '2.0', method: 'notifications/initialized' }, tools())).toBeNull()
  })

  it('answers ping', async () => {
    const response = await handleMcpRequest({ jsonrpc: '2.0', id: 6, method: 'ping' }, tools())
    expect(response).toEqual({ jsonrpc: '2.0', id: 6, result: {} })
  })

  it('rejects invalid tools/call params', async () => {
    const response = await handleMcpRequest(
      { jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 42 } },
      tools(),
    )
    expect(response.error?.code).toBe(-32602)
  })

  it('turns a thrown tool error into an MCP error result', async () => {
    const failing = {
      biorxiv_search: {
        name: 'biorxiv_search',
        description: 'failing test tool',
        parameters: { type: 'object', properties: {}, required: [] },
        output: { render: () => [{ type: 'text', text: 'ignored' }] },
        execute: async () => {
          throw new Error('boom')
        },
      },
    } as unknown as ToolSet
    const response = await handleMcpRequest(
      { jsonrpc: '2.0', id: 8, method: 'tools/call', params: { name: 'biorxiv_search', arguments: {} } },
      failing,
    )
    const result = response.result as { isError: boolean; content: Array<{ text: string }> }
    expect(result.isError).toBe(true)
    expect(result.content[0]?.text).toBe('boom')
  })

  it('runs the stdio loop and reports parse errors', async () => {
    const input = new PassThrough()
    const output = new PassThrough()
    let buffer = ''
    output.on('data', (chunk) => {
      buffer += chunk.toString()
    })
    runMcpServer(tools(), input, output)
    input.write('not json\n')
    input.write(`${JSON.stringify({ jsonrpc: '2.0', id: 9, method: 'ping' })}\n`)
    input.end()
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(buffer).toContain('-32700')
    expect(buffer).toContain('"id":9')
  })
})
