/**
 * ORACLE: test/oracle/anchors.py
 * Every number below is printed by section B of the oracle; re-run
 * `python3 test/oracle/anchors.py` before changing an expectation.
 */
import { describe, expect, it } from 'vitest'
import { MemoryCache } from '../../src/adapters/cache.ts'
import type { JsonClient } from '../../src/adapters/europepmc.ts'
import { monthSpans, perWeek, trendTool } from '../../src/core/trend.ts'

const NOW = Date.parse('2026-11-07T05:45:00Z')

interface Call {
  url: string
}

/** Answers hitCount by the FIRST_PDATE window found in the query string. */
function clientFor(counts: Record<string, number>, calls?: Call[]): JsonClient {
  return {
    async getJson<T>(url: string): Promise<T> {
      calls?.push({ url })
      const decoded = decodeURIComponent(url).replace(/\+/g, ' ')
      const window = /FIRST_PDATE:\[(\d{4}-\d{2}-\d{2}) TO (\d{4}-\d{2}-\d{2})\]/.exec(decoded)
      const key = window === null ? 'none' : `${window[1]}:${window[2]}`
      const count = counts[key]
      if (count === undefined) throw new Error(`unexpected window ${key}`)
      return { hitCount: count, resultList: { result: [] } } as T
    },
  }
}

function deps(nowMs: number, counts: Record<string, number>, calls?: Call[]) {
  return { client: clientFor(counts, calls), cache: new MemoryCache(), now: () => nowMs }
}

const SIX_MONTH = {
  '2026-05-01:2026-05-31': 10,
  '2026-06-01:2026-06-30': 12,
  '2026-07-01:2026-07-31': 9,
  '2026-08-01:2026-08-31': 0,
  '2026-09-01:2026-09-30': 5,
  '2026-10-01:2026-10-31': 15,
  '2026-11-01:2026-11-07': 4,
}

describe('monthSpans', () => {
  it('lists completed calendar months and stops the running month at today', () => {
    const spans = monthSpans(NOW, 6)
    expect(spans.map((span) => span.label)).toEqual([
      '2026-05',
      '2026-06',
      '2026-07',
      '2026-08',
      '2026-09',
      '2026-10',
      '2026-11',
    ])
    expect(spans[0]).toMatchObject({ dateFrom: '2026-05-01', dateTo: '2026-05-31', days: 31, complete: true })
    expect(spans[4]).toMatchObject({ dateFrom: '2026-09-01', dateTo: '2026-09-30', days: 30, complete: true })
    expect(spans[6]).toMatchObject({ dateFrom: '2026-11-01', dateTo: '2026-11-07', days: 7, complete: false })
  })

  it('counts 29 days for February 2024', () => {
    const spans = monthSpans(Date.parse('2024-03-10T00:00:00Z'), 1)
    expect(spans[0]).toMatchObject({ label: '2024-02', dateFrom: '2024-02-01', dateTo: '2024-02-29', days: 29 })
  })
})

describe('perWeek', () => {
  it('normalises a month to a week and folds -0', () => {
    expect(perWeek(7, 7)).toBe(7)
    expect(perWeek(10, 31)).toBe(2.26)
    expect(perWeek(0, 31)).toBe(0)
  })
})

describe('trendTool', () => {
  it('reports one bucket per month with total, peak and both changes', async () => {
    const result = await trendTool(deps(NOW, SIX_MONTH), { topic: 'protein language model', months: 6 })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const data = result.data
    expect(data.total).toBe(51)
    expect(data.peak).toEqual({ label: '2026-10', count: 15 })
    expect(data.buckets.map((bucket) => bucket.count)).toEqual([10, 12, 9, 0, 5, 15, 4])
    expect(data.buckets.map((bucket) => bucket.perWeek)).toEqual([2.26, 2.8, 2.03, 0, 1.17, 3.39, 4])
    expect(data.monthOverMonth).toMatchObject({
      fromLabel: '2026-09',
      toLabel: '2026-10',
      absolute: 10,
      percent: 200,
    })
    expect(data.overall).toMatchObject({ fromLabel: '2026-05', toLabel: '2026-10', absolute: 5, percent: 50 })
    expect(data.dateFrom).toBe('2026-05-01')
    expect(data.dateTo).toBe('2026-11-07')
    expect(data.note).toContain('complete=false')
  })

  it('serves the second identical call from cache', async () => {
    const calls: Call[] = []
    const shared = deps(NOW, SIX_MONTH, calls)
    const first = await trendTool(shared, { topic: 'protein language model', months: 6 })
    const after = calls.length
    const second = await trendTool(shared, { topic: 'protein language model', months: 6 })
    expect(after).toBe(7)
    expect(calls.length).toBe(7)
    expect(first.ok && second.ok).toBe(true)
    if (second.ok) expect(second.meta.cached).toBe(true)
  })

  it('gives no change figures with a single completed month', async () => {
    const result = await trendTool(deps(NOW, { '2026-10-01:2026-10-31': 7, '2026-11-01:2026-11-07': 2 }), {
      topic: 'protein language model',
      months: 1,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.total).toBe(7)
    expect(result.data.monthOverMonth).toBeNull()
    expect(result.data.overall).toBeNull()
  })

  it('reports a null percent when the baseline month had no hits', async () => {
    const result = await trendTool(
      deps(NOW, { '2026-09-01:2026-09-30': 0, '2026-10-01:2026-10-31': 5, '2026-11-01:2026-11-07': 3 }),
      { topic: 'protein language model', months: 2 },
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.monthOverMonth).toMatchObject({ absolute: 5, percent: null })
  })

  it('rejects months outside 1–12', async () => {
    for (const months of [0, 13, 1.5]) {
      const result = await trendTool(deps(NOW, SIX_MONTH), { topic: 'protein language model', months })
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error.code).toBe('E-001')
    }
  })

  it('surfaces upstream failure instead of a zero-filled curve', async () => {
    const failing: JsonClient = {
      async getJson<T>(): Promise<T> {
        throw new Error('offline')
      },
    }
    const result = await trendTool({ client: failing, cache: new MemoryCache(), now: () => NOW }, { topic: 'x' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('E-010')
  })
})
