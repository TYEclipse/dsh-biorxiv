/** Deterministic exporters: JSON, Markdown, CSV and BibTeX. */

import { InputError } from './query.ts'
import type { ExportFormat, Paper } from './types.ts'

export interface ExportResult {
  format: ExportFormat
  content: string
  count: number
  extension: string
}

function text(value: string | undefined): string {
  return value ?? ''
}

function yearOf(paper: Paper): string {
  const year = text(paper.date).slice(0, 4)
  return /^\d{4}$/.test(year) ? year : 'n.d.'
}

function bibKey(paper: Paper): string {
  const first = text(paper.authors).split(/[;,]/)[0]?.trim() ?? ''
  const name = first.replace(/[^A-Za-z0-9]/g, '') || 'paper'
  return `${name}${yearOf(paper)}`
}

export function toBibtex(paper: Paper, index = 0): string {
  const suffix = index > 0 ? String(index + 1) : ''
  const lines = [
    `@misc{${bibKey(paper)}${suffix},`,
    `  title = {${text(paper.title)}},`,
    `  author = {${text(paper.authors)}},`,
    `  year = {${yearOf(paper)}},`,
  ]
  if (text(paper.doi) !== '') lines.push(`  doi = {${paper.doi}},`)
  if (text(paper.publishedDoi) !== '') lines.push(`  howpublished = {Published as ${paper.publishedDoi}},`)
  lines.push('  note = {bioRxiv preprint, not peer-reviewed}')
  lines.push('}')
  return lines.join('\n')
}

function csvCell(value: string | boolean | null | undefined): string {
  if (value === null || value === undefined) return ''
  const raw = String(value).replace(/\r?\n/g, ' ').replace(/"/g, '""')
  return /[",]/.test(raw) ? `"${raw}"` : raw
}

export function toCsv(papers: Paper[]): string {
  const header = 'doi,title,authors,date,category,server,publishedDoi,journal,retracted'
  const rows = papers.map((paper) =>
    [
      paper.doi,
      paper.title,
      paper.authors,
      paper.date,
      paper.category,
      paper.server,
      paper.publishedDoi,
      paper.journal,
      paper.retracted === null || paper.retracted === undefined ? '' : paper.retracted ? 'yes' : 'no',
    ]
      .map(csvCell)
      .join(','),
  )
  return [header, ...rows].join('\n')
}

export function toMarkdown(papers: Paper[]): string {
  if (papers.length === 0) return 'No results.'
  return papers
    .map((paper) => {
      const lines = [`- **${text(paper.title)}**${text(paper.date) === '' ? '' : ` (${paper.date})`}`]
      if (text(paper.authors) !== '') lines.push(`  Authors: ${paper.authors}`)
      if (text(paper.doi) !== '') lines.push(`  DOI: ${paper.doi}`)
      if (text(paper.publishedDoi) !== '') {
        const journal = text(paper.journal) === '' ? '' : ` (${paper.journal})`
        lines.push(`  Published: ${paper.publishedDoi}${journal}`)
      }
      if (paper.retracted !== null && paper.retracted !== undefined) {
        lines.push(`  Retracted: ${paper.retracted ? 'yes' : 'no'}`)
      }
      return lines.join('\n')
    })
    .join('\n')
}

export function exportPapers(papers: Paper[], format: ExportFormat): ExportResult {
  if (!['json', 'markdown', 'csv', 'bibtex'].includes(format)) throw new InputError('unsupported export format')
  if (format === 'json') {
    return { format, content: JSON.stringify(papers, null, 2), count: papers.length, extension: 'json' }
  }
  if (format === 'markdown') {
    return { format, content: toMarkdown(papers), count: papers.length, extension: 'md' }
  }
  if (format === 'csv') {
    return { format, content: toCsv(papers), count: papers.length, extension: 'csv' }
  }
  return {
    format,
    content: papers.map((paper, index) => toBibtex(paper, index)).join('\n\n'),
    count: papers.length,
    extension: 'bib',
  }
}
