/** bioRxiv API adapter for version details and the latest-preprint stream. */

import { InputError } from '../core/query.ts'
import type { BiorxivDetail } from '../core/status.ts'
import type { Paper } from '../core/types.ts'
import type { JsonClient } from './europepmc.ts'

const DETAILS_BASE = 'https://api.biorxiv.org/details/biorxiv'
const PAGE_SIZE = 30

function stringOrEmpty(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function detailFrom(raw: Record<string, unknown>): BiorxivDetail {
  return {
    doi: stringOrEmpty(raw.doi),
    title: stringOrEmpty(raw.title),
    authors: stringOrEmpty(raw.authors),
    date: stringOrEmpty(raw.date),
    category: stringOrEmpty(raw.category),
    abstract: stringOrEmpty(raw.abstract),
    server: stringOrEmpty(raw.server) || 'bioRxiv',
    version: typeof raw.version === 'string' ? raw.version : undefined,
    published: typeof raw.published === 'string' ? raw.published : undefined,
  }
}

function paperFrom(detail: BiorxivDetail): Paper {
  return {
    doi: detail.doi,
    title: detail.title,
    authors: detail.authors,
    date: detail.date,
    abstract: detail.abstract,
    cited: 0,
    category: detail.category,
    server: detail.server,
    version: detail.version === undefined ? undefined : Number.parseInt(detail.version, 10) || 1,
    publishedDoi: detail.published === undefined || detail.published === 'NA' ? '' : detail.published,
    url: `https://doi.org/${detail.doi}`,
  }
}

function doiPath(doi: string): string {
  const cleaned = doi.trim().replace(/^https?:\/\/doi\.org\//i, '')
  if (cleaned === '') throw new InputError('DOI must not be empty')
  return cleaned.split('/').map(encodeURIComponent).join('/')
}

export async function fetchBiorxivDetails(client: JsonClient, doi: string): Promise<BiorxivDetail[]> {
  const payload = await client.getJson<{ collection?: unknown }>(`${DETAILS_BASE}/${doiPath(doi)}/na/json`)
  if (payload === null || typeof payload !== 'object' || !Array.isArray(payload.collection)) {
    throw new SyntaxError('invalid bioRxiv details response')
  }
  return payload.collection
    .filter((raw): raw is Record<string, unknown> => raw !== null && typeof raw === 'object')
    .map(detailFrom)
    .filter((detail) => detail.doi !== '')
}

function dateString(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export async function fetchLatestBiorxiv(
  client: JsonClient,
  options: { days: number; limit: number; category?: string; today?: Date },
): Promise<Paper[]> {
  const today = options.today ?? new Date()
  const start = new Date(today)
  start.setUTCDate(start.getUTCDate() - Math.max(1, options.days))
  const startDate = dateString(start)
  const endDate = dateString(today)
  const items: Paper[] = []
  const seen = new Set<string>()
  let cursor = 0

  while (items.length < options.limit) {
    const base = `${DETAILS_BASE}/${startDate}/${endDate}/${cursor}`
    const url = options.category === undefined
      ? base
      : `${base}?category=${encodeURIComponent(options.category)}`
    const payload = await client.getJson<{ collection?: unknown }>(url)
    if (payload === null || typeof payload !== 'object' || !Array.isArray(payload.collection)) {
      throw new SyntaxError('invalid bioRxiv latest response')
    }
    if (payload.collection.length === 0) break
    let added = 0
    for (const raw of payload.collection) {
      if (raw === null || typeof raw !== 'object') continue
      const detail = detailFrom(raw as Record<string, unknown>)
      if (detail.doi === '' || seen.has(detail.doi)) continue
      seen.add(detail.doi)
      items.push(paperFrom(detail))
      added += 1
      if (items.length >= options.limit) break
    }
    if (added === 0) break
    cursor += PAGE_SIZE
  }
  return items
}
