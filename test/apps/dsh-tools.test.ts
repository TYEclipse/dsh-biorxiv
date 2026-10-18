import { describe, expect, it } from 'vitest'
import { MemoryCache } from '../../src/adapters/cache.ts'
import type { JsonClient } from '../../src/adapters/europepmc.ts'
import { buildTools } from '../../src/apps/dsh/tools.ts'

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

const detailsPayload = {
  collection: [{ doi: '10.1101/2026.01.01.000001', title: 'A preprint', authors: 'Doe J', date: '2026-01-01', version: '1', published: 'NA' }],
}

function client(): JsonClient {
  return {
    async getJson<T>(url: string): Promise<T> {
      if (url.includes('europepmc')) return searchPayload as T
      if (url.includes('crossref')) return { message: { 'container-title': [] } } as T
      if (url.includes('openalex')) return { is_retracted: false } as T
      if (url.includes('/na/json')) return detailsPayload as T
      return { collection: [] } as T
    },
  }
}

type ExecTool = { execute: (args: Record<string, unknown>) => Promise<any> }

function exec(tool: unknown): ExecTool {
  return tool as ExecTool
}

function tools() {
  return buildTools({ client: client(), cache: new MemoryCache() })
}

describe('buildTools', () => {
  it('registers exactly the five prefixed tools', () => {
    expect(Object.keys(tools())).toEqual([
      'biorxiv_search',
      'biorxiv_paper',
      'biorxiv_latest',
      'biorxiv_export',
      'biorxiv_digest',
    ])
  })

  it('returns a lossless success envelope with an empty error object', async () => {
    const result = await exec(tools().biorxiv_search).execute({ topic: 'protein language model', limit: 5 })
    expect(result.ok).toBe(true)
    expect(result.data.items).toHaveLength(1)
    expect(result.error).toEqual({ code: '', message: '', retryable: false, hint: '' })
    expect(result.meta.source).toEqual(['europepmc'])
    expect(JSON.stringify(result)).not.toContain('undefined')
  })

  it('returns a failure envelope with data {} and a stable code', async () => {
    const result = await exec(tools().biorxiv_search).execute({ topic: '   ' })
    expect(result.ok).toBe(false)
    expect(result.data).toEqual({})
    expect(result.error.code).toBe('E-001')
  })

  it('renders a compact search summary', async () => {
    const tool = tools().biorxiv_search as unknown as {
      output: { render: (args: unknown, value: unknown) => Array<{ type: string; text: string }> }
    }
    const result = await exec(tool).execute({ topic: 'protein language model', limit: 5 })
    const blocks = tool.output.render({ topic: 'protein language model' }, result)
    expect(blocks[0]?.type).toBe('text')
    expect(blocks[0]?.text).toContain('Protein language model')
  })
})
