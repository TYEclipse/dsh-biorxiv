import { describe, expect, it } from 'vitest'
import { exportPapers, toBibtex, toCsv, toMarkdown } from '../../src/core/export.ts'
import type { Paper } from '../../src/core/types.ts'

function paper(overrides: Partial<Paper> = {}): Paper {
  return {
    doi: '10.1101/2026.01.01.000001',
    title: 'A paper: with "quotes"',
    authors: 'Doe, Jane; Roe, John',
    date: '2026-01-02',
    abstract: 'An abstract',
    cited: 3,
    category: 'bioinformatics',
    server: 'bioRxiv',
    ...overrides,
  }
}

describe('toBibtex', () => {
  it('emits a misc entry with a stable key, DOI and preprint note', () => {
    const bib = toBibtex(paper(), 0)
    expect(bib).toContain('@misc{Doe2026')
    expect(bib).toContain('title = {A paper: with "quotes"}')
    expect(bib).toContain('author = {Doe, Jane; Roe, John}')
    expect(bib).toContain('year = {2026}')
    expect(bib).toContain('doi = {10.1101/2026.01.01.000001}')
    expect(bib).toContain('bioRxiv preprint')
  })

  it('does not emit null strings for missing optional fields', () => {
    const bib = toBibtex(paper({ authors: '', date: '', doi: '' }), 1)
    expect(bib).not.toContain('null')
    expect(bib).not.toContain('undefined')
    expect(bib).toContain('year = {n.d.}')
  })
})

describe('toCsv', () => {
  it('emits a fixed header and escapes quotes and newlines', () => {
    const csv = toCsv([paper({ title: 'A "quoted"\nline' })])
    const lines = csv.split('\n')
    expect(lines[0]).toBe('doi,title,authors,date,category,server,publishedDoi,journal,retracted')
    expect(csv).toContain('"A ""quoted"" line"')
    expect(csv).toContain('10.1101/2026.01.01.000001')
  })

  it('emits only the header for an empty list', () => {
    expect(toCsv([])).toBe('doi,title,authors,date,category,server,publishedDoi,journal,retracted')
  })
})

describe('toMarkdown', () => {
  it('renders one bullet per paper with DOI and status', () => {
    const md = toMarkdown([
      paper({ publishedDoi: '10.1234/journal.1', journal: 'Journal of Tests', retracted: false }),
    ])
    expect(md).toContain('- **A paper: with "quotes"** (2026-01-02)')
    expect(md).toContain('DOI: 10.1101/2026.01.01.000001')
    expect(md).toContain('Published: 10.1234/journal.1 (Journal of Tests)')
    expect(md).toContain('Retracted: no')
  })

  it('handles an empty list without null strings', () => {
    const md = toMarkdown([])
    expect(md).toBe('No results.')
    expect(md).not.toContain('null')
  })
})

describe('exportPapers', () => {
  it('dispatches all four formats and reports count/extension', () => {
    const papers = [paper()]
    expect(exportPapers(papers, 'json')).toMatchObject({ format: 'json', count: 1, extension: 'json' })
    expect(exportPapers(papers, 'markdown')).toMatchObject({ format: 'markdown', count: 1, extension: 'md' })
    expect(exportPapers(papers, 'csv')).toMatchObject({ format: 'csv', count: 1, extension: 'csv' })
    expect(exportPapers(papers, 'bibtex')).toMatchObject({ format: 'bibtex', count: 1, extension: 'bib' })
  })

  it('produces valid JSON for an empty list', () => {
    const result = exportPapers([], 'json')
    expect(JSON.parse(result.content)).toEqual([])
    expect(result.count).toBe(0)
  })

  it('rejects an unknown format', () => {
    expect(() => exportPapers([], 'xml' as never)).toThrowError(/E-001/)
  })
})
