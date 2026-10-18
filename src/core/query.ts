/** Query construction for Europe PMC's bioRxiv preprint index. */

export type QueryField = 'any' | 'title' | 'abstract'

export interface QueryInput {
  topic: string
  dateFrom?: string
  dateTo?: string
  authors?: string[]
  limit?: number
  field?: QueryField
  preprintsOnly?: boolean
}

export interface BuiltQuery {
  query: string
  terms: string[]
  limit: number
}

export class InputError extends Error {
  readonly code = 'E-001'

  constructor(message: string) {
    super(`E-001: ${message}`)
    this.name = 'InputError'
  }
}

const MAX_TOPIC_CHARS = 1000
const MAX_TERMS = 8
const MAX_AUTHORS = 10
const DEFAULT_LIMIT = 20
const MAX_LIMIT = 100
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function clean(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f"]/g, ' ').replace(/\s+/g, ' ').trim()
}

export function splitTerms(topic: string): string[] {
  if (typeof topic !== 'string') throw new InputError('topic must be a string')
  if (topic.length > MAX_TOPIC_CHARS) throw new InputError(`topic must be at most ${MAX_TOPIC_CHARS} characters`)
  const seen = new Set<string>()
  const terms: string[] = []
  for (const raw of topic.split('|')) {
    const term = clean(raw)
    if (term === '') continue
    const key = term.toLocaleLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    terms.push(term)
  }
  if (terms.length === 0) throw new InputError('topic must not be empty')
  if (terms.length > MAX_TERMS) throw new InputError(`topic must have at most ${MAX_TERMS} synonyms`)
  return terms
}

function validDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

function normalizeLimit(limit: number | undefined): number {
  if (limit === undefined) return DEFAULT_LIMIT
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    throw new InputError(`limit must be an integer between 1 and ${MAX_LIMIT}`)
  }
  return limit
}

function termExpression(term: string, field: QueryField): string {
  if (field === 'title') return `TITLE:"${term}"`
  if (field === 'abstract') return `ABSTRACT:"${term}"`
  return `"${term}"`
}

export function buildQuery(input: QueryInput): BuiltQuery {
  const terms = splitTerms(input.topic)
  const limit = normalizeLimit(input.limit)
  const field = input.field ?? 'any'
  if (!['any', 'title', 'abstract'].includes(field)) throw new InputError('field must be any, title or abstract')

  if (input.dateFrom !== undefined && !validDate(input.dateFrom)) throw new InputError('dateFrom must be YYYY-MM-DD')
  if (input.dateTo !== undefined && !validDate(input.dateTo)) throw new InputError('dateTo must be YYYY-MM-DD')
  if (input.dateFrom !== undefined && input.dateTo !== undefined && input.dateFrom > input.dateTo) {
    throw new InputError('dateFrom must not be after dateTo')
  }

  const parts: string[] = []
  const expressions = terms.map((term) => termExpression(term, field))
  parts.push(expressions.length === 1 ? `(${expressions[0]})` : `(${expressions.join(' OR ')})`)

  if (input.authors !== undefined) {
    const authors = input.authors.map(clean).filter((author) => author !== '')
    if (authors.length > MAX_AUTHORS) throw new InputError(`authors must have at most ${MAX_AUTHORS} entries`)
    if (authors.length > 0) parts.push(`(${authors.map((author) => `AUTH:"${author}"`).join(' OR ')})`)
  }

  if (input.preprintsOnly !== false) parts.push('SRC:PPR')
  parts.push('PUBLISHER:"bioRxiv"')

  if (input.dateFrom !== undefined && input.dateTo !== undefined) {
    parts.push(`FIRST_PDATE:[${input.dateFrom} TO ${input.dateTo}]`)
  } else if (input.dateFrom !== undefined) {
    parts.push(`FIRST_PDATE:[${input.dateFrom} TO 3000-12-31]`)
  } else if (input.dateTo !== undefined) {
    parts.push(`FIRST_PDATE:[1900-01-01 TO ${input.dateTo}]`)
  }

  return { query: parts.join(' AND '), terms, limit }
}
