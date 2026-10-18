/** Deterministic, explainable relevance ranking and DOI deduplication. */

import type { Paper } from './types.ts'

export function normalizeDoi(doi: string): string {
  return doi
    .trim()
    .replace(/^https?:\/\/doi\.org\//i, '')
    .replace(/^doi:\s*/i, '')
    .trim()
    .toLocaleLowerCase()
}

export function relevanceScore(paper: Paper, terms: string[]): number {
  if (terms.length === 0) return 0
  const title = paper.title.toLocaleLowerCase()
  const abstract = paper.abstract.toLocaleLowerCase()
  const lowered = terms.map((term) => term.toLocaleLowerCase()).filter((term) => term !== '')
  if (lowered.length === 0) return 0

  const titleHit = lowered.some((term) => title.includes(term)) ? 1 : 0
  const positions = lowered.map((term) => abstract.indexOf(term)).filter((index) => index >= 0)
  const first = positions.length > 0 ? Math.min(...positions) : -1
  const early = first >= 0 && first <= 300 ? 1 : 0
  const count = lowered.reduce((total, term) => total + abstract.split(term).length - 1, 0)
  return 3 * titleHit + 2 * early + Math.min(count, 3)
}

export function dedupePapers(papers: Paper[]): Paper[] {
  const kept = new Map<string, Paper>()
  for (const paper of papers) {
    const key = normalizeDoi(paper.doi)
    const existing = kept.get(key)
    if (existing === undefined || (paper.score ?? 0) > (existing.score ?? 0)) kept.set(key, paper)
  }
  return [...kept.values()]
}

export function rankPapers(papers: Paper[], terms: string[]): Paper[] {
  const scored = papers.map((paper) => ({ ...paper, score: relevanceScore(paper, terms) }))
  scored.sort((a, b) => {
    if ((b.score ?? 0) !== (a.score ?? 0)) return (b.score ?? 0) - (a.score ?? 0)
    if (b.cited !== a.cited) return b.cited - a.cited
    if (b.date !== a.date) return b.date.localeCompare(a.date)
    return a.doi.localeCompare(b.doi)
  })
  return dedupePapers(scored)
}
