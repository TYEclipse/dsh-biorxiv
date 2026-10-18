/** bioRxiv version selection and publication/retraction status. */

import type { PaperStatus } from './types.ts'

export interface BiorxivDetail {
  doi: string
  title: string
  authors: string
  date: string
  category: string
  abstract: string
  server: string
  version?: string
  published?: string
}

export interface SelectedVersion {
  detail: BiorxivDetail
  version: number
  versionsCount: number
}

export interface StatusOptions {
  journal?: string
  retracted?: boolean | null
}

function versionNumber(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? '', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1
}

export function pickLatestVersion(details: BiorxivDetail[]): SelectedVersion | null {
  if (details.length === 0) return null
  let selected = details[0] as BiorxivDetail
  let selectedVersion = versionNumber(selected.version)
  for (const detail of details.slice(1)) {
    const version = versionNumber(detail.version)
    if (version > selectedVersion) {
      selected = detail
      selectedVersion = version
    }
  }
  return { detail: selected, version: selectedVersion, versionsCount: details.length }
}

function publishedDoi(value: string | undefined): string {
  const normalized = (value ?? '').trim()
  return normalized.toLocaleUpperCase() === 'NA' ? '' : normalized
}

export function buildStatus(doi: string, details: BiorxivDetail[], options: StatusOptions = {}): PaperStatus | null {
  const selected = pickLatestVersion(details)
  if (selected === null) return null
  return {
    doi,
    version: selected.version,
    versionsCount: selected.versionsCount,
    publishedDoi: publishedDoi(selected.detail.published),
    journal: options.journal ?? '',
    retracted: options.retracted ?? null,
  }
}
