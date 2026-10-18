import { describe, expect, it } from 'vitest'
import { buildStatus, pickLatestVersion, type BiorxivDetail } from '../../src/core/status.ts'

function detail(overrides: Partial<BiorxivDetail> = {}): BiorxivDetail {
  return {
    doi: '10.1101/2026.01.01.000001',
    title: 'A preprint',
    authors: 'A. Author',
    date: '2026-01-01',
    category: 'bioinformatics',
    abstract: '',
    server: 'bioRxiv',
    version: '1',
    published: 'NA',
    ...overrides,
  }
}

describe('pickLatestVersion', () => {
  it('picks the numerically highest version and counts all versions', () => {
    const picked = pickLatestVersion([
      detail({ version: '1' }),
      detail({ version: '10', published: '10.1234/journal.1' }),
      detail({ version: '2' }),
    ])
    expect(picked?.detail.version).toBe('10')
    expect(picked?.versionsCount).toBe(3)
  })

  it('treats a missing or malformed version as 1', () => {
    expect(pickLatestVersion([detail({ version: undefined })])?.detail.version).toBeUndefined()
    expect(pickLatestVersion([detail({ version: 'abc' })])?.version).toBe(1)
    expect(pickLatestVersion([])).toBeNull()
  })
})

describe('buildStatus', () => {
  it('builds a published status with journal and retraction flag', () => {
    const status = buildStatus('10.1101/2026.01.01.000001', [detail({ version: '1' }), detail({ version: '2', published: '10.1234/journal.1' })], {
      journal: 'Journal of Tests',
      retracted: false,
    })
    expect(status).toEqual({
      doi: '10.1101/2026.01.01.000001',
      version: 2,
      versionsCount: 2,
      publishedDoi: '10.1234/journal.1',
      journal: 'Journal of Tests',
      retracted: false,
    })
  })

  it('normalizes NA and empty published values to an empty string', () => {
    expect(buildStatus('10.1101/x', [detail({ published: 'NA' })])?.publishedDoi).toBe('')
    expect(buildStatus('10.1101/x', [detail({ published: '' })])?.publishedDoi).toBe('')
  })

  it('keeps unknown retraction as null, not false', () => {
    expect(buildStatus('10.1101/x', [detail()])?.retracted).toBeNull()
    expect(buildStatus('10.1101/x', [detail()], { retracted: true })?.retracted).toBe(true)
  })

  it('returns null when there are no details', () => {
    expect(buildStatus('10.1101/x', [])).toBeNull()
  })

  it('uses the requested DOI rather than trusting a mismatched upstream field', () => {
    const status = buildStatus('10.1101/requested', [detail({ doi: '10.1101/other' })])
    expect(status?.doi).toBe('10.1101/requested')
  })
})
