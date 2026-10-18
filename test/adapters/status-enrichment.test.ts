import { describe, expect, it } from 'vitest'
import { enrichStatus, fetchCrossrefJournal, fetchOpenAlexRetraction } from '../../src/adapters/status-enrichment.ts'
import { HttpError } from '../../src/core/errors.ts'
import type { JsonClient } from '../../src/adapters/europepmc.ts'
import type { BiorxivDetail } from '../../src/core/status.ts'

function client(routes: Record<string, unknown>, urls?: string[]): JsonClient {
  return {
    async getJson<T>(url: string): Promise<T> {
      urls?.push(url)
      const key = Object.keys(routes).find((part) => url.includes(part))
      if (key === undefined) throw new HttpError(404)
      const value = routes[key]
      if (value instanceof Error) throw value
      return value as T
    },
  }
}

const detail: BiorxivDetail = {
  doi: '10.1101/2026.01.01.000001',
  title: 'A preprint',
  authors: 'Doe J',
  date: '2026-01-01',
  category: 'bioinformatics',
  abstract: '',
  server: 'bioRxiv',
  version: '2',
  published: '10.1234/journal.1',
}

describe('fetchCrossrefJournal', () => {
  it('reads the first container title', async () => {
    const urls: string[] = []
    const journal = await fetchCrossrefJournal(client({ 'api.crossref.org': { message: { 'container-title': ['Journal of Tests'] } } }, urls), '10.1234/journal.1')
    expect(journal).toBe('Journal of Tests')
    expect(urls[0]).toContain('10.1234/journal.1')
  })

  it('returns an empty string for missing, malformed or failed responses', async () => {
    expect(await fetchCrossrefJournal(client({ crossref: { message: {} } }), '10.1234/x')).toBe('')
    expect(await fetchCrossrefJournal(client({ crossref: { message: { 'container-title': [] } } }), '10.1234/x')).toBe('')
    expect(await fetchCrossrefJournal(client({ crossref: new HttpError(404) }), '10.1234/x')).toBe('')
  })
})

describe('fetchOpenAlexRetraction', () => {
  it('returns a boolean retraction flag', async () => {
    expect(await fetchOpenAlexRetraction(client({ 'api.openalex.org': { is_retracted: true } }), '10.1101/x')).toBe(true)
    expect(await fetchOpenAlexRetraction(client({ 'api.openalex.org': { is_retracted: false } }), '10.1101/x')).toBe(false)
  })

  it('returns null for unknown or failed responses', async () => {
    expect(await fetchOpenAlexRetraction(client({ 'api.openalex.org': {} }), '10.1101/x')).toBeNull()
    expect(await fetchOpenAlexRetraction(client({ 'api.openalex.org': new HttpError(404) }), '10.1101/x')).toBeNull()
  })
})

describe('enrichStatus', () => {
  it('combines version, journal and retraction without blocking on failures', async () => {
    const status = await enrichStatus(
      client({
        'api.crossref.org': { message: { 'container-title': ['Journal of Tests'] } },
        'api.openalex.org': { is_retracted: true },
      }),
      '10.1101/2026.01.01.000001',
      [detail],
    )
    expect(status).toMatchObject({
      doi: '10.1101/2026.01.01.000001',
      version: 2,
      versionsCount: 1,
      publishedDoi: '10.1234/journal.1',
      journal: 'Journal of Tests',
      retracted: true,
    })
  })

  it('keeps the status usable when both optional sources fail', async () => {
    const status = await enrichStatus(client({}), '10.1101/x', [detail])
    expect(status).toMatchObject({ journal: '', retracted: null, version: 2 })
  })

  it('returns null when there are no version details', async () => {
    expect(await enrichStatus(client({}), '10.1101/x', [])).toBeNull()
  })
})
