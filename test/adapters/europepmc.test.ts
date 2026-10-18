import { describe, expect, it } from 'vitest'
import { searchEuropePmc, stripHtml, type JsonClient } from '../../src/adapters/europepmc.ts'
import type { BuiltQuery } from '../../src/core/query.ts'

const built: BuiltQuery = {
  query: '("protein language model") AND SRC:PPR AND PUBLISHER:"bioRxiv"',
  terms: ['protein language model'],
  limit: 5,
}

function fakeClient(payload: unknown, capture?: { url?: string }): JsonClient {
  return {
    async getJson<T>(url: string): Promise<T> {
      if (capture !== undefined) capture.url = url
      return payload as T
    },
  }
}

describe('stripHtml', () => {
  it('removes tags and decodes common entities', () => {
    expect(stripHtml('<h4>Background</h4><p>Tom &amp; Jerry &lt;3</p>')).toBe('Background Tom & Jerry <3')
  })
})

describe('searchEuropePmc', () => {
  it('normalizes Europe PMC results into Paper objects', async () => {
    const capture: { url?: string } = {}
    const client = fakeClient(
      {
        hitCount: 2,
        resultList: {
          result: [
            {
              doi: '10.1101/2026.01.01.000001',
              title: 'A preprint',
              authorString: 'Doe J, Roe R',
              firstPublicationDate: '2026-01-02',
              abstractText: '<h4>Abstract</h4><p>Useful &amp; relevant</p>',
              citedByCount: 4,
              bookOrReportDetails: { publisher: 'bioRxiv' },
            },
            {
              doi: '10.64898/2026.02.02.000002',
              title: 'Another preprint',
              authorString: 'Smith A',
              firstPublicationDate: '2026-02-03',
              citedByCount: '7',
            },
          ],
        },
      },
      capture,
    )

    const data = await searchEuropePmc(client, built)
    expect(data.hitCount).toBe(2)
    expect(data.query).toBe(built.query)
    expect(data.items).toHaveLength(2)
    expect(data.items[0]).toMatchObject({
      doi: '10.1101/2026.01.01.000001',
      title: 'A preprint',
      authors: 'Doe J, Roe R',
      date: '2026-01-02',
      abstract: 'Abstract Useful & relevant',
      cited: 4,
      server: 'bioRxiv',
      url: 'https://doi.org/10.1101/2026.01.01.000001',
    })
    expect(data.items[1]?.cited).toBe(7)
    expect(data.items[1]?.server).toBe('bioRxiv')
    expect(data.items[1]?.abstract).toBe('')
  })

  it('requests a wider candidate window and caps page size at 100', async () => {
    const capture: { url?: string } = {}
    const data = await searchEuropePmc(fakeClient({ hitCount: 0, resultList: { result: [] } }, capture), {
      ...built,
      limit: 40,
    })
    expect(data.items).toEqual([])
    const url = new URL(capture.url ?? '')
    expect(url.searchParams.get('pageSize')).toBe('100')
    expect(url.searchParams.get('format')).toBe('json')
    expect(url.searchParams.get('resultType')).toBe('core')
  })

  it('skips results without a DOI instead of inventing one', async () => {
    const data = await searchEuropePmc(
      fakeClient({
        hitCount: 2,
        resultList: { result: [{ title: 'no doi' }, { doi: '10.1101/x', title: 'has doi' }] },
      }),
      built,
    )
    expect(data.items).toHaveLength(1)
    expect(data.items[0]?.doi).toBe('10.1101/x')
  })

  it('returns an empty list when the result set is empty', async () => {
    const data = await searchEuropePmc(fakeClient({ hitCount: 0, resultList: { result: [] } }), built)
    expect(data).toEqual({ query: built.query, hitCount: 0, items: [] })
  })

  it('throws a parse error for a malformed payload', async () => {
    await expect(searchEuropePmc(fakeClient({ hitCount: 1 }), built)).rejects.toBeInstanceOf(SyntaxError)
    await expect(searchEuropePmc(fakeClient({ resultList: { result: [] } }), built)).rejects.toBeInstanceOf(SyntaxError)
  })
})
