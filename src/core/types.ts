/** Domain types shared by core, adapters and entrypoints. */

export interface Paper {
  doi: string
  title: string
  authors: string
  date: string
  abstract: string
  cited: number
  category: string
  server: string
  version?: number
  versionsCount?: number
  publishedDoi?: string
  journal?: string
  retracted?: boolean | null
  url?: string
  score?: number
}

export interface PaperStatus {
  doi: string
  version: number
  versionsCount: number
  publishedDoi: string
  journal: string
  retracted: boolean | null
}

export type ExportFormat = 'json' | 'markdown' | 'csv' | 'bibtex'

export interface SearchData {
  query: string
  hitCount: number
  items: Paper[]
}

export interface PaperDetail extends Paper {
  version: number
  versionsCount: number
  publishedDoi: string
  journal: string
  retracted: boolean | null
}

export interface LatestData {
  category: string
  days: number
  items: Paper[]
}

export interface ExportData {
  format: ExportFormat
  count: number
  path: string
  content: string
}

export interface DigestItem extends Paper {
  summary?: string
}

export interface DigestData {
  topic: string
  query: string
  count: number
  generatedAt: string
  items: DigestItem[]
  markdown: string
}
