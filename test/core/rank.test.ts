import { describe, expect, it } from 'vitest'
import { dedupePapers, normalizeDoi, rankPapers, relevanceScore } from '../../src/core/rank.ts'
import type { Paper } from '../../src/core/types.ts'

function paper(overrides: Partial<Paper> = {}): Paper {
  return {
    doi: '10.1101/2026.01.01.000001',
    title: 'A paper',
    authors: 'A. Author',
    date: '2026-01-01',
    abstract: '',
    cited: 0,
    category: 'bioinformatics',
    server: 'bioRxiv',
    ...overrides,
  }
}

describe('normalizeDoi', () => {
  it('normalizes DOI URLs, prefixes and case', () => {
    expect(normalizeDoi('https://doi.org/10.1101/ABC')).toBe('10.1101/abc')
    expect(normalizeDoi('doi: 10.64898/XyZ')).toBe('10.64898/xyz')
    expect(normalizeDoi(' 10.1101/ABC ')).toBe('10.1101/abc')
  })
})

describe('relevanceScore', () => {
  it('gives 3 for a title hit, 2 for an early abstract hit, and caps term frequency at 3', () => {
    expect(relevanceScore(paper({ title: 'protein language model', abstract: '' }), ['protein language model'])).toBe(3)
    expect(relevanceScore(paper({ title: 'other', abstract: 'protein language model appears early' }), ['protein language model'])).toBe(3)
    expect(
      relevanceScore(
        paper({ title: 'other', abstract: 'protein language model '.repeat(10) }),
        ['protein language model'],
      ),
    ).toBe(2 + 3)
  })

  it('does not award abstract points for a late-only mention', () => {
    const late = 'x'.repeat(400) + 'protein language model'
    expect(relevanceScore(paper({ title: 'other', abstract: late }), ['protein language model'])).toBe(1)
  })

  it('is case-insensitive', () => {
    expect(relevanceScore(paper({ title: 'PROTEIN LANGUAGE MODEL' }), ['protein language model'])).toBe(3)
  })

  it('returns 0 when there are no terms', () => {
    expect(relevanceScore(paper({ title: 'protein language model' }), [])).toBe(0)
  })
})

describe('rankPapers', () => {
  it('sorts by score, then citations, then date descending', () => {
    const papers = [
      paper({ doi: '10.1101/a', title: 'protein language model', cited: 1, date: '2026-01-01' }),
      paper({ doi: '10.1101/b', title: 'other', abstract: 'protein language model early', cited: 9, date: '2026-02-01' }),
      paper({ doi: '10.1101/c', title: 'protein language model', cited: 9, date: '2026-03-01' }),
    ]
    const ranked = rankPapers(papers, ['protein language model'])
    expect(ranked.map((p) => p.doi)).toEqual(['10.1101/c', '10.1101/b', '10.1101/a'])
  })

  it('deduplicates by normalized DOI and keeps the higher-scored copy', () => {
    const papers = [
      paper({ doi: '10.1101/abc', title: 'other', abstract: `${'x'.repeat(400)}protein language model`, cited: 1 }),
      paper({ doi: 'https://doi.org/10.1101/ABC', title: 'protein language model', cited: 0 }),
    ]
    const ranked = rankPapers(papers, ['protein language model'])
    expect(ranked).toHaveLength(1)
    expect(ranked[0]?.doi).toBe('https://doi.org/10.1101/ABC')
    expect(ranked[0]?.score).toBe(3)
  })

  it('does not mutate input objects', () => {
    const input = [paper({ title: 'protein language model' })]
    rankPapers(input, ['protein language model'])
    expect(input[0]?.score).toBeUndefined()
  })

  it('breaks a complete tie by DOI ascending', () => {
    const ranked = rankPapers(
      [paper({ doi: '10.1101/b', title: 'x' }), paper({ doi: '10.1101/a', title: 'x' })],
      ['x'],
    )
    expect(ranked.map((p) => p.doi)).toEqual(['10.1101/a', '10.1101/b'])
  })

  it('handles an empty list and empty terms', () => {
    expect(rankPapers([], ['x'])).toEqual([])
    expect(rankPapers([paper({ cited: 2 }), paper({ doi: '10.1101/z', cited: 5 })], [])).toHaveLength(2)
  })
})

describe('dedupePapers', () => {
  it('keeps the first copy when scores are equal and preserves order', () => {
    const a = paper({ doi: '10.1101/a', score: 2 })
    const b = paper({ doi: 'https://doi.org/10.1101/A', score: 2 })
    expect(dedupePapers([a, b]).map((p) => p.doi)).toEqual(['10.1101/a'])
  })

  it('keeps a higher-scored copy even when it appears later', () => {
    const a = paper({ doi: '10.1101/a', score: 1 })
    const b = paper({ doi: '10.1101/A', score: 5 })
    expect(dedupePapers([a, b])[0]?.score).toBe(5)
  })
})
