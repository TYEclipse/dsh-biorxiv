/** Optional Crossref/OpenAlex enrichment; failures never block the core result. */

import type { JsonClient } from './europepmc.ts'
import { buildStatus, type BiorxivDetail } from '../core/status.ts'
import type { PaperStatus } from '../core/types.ts'

function doiPath(doi: string): string {
  return doi.trim().split('/').map(encodeURIComponent).join('/')
}

export async function fetchCrossrefJournal(client: JsonClient, doi: string): Promise<string> {
  if (doi.trim() === '') return ''
  try {
    const payload = await client.getJson<{ message?: { 'container-title'?: unknown } }>(
      `https://api.crossref.org/works/${doiPath(doi)}`,
    )
    const titles = payload.message?.['container-title']
    if (!Array.isArray(titles)) return ''
    const first = titles[0]
    return typeof first === 'string' ? first.trim() : ''
  } catch {
    return ''
  }
}

export async function fetchOpenAlexRetraction(client: JsonClient, doi: string): Promise<boolean | null> {
  if (doi.trim() === '') return null
  try {
    const payload = await client.getJson<{ is_retracted?: unknown }>(
      `https://api.openalex.org/works/doi:${doiPath(doi)}`,
    )
    return typeof payload.is_retracted === 'boolean' ? payload.is_retracted : null
  } catch {
    return null
  }
}

export async function enrichStatus(
  client: JsonClient,
  doi: string,
  details: BiorxivDetail[],
): Promise<PaperStatus | null> {
  if (details.length === 0) return null
  const [journal, retracted] = await Promise.all([
    fetchCrossrefJournal(client, doi),
    fetchOpenAlexRetraction(client, doi),
  ])
  return buildStatus(doi, details, { journal, retracted })
}
