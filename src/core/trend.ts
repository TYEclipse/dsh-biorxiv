/** Topic trend: month- or week-bucketed preprint volume from Europe PMC hit counts. */

import { hashCacheKey } from '../adapters/cache.ts'
import { searchEuropePmc } from '../adapters/europepmc.ts'
import { fail, fromHttpStatus, HttpError, ok, type ErrorCode, type Result } from './errors.ts'
import { buildQuery, InputError, type QueryField } from './query.ts'
import type { ServiceDeps } from './service.ts'

export type TrendBucketKind = 'month' | 'week'

export interface TrendInput {
  topic: string
  bucket?: TrendBucketKind
  months?: number
  weeks?: number
  field?: QueryField
}

export interface TrendBucket {
  label: string
  dateFrom: string
  dateTo: string
  days: number
  complete: boolean
  count: number
  perWeek: number
}

export interface TrendChange {
  fromLabel: string
  toLabel: string
  fromCount: number
  toCount: number
  absolute: number
  percent: number | null
}

export interface TrendData {
  topic: string
  bucket: TrendBucketKind
  months?: number
  weeks?: number
  dateFrom: string
  dateTo: string
  buckets: TrendBucket[]
  total: number
  peak: { label: string; count: number }
  monthOverMonth?: TrendChange | null
  weekOverWeek?: TrendChange | null
  overall: TrendChange | null
  note: string
}

const TTL_TREND = 24 * 60 * 60
const MIN_MONTHS = 1
const MAX_MONTHS = 12
const MIN_WEEKS = 1
const MAX_WEEKS = 26
const MS_PER_DAY = 24 * 60 * 60 * 1000
const NOTE =
  'counts are Europe PMC hitCount for SRC:PPR + PUBLISHER:"bioRxiv", one query per calendar month; ' +
  'only completed months feed total, peak and both changes — the current month is listed with complete=false ' +
  'and perWeek normalises its shorter span; percent is null when the baseline month had zero hits.'
const NOTE_WEEK =
  'counts are Europe PMC hitCount for SRC:PPR + PUBLISHER:"bioRxiv", one query per ISO week (Monday to Sunday); ' +
  'only completed weeks feed total, peak and both changes — the running week is listed with complete=false ' +
  'and perWeek normalises its shorter span; labels use the ISO week-numbering year, which can differ from the ' +
  'calendar year around New Year; percent is null when the baseline week had zero hits.'

export function roundOut(value: number, digits: number): number {
  const factor = 10 ** digits
  const rounded = Math.round(value * factor) / factor
  return Object.is(rounded, -0) ? 0 : rounded
}

function ymd(year: number, monthIndex: number, day: number): string {
  return new Date(Date.UTC(year, monthIndex, day)).toISOString().slice(0, 10)
}

function label(year: number, monthIndex: number): string {
  const normalised = new Date(Date.UTC(year, monthIndex, 1))
  return `${normalised.getUTCFullYear()}-${String(normalised.getUTCMonth() + 1).padStart(2, '0')}`
}

export interface TrendSpan {
  label: string
  dateFrom: string
  dateTo: string
  days: number
  complete: boolean
}

/** @deprecated kept for callers that still name the month-only shape; use `TrendSpan`. */
export type MonthSpan = TrendSpan

/** Calendar-month spans for the window ending at `now`: completed months plus the running one. */
export function monthSpans(nowMs: number, months: number): TrendSpan[] {
  const now = new Date(nowMs)
  const year = now.getUTCFullYear()
  const monthIndex = now.getUTCMonth()
  const spans: MonthSpan[] = []
  for (let offset = months; offset >= 1; offset -= 1) {
    const start = new Date(Date.UTC(year, monthIndex - offset, 1))
    const lastDay = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0))
    spans.push({
      label: label(start.getUTCFullYear(), start.getUTCMonth()),
      dateFrom: ymd(start.getUTCFullYear(), start.getUTCMonth(), 1),
      dateTo: ymd(lastDay.getUTCFullYear(), lastDay.getUTCMonth(), lastDay.getUTCDate()),
      days: lastDay.getUTCDate(),
      complete: true,
    })
  }
  const elapsed = now.getUTCDate()
  spans.push({
    label: label(year, monthIndex),
    dateFrom: ymd(year, monthIndex, 1),
    dateTo: ymd(year, monthIndex, elapsed),
    days: elapsed,
    complete: false,
  })
  return spans
}

export function perWeek(count: number, days: number): number {
  if (days <= 0) return 0
  return roundOut((count * 7) / days, 2)
}

function isoDate(day: Date): string {
  return day.toISOString().slice(0, 10)
}

/**
 * ISO-8601 week label (`2026-W45`). The year shown is the ISO week-numbering
 * year, which only equals the calendar year when the week does not straddle
 * New Year — 2026-01-01 is `2026-W01` only if it falls in that week's Monday–Sunday.
 */
export function isoWeekLabel(day: Date): string {
  const thursday = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()))
  const weekday = thursday.getUTCDay() || 7
  thursday.setUTCDate(thursday.getUTCDate() + 4 - weekday)
  const yearStart = Date.UTC(thursday.getUTCFullYear(), 0, 1)
  const week = Math.ceil(((thursday.getTime() - yearStart) / MS_PER_DAY + 1) / 7)
  return `${thursday.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

/** ISO-week spans (Monday–Sunday) for the window ending at `now`: completed weeks plus the running one. */
export function weekSpans(nowMs: number, weeks: number): TrendSpan[] {
  const now = new Date(nowMs)
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  const weekday = new Date(today).getUTCDay() || 7
  const monday = today - (weekday - 1) * MS_PER_DAY
  const spans: TrendSpan[] = []
  for (let offset = weeks; offset >= 1; offset -= 1) {
    const start = new Date(monday - offset * 7 * MS_PER_DAY)
    const end = new Date(start.getTime() + 6 * MS_PER_DAY)
    spans.push({
      label: isoWeekLabel(start),
      dateFrom: isoDate(start),
      dateTo: isoDate(end),
      days: 7,
      complete: true,
    })
  }
  spans.push({
    label: isoWeekLabel(new Date(monday)),
    dateFrom: isoDate(new Date(monday)),
    dateTo: isoDate(new Date(today)),
    days: Math.round((today - monday) / MS_PER_DAY) + 1,
    complete: false,
  })
  return spans
}

export function changeOf(from: TrendBucket, to: TrendBucket): TrendChange {
  const absolute = to.count - from.count
  const percent = from.count === 0 ? null : roundOut((absolute / from.count) * 100, 1)
  return {
    fromLabel: from.label,
    toLabel: to.label,
    fromCount: from.count,
    toCount: to.count,
    absolute,
    percent,
  }
}

export interface TrendSummary {
  dateFrom: string
  dateTo: string
  buckets: TrendBucket[]
  total: number
  peak: { label: string; count: number }
  /** Change between the last two completed buckets (month-over-month or week-over-week). */
  latest: TrendChange | null
  overall: TrendChange | null
}

export function summarise(buckets: TrendBucket[]): TrendSummary {
  const completed = buckets.filter((bucket) => bucket.complete)
  const total = completed.reduce((sum, bucket) => sum + bucket.count, 0)
  let peak = { label: '', count: -1 }
  for (const bucket of completed) {
    if (bucket.count > peak.count) peak = { label: bucket.label, count: bucket.count }
  }
  const last = completed.length >= 2 ? completed[completed.length - 1] : undefined
  const previous = completed.length >= 2 ? completed[completed.length - 2] : undefined
  const first = completed.length >= 2 ? completed[0] : undefined
  return {
    dateFrom: buckets[0]?.dateFrom ?? '',
    dateTo: buckets[buckets.length - 1]?.dateTo ?? '',
    buckets,
    total,
    peak: last === undefined ? { label: '', count: 0 } : peak,
    latest: last !== undefined && previous !== undefined ? changeOf(previous, last) : null,
    overall: last !== undefined && first !== undefined ? changeOf(first, last) : null,
  }
}

function codeOf(error: unknown): ErrorCode {
  if (error instanceof InputError) return 'E-001'
  if (error instanceof HttpError) return fromHttpStatus(error.status)
  if (error instanceof SyntaxError) return 'E-006'
  if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) return 'E-003'
  return 'E-010'
}

export async function trendTool(deps: ServiceDeps, input: TrendInput): Promise<Result<TrendData>> {
  const now = deps.now ?? Date.now
  const started = now()
  const kind: TrendBucketKind = input.bucket ?? 'month'
  const count = kind === 'month' ? (input.months ?? 6) : (input.weeks ?? 8)
  try {
    if (kind !== 'month' && kind !== 'week') {
      throw new InputError('bucket must be "month" or "week"')
    }
    if (kind === 'month' && input.weeks !== undefined) {
      throw new InputError('weeks only applies to bucket="week"; pass months for calendar-month buckets')
    }
    if (kind === 'week' && input.months !== undefined) {
      throw new InputError('months only applies to bucket="month"; pass weeks for ISO-week buckets')
    }
    const min = kind === 'month' ? MIN_MONTHS : MIN_WEEKS
    const max = kind === 'month' ? MAX_MONTHS : MAX_WEEKS
    const name = kind === 'month' ? 'months' : 'weeks'
    if (!Number.isInteger(count) || count < min || count > max) {
      throw new InputError(`${name} must be an integer between ${min} and ${max}`)
    }
    const spans = kind === 'month' ? monthSpans(started, count) : weekSpans(started, count)
    const built = buildQuery({ topic: input.topic, field: input.field, limit: 1 })
    const key = hashCacheKey({
      kind: 'trend',
      bucket: kind,
      query: built.query,
      count,
      window: spans[0]?.dateFrom ?? '',
    })
    const cached = await deps.cache.get<TrendData>(key).catch(() => null)
    if (cached !== null && cached !== undefined) {
      return ok(cached, { elapsedMs: Math.max(0, now() - started), source: ['cache'], cached: true })
    }
    const buckets: TrendBucket[] = []
    for (const span of spans) {
      const scoped = buildQuery({
        topic: input.topic,
        field: input.field,
        limit: 1,
        dateFrom: span.dateFrom,
        dateTo: span.dateTo,
      })
      const found = await searchEuropePmc(deps.client, scoped)
      buckets.push({ ...span, count: found.hitCount, perWeek: perWeek(found.hitCount, span.days) })
    }
    const { latest, ...summary } = summarise(buckets)
    const data: TrendData =
      kind === 'month'
        ? { topic: input.topic, bucket: 'month', months: count, ...summary, monthOverMonth: latest, note: NOTE }
        : { topic: input.topic, bucket: 'week', weeks: count, ...summary, weekOverWeek: latest, note: NOTE_WEEK }
    await deps.cache.set(key, data, TTL_TREND).catch(() => undefined)
    return ok(data, { elapsedMs: Math.max(0, now() - started), source: ['europepmc'], cached: false })
  } catch (error) {
    const code = codeOf(error)
    return fail(code, {
      elapsedMs: Math.max(0, now() - started),
      source: ['europepmc'],
      message: error instanceof Error ? error.message : undefined,
    })
  }
}
