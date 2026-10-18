import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { MemoryCache, type CacheStore } from '../../src/adapters/cache.ts'
import type { JsonClient } from '../../src/adapters/europepmc.ts'
import { exportTool, latestTool, paperTool, searchTool } from '../../src/core/service.ts'

interface FakeRoutes {
  search?: unknown
  details?: unknown
  latest?: unknown
  crossref?: unknown
  openalex?: unknown
  fail?: boolean
}

function fakeClient(routes: FakeRoutes, calls?: string[]): JsonClient {
  return {
    async getJson<T>(url: string): Promise<T> {
      calls?.push(url)
      if (routes.fail === true) throw new Error('offline')
      if (url.includes('europepmc')) return routes.search as T
      if (url.includes('crossref')) return routes.crossref as T
      if (url.includes('openalex')) return routes.openalex as T
      if (url.includes('api.biorxiv.org/details/biorxiv')) {
        if (url.includes('/na/json')) return routes.details as T
        return routes.latest as T
      }
      throw new Error(`unexpected URL ${url}`)
    },
  }
}

const searchPayload = {
  hitCount: 1,
  resultList: {
    result: [
      {
        doi: '10.1101/2026.01.01.000001',
        title: 'Protein language model',
        authorString: 'Doe J',
        firstPublicationDate: '2026-01-02',
        abstractText: 'A protein language model paper',
        citedByCount: 3,
        bookOrReportDetails: { publisher: 'bioRxiv' },
      },
    ],
  },
}

const detailsPayload = {
  collection: [
    { doi: '10.1101/2026.01.01.000001', title: 'v1', authors: 'Doe J', date: '2026-01-01', version: '1', published: 'NA' },
    { doi: '10.1101/2026.01.01.000001', title: 'v2', authors: 'Doe J', date: '2026-01-02', version: '2', published: '10.1234/journal.1' },
  ],
}

const latestPayload = {
  collection: [
    { doi: '10.1101/2026.02.01.000002', title: 'Latest', authors: 'Roe R', date: '2026-02-01', category: 'neuroscience', version: '1' },
  ],
}

function deps(routes: FakeRoutes, calls?: string[]) {
  return { client: fakeClient(routes, calls), cache: new MemoryCache() }
}

describe('searchTool', () => {
  it('returns ranked results and uses the cache on the second call', async () => {
    const calls: string[] = []
    const d = deps({ search: searchPayload }, calls)
    const first = await searchTool(d, { topic: 'protein language model', limit: 5 })
    expect(first.ok).toBe(true)
    if (first.ok) {
      expect(first.data.query).toContain('SRC:PPR')
      expect(first.data.items).toHaveLength(1)
      expect(first.data.items[0]?.score).toBeGreaterThan(0)
      expect(first.meta.cached).toBe(false)
    }
    const second = await searchTool(d, { topic: 'protein language model', limit: 5 })
    expect(second.ok).toBe(true)
    if (second.ok) expect(second.meta.cached).toBe(true)
    expect(calls.filter((url) => url.includes('europepmc'))).toHaveLength(1)
  })

  it('returns E-001 for an empty topic and E-005 for an upstream failure', async () => {
    const empty = await searchTool(deps({ search: searchPayload }), { topic: '  ' })
    expect(empty.ok).toBe(false)
    if (!empty.ok) expect(empty.error.code).toBe('E-001')

    const failed = await searchTool(deps({ fail: true }), { topic: 'ripple' })
    expect(failed.ok).toBe(false)
    if (!failed.ok) expect(failed.error.code).toBe('E-010')
  })

  it('still returns results when the cache is unavailable', async () => {
    const failing: CacheStore = {
      async get() {
        throw new Error('cache get failed')
      },
      async set() {
        throw new Error('cache set failed')
      },
      async delete() {},
      async clear() {},
      async close() {},
    }
    const result = await searchTool({ client: fakeClient({ search: searchPayload }), cache: failing }, { topic: 'protein language model' })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data.items).toHaveLength(1)
  })

  it('filters low-confidence matches by default and allows minScore=0', async () => {
    const payload = {
      hitCount: 2,
      resultList: {
        result: [
          { doi: '10.1101/high', title: 'Protein language model', abstractText: 'core topic' },
          { doi: '10.1101/low', title: 'Unrelated paper', abstractText: `${'x'.repeat(400)}mentions protein language model once` },
        ],
      },
    }
    const strict = await searchTool(deps({ search: payload }), { topic: 'protein language model' })
    expect(strict.ok).toBe(true)
    if (strict.ok) expect(strict.data.items.map((item) => item.doi)).toEqual(['10.1101/high'])

    const broad = await searchTool(deps({ search: payload }), { topic: 'protein language model', minScore: 0 })
    expect(broad.ok).toBe(true)
    if (broad.ok) expect(broad.data.items).toHaveLength(2)

    const invalid = await searchTool(deps({ search: payload }), { topic: 'protein language model', minScore: 11 })
    expect(invalid.ok).toBe(false)
    if (!invalid.ok) expect(invalid.error.code).toBe('E-001')
  })
})

describe('paperTool', () => {
  it('combines versions, journal and retraction', async () => {
    const result = await paperTool(
      deps({
        details: detailsPayload,
        crossref: { message: { 'container-title': ['Journal of Tests'] } },
        openalex: { is_retracted: true },
      }),
      { doi: 'https://doi.org/10.1101/2026.01.01.000001' },
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data).toMatchObject({
        doi: '10.1101/2026.01.01.000001',
        title: 'v2',
        version: 2,
        versionsCount: 2,
        publishedDoi: '10.1234/journal.1',
        journal: 'Journal of Tests',
        retracted: true,
      })
    }
  })

  it('returns E-001 for a bad DOI and E-002 when no versions exist', async () => {
    const bad = await paperTool(deps({ details: detailsPayload }), { doi: 'not-a-doi' })
    expect(bad.ok).toBe(false)
    if (!bad.ok) expect(bad.error.code).toBe('E-001')

    const missing = await paperTool(deps({ details: { collection: [] } }), { doi: '10.1101/x' })
    expect(missing.ok).toBe(false)
    if (!missing.ok) expect(missing.error.code).toBe('E-002')
  })
})

describe('latestTool', () => {
  it('returns latest papers and validates the window', async () => {
    const result = await latestTool(deps({ latest: latestPayload }), { days: 2, limit: 10 })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.items).toHaveLength(1)
      expect(result.data.items[0]?.title).toBe('Latest')
    }
    const bad = await latestTool(deps({ latest: latestPayload }), { days: 0, limit: 10 })
    expect(bad.ok).toBe(false)
    if (!bad.ok) expect(bad.error.code).toBe('E-001')
  })
})

describe('exportTool', () => {
  it('exports query results as JSON without writing a file', async () => {
    const result = await exportTool(deps({ search: searchPayload }), {
      query: 'protein language model',
      format: 'json',
      limit: 5,
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.format).toBe('json')
      expect(result.data.count).toBe(1)
      expect(result.data.path).toBe('')
      expect(JSON.parse(result.data.content)).toHaveLength(1)
    }
  })

  it('exports a single DOI as BibTeX', async () => {
    const result = await exportTool(
      deps({ details: detailsPayload, crossref: { message: { 'container-title': ['Journal'] } }, openalex: { is_retracted: false } }),
      { doi: '10.1101/2026.01.01.000001', format: 'bibtex' },
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.count).toBe(1)
      expect(result.data.content).toContain('@misc{')
    }
  })

  it('rejects an unknown format and a missing query/DOI', async () => {
    const bad = await exportTool(deps({ search: searchPayload }), { query: 'x', format: 'xml' as never })
    expect(bad.ok).toBe(false)
    if (!bad.ok) expect(bad.error.code).toBe('E-001')
    const missing = await exportTool(deps({ search: searchPayload }), { format: 'json' })
    expect(missing.ok).toBe(false)
    if (!missing.ok) expect(missing.error.code).toBe('E-001')
  })

  it('writes an output file inside cwd and refuses an unforced overwrite', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'dsh-biorxiv-export-'))
    try {
      const first = await exportTool(
        { ...deps({ search: searchPayload }), cwd },
        { query: 'protein language model', format: 'json', limit: 5, out: 'refs.json' },
      )
      expect(first.ok).toBe(true)
      if (first.ok) {
        expect(first.data.path).toBe(join(cwd, 'refs.json'))
        expect(JSON.parse(await readFile(first.data.path, 'utf8'))).toHaveLength(1)
      }
      const second = await exportTool(
        { ...deps({ search: searchPayload }), cwd },
        { query: 'protein language model', format: 'json', limit: 5, out: 'refs.json' },
      )
      expect(second.ok).toBe(false)
      if (!second.ok) expect(second.error.code).toBe('E-009')
    } finally {
      await rm(cwd, { recursive: true, force: true })
    }
  })
})
