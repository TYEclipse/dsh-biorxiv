import { describe, expect, it } from 'vitest'
import { fetchBiorxivDetails, fetchLatestBiorxiv } from '../../src/adapters/biorxiv.ts'
import type { JsonClient } from '../../src/adapters/europepmc.ts'

function fakeClient(payload: unknown, urls?: string[]): JsonClient {
  return {
    async getJson<T>(url: string): Promise<T> {
      urls?.push(url)
      return (typeof payload === 'function' ? (payload as (u: string) => unknown)(url) : payload) as T
    },
  }
}

describe('fetchBiorxivDetails', () => {
  it('returns normalized version records and keeps the DOI path readable', async () => {
    const urls: string[] = []
    const details = await fetchBiorxivDetails(
      fakeClient(
        {
          collection: [
            {
              doi: '10.1101/2026.01.01.000001',
              title: 'A preprint',
              authors: 'Doe J',
              date: '2026-01-02',
              category: 'bioinformatics',
              abstract: 'An abstract',
              server: 'bioRxiv',
              version: '1',
              published: 'NA',
            },
          ],
        },
        urls,
      ),
      '10.1101/2026.01.01.000001',
    )
    expect(details).toHaveLength(1)
    expect(details[0]).toMatchObject({ version: '1', title: 'A preprint', published: 'NA' })
    expect(urls[0]).toContain('10.1101/2026.01.01.000001')
    expect(urls[0]).not.toContain('%2F')
  })

  it('returns an empty array when the collection is empty', async () => {
    expect(await fetchBiorxivDetails(fakeClient({ collection: [] }), '10.1101/x')).toEqual([])
  })

  it('throws on a malformed payload and rejects an empty DOI', async () => {
    await expect(fetchBiorxivDetails(fakeClient({}), '10.1101/x')).rejects.toBeInstanceOf(SyntaxError)
    await expect(fetchBiorxivDetails(fakeClient({ collection: [] }), '')).rejects.toThrowError(/E-001/)
  })
})

function latestRecord(index: number): Record<string, string> {
  return {
    doi: `10.1101/2026.01.${String(index + 1).padStart(2, '0')}.00000${index}`,
    title: `Paper ${index}`,
    authors: 'Doe J',
    date: '2026-10-18',
    category: 'neuroscience',
    version: '1',
  }
}

describe('fetchLatestBiorxiv', () => {
  it('uses a deterministic date window and category filter', async () => {
    const urls: string[] = []
    const items = await fetchLatestBiorxiv(fakeClient({ collection: [latestRecord(0)] }, urls), {
      days: 2,
      limit: 10,
      category: 'neuroscience',
      today: new Date('2026-10-18T12:00:00Z'),
    })
    expect(items).toHaveLength(1)
    expect(urls[0]).toContain('/2026-10-16/2026-10-18/0')
    expect(urls[0]).toContain('category=neuroscience')
  })

  it('paginates until the limit is reached', async () => {
    const urls: string[] = []
    const pages = [
      { collection: Array.from({ length: 30 }, (_, i) => latestRecord(i)) },
      { collection: Array.from({ length: 5 }, (_, i) => latestRecord(30 + i)) },
    ]
    const client = fakeClient((url: string) => pages[url.includes('/30') ? 1 : 0], urls)
    const items = await fetchLatestBiorxiv(client, {
      days: 1,
      limit: 35,
      today: new Date('2026-10-18T00:00:00Z'),
    })
    expect(items).toHaveLength(35)
    expect(urls).toHaveLength(2)
    expect(urls[1]).toContain('/30')
  })

  it('stops on an empty page and skips records without a DOI', async () => {
    const items = await fetchLatestBiorxiv(
      fakeClient({ collection: [{ title: 'no doi' }, latestRecord(0)] }),
      { days: 1, limit: 10, today: new Date('2026-10-18T00:00:00Z') },
    )
    expect(items).toHaveLength(1)
    expect(items[0]?.doi).toContain('10.1101/')
  })

  it('throws on a malformed latest payload', async () => {
    await expect(
      fetchLatestBiorxiv(fakeClient({}), { days: 1, limit: 10, today: new Date('2026-10-18T00:00:00Z') }),
    ).rejects.toBeInstanceOf(SyntaxError)
  })
})
