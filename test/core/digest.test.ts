import { describe, expect, it } from 'vitest'
import { MemoryCache } from '../../src/adapters/cache.ts'
import type { JsonClient } from '../../src/adapters/europepmc.ts'
import { digestTool } from '../../src/core/digest.ts'

const payload = {
  hitCount: 1,
  resultList: {
    result: [
      {
        doi: '10.1101/2026.01.01.000001',
        title: 'Protein language model',
        authorString: 'Doe J',
        firstPublicationDate: '2026-01-02',
        abstractText: 'A useful paper',
        citedByCount: 3,
        bookOrReportDetails: { publisher: 'bioRxiv' },
      },
    ],
  },
}

function deps() {
  const client: JsonClient = {
    async getJson<T>(): Promise<T> {
      return payload as T
    },
  }
  return { client, cache: new MemoryCache(), now: () => 1_700_000_000_000 }
}

describe('digestTool', () => {
  it('builds a markdown digest with title, date and DOI', async () => {
    const result = await digestTool(deps(), { topic: 'protein language model', limit: 5 })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.count).toBe(1)
      expect(result.data.markdown).toContain('# bioRxiv digest')
      expect(result.data.markdown).toContain('Protein language model')
      expect(result.data.markdown).toContain('10.1101/2026.01.01.000001')
      expect(result.data.items[0]?.title).toBe('Protein language model')
    }
  })

  it('handles an empty result set without inventing entries', async () => {
    const empty: JsonClient = { async getJson<T>(): Promise<T> { return { hitCount: 0, resultList: { result: [] } } as T } }
    const result = await digestTool({ client: empty, cache: new MemoryCache(), now: () => 1_700_000_000_000 }, { topic: 'nothing' })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.count).toBe(0)
      expect(result.data.markdown).toContain('No results')
    }
  })

  it('rejects an empty topic', async () => {
    const result = await digestTool(deps(), { topic: '  ' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('E-001')
  })

  it('adds opt-in Chinese summaries when a provider is configured', async () => {
    const summarizer = {
      name: 'fake',
      async summarize(): Promise<string> {
        return '中文要点：这是一篇蛋白质语言模型论文。'
      },
    }
    const result = await digestTool({ ...deps(), summarizer }, { topic: 'protein language model', limit: 5, summary: true })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.items[0]?.summary).toContain('中文要点')
      expect(result.data.markdown).toContain('中文要点')
      expect(result.meta.warnings).toEqual([])
    }
  })

  it('keeps the digest usable when summary is requested without a provider', async () => {
    const result = await digestTool(deps(), { topic: 'protein language model', summary: true })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.items[0]?.summary).toBeUndefined()
      expect(result.meta.warnings.join(' ')).toContain('summary provider')
    }
  })

  it('keeps the digest usable when the summary provider fails', async () => {
    const summarizer = {
      name: 'broken',
      async summarize(): Promise<string> {
        throw new Error('upstream down')
      },
    }
    const result = await digestTool({ ...deps(), summarizer }, { topic: 'protein language model', summary: true })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.items[0]?.summary).toBeUndefined()
      expect(result.meta.warnings.join(' ')).toContain('summary failed')
    }
  })
})
