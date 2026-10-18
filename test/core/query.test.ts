import { describe, expect, it } from 'vitest'
import { buildQuery, splitTerms } from '../../src/core/query.ts'

describe('splitTerms', () => {
  it('splits synonyms on the pipe and trims whitespace', () => {
    expect(splitTerms(' CRISPR screen | CRISPR screening ')).toEqual(['CRISPR screen', 'CRISPR screening'])
  })

  it('deduplicates case-insensitively while preserving the first spelling', () => {
    expect(splitTerms('Protein LM|protein lm|PROTEIN LM')).toEqual(['Protein LM'])
  })

  it('rejects an empty topic', () => {
    expect(() => splitTerms('   ')).toThrowError(/E-001/)
  })

  it('rejects a topic over 1000 characters', () => {
    expect(() => splitTerms('x'.repeat(1001))).toThrowError(/E-001/)
  })
})

describe('buildQuery', () => {
  it('builds a bioRxiv preprint query with date range', () => {
    const built = buildQuery({
      topic: 'protein language model',
      dateFrom: '2026-09-01',
      dateTo: '2026-09-30',
    })
    expect(built.query).toBe(
      '("protein language model") AND SRC:PPR AND PUBLISHER:"bioRxiv" AND FIRST_PDATE:[2026-09-01 TO 2026-09-30]',
    )
    expect(built.terms).toEqual(['protein language model'])
    expect(built.limit).toBe(20)
  })

  it('expands synonyms with OR and keeps the original terms', () => {
    const built = buildQuery({ topic: 'CRISPR screen|CRISPR screening', limit: 5 })
    expect(built.query).toContain('("CRISPR screen" OR "CRISPR screening")')
    expect(built.terms).toEqual(['CRISPR screen', 'CRISPR screening'])
    expect(built.limit).toBe(5)
  })

  it('supports title and abstract field restrictions', () => {
    expect(buildQuery({ topic: 'ripple', field: 'title' }).query).toContain('TITLE:"ripple"')
    expect(buildQuery({ topic: 'ripple', field: 'abstract' }).query).toContain('ABSTRACT:"ripple"')
  })

  it('supports author filtering', () => {
    const built = buildQuery({ topic: 'ripple', authors: ['Jane Doe', 'John Roe'] })
    expect(built.query).toContain('(AUTH:"Jane Doe" OR AUTH:"John Roe")')
  })

  it('does not add a date clause when no dates are given', () => {
    expect(buildQuery({ topic: 'ripple' }).query).not.toContain('FIRST_PDATE')
  })

  it('supports open-ended date ranges', () => {
    expect(buildQuery({ topic: 'ripple', dateFrom: '2026-09-01' }).query).toContain(
      'FIRST_PDATE:[2026-09-01 TO 3000-12-31]',
    )
    expect(buildQuery({ topic: 'ripple', dateTo: '2026-09-30' }).query).toContain(
      'FIRST_PDATE:[1900-01-01 TO 2026-09-30]',
    )
  })

  it('rejects invalid dates and inverted ranges', () => {
    expect(() => buildQuery({ topic: 'ripple', dateFrom: '2026-13-01' })).toThrowError(/E-001/)
    expect(() => buildQuery({ topic: 'ripple', dateFrom: '2026-09-02', dateTo: '2026-09-01' })).toThrowError(/E-001/)
  })

  it('rejects limits outside 1..100 and non-integers', () => {
    expect(() => buildQuery({ topic: 'ripple', limit: 0 })).toThrowError(/E-001/)
    expect(() => buildQuery({ topic: 'ripple', limit: 101 })).toThrowError(/E-001/)
    expect(() => buildQuery({ topic: 'ripple', limit: 2.5 })).toThrowError(/E-001/)
  })

  it('strips embedded double quotes so the query cannot break out', () => {
    const built = buildQuery({ topic: 'he said "hello"' })
    expect(built.query).toBe('("he said hello") AND SRC:PPR AND PUBLISHER:"bioRxiv"')
  })

  it('limits synonyms to 8 and rejects more', () => {
    const nine = Array.from({ length: 9 }, (_, i) => `term${i}`).join('|')
    expect(() => buildQuery({ topic: nine })).toThrowError(/E-001/)
  })
})
