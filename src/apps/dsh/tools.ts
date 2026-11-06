/** dsh tool surface: four thin adapters over src/core/service.ts. */

import { defineTool, type JsonValue, type ToolDefinition } from '@deepseek-ai/dsh-tools'
import type { Result } from '../../core/errors.ts'
import type { ServiceDeps } from '../../core/service.ts'
import { digestTool } from '../../core/digest.ts'
import { exportTool, latestTool, paperTool, searchTool } from '../../core/service.ts'
import { trendTool } from '../../core/trend.ts'

export interface ToolSet {
  biorxiv_search: ToolDefinition
  biorxiv_paper: ToolDefinition
  biorxiv_latest: ToolDefinition
  biorxiv_export: ToolDefinition
  biorxiv_digest: ToolDefinition
  biorxiv_trend: ToolDefinition
}

interface ToolEnvelope {
  ok: boolean
  data: Record<string, JsonValue>
  error: { code: string; message: string; retryable: boolean; hint: string }
  meta: { requestId: string; elapsedMs: number; cached: boolean; source: string[]; warnings: string[] }
}

const EMPTY_ERROR = { code: '', message: '', retryable: false, hint: '' }

const OUTPUT_SCHEMA = {
  type: 'object' as const,
  additionalProperties: false as const,
  properties: {
    ok: { type: 'boolean' as const, required: true as const },
    data: { type: 'object' as const, additionalProperties: true as const, required: true as const },
    error: {
      type: 'object' as const,
      additionalProperties: false as const,
      required: true as const,
      properties: {
        code: { type: 'string' as const, required: true as const },
        message: { type: 'string' as const, required: true as const },
        retryable: { type: 'boolean' as const, required: true as const },
        hint: { type: 'string' as const, required: true as const },
      },
    },
    meta: {
      type: 'object' as const,
      additionalProperties: false as const,
      required: true as const,
      properties: {
        requestId: { type: 'string' as const, required: true as const },
        elapsedMs: { type: 'number' as const, required: true as const },
        cached: { type: 'boolean' as const, required: true as const },
        source: { type: 'array' as const, items: { type: 'string' as const }, required: true as const },
        warnings: { type: 'array' as const, items: { type: 'string' as const }, required: true as const },
      },
    },
  },
}

function envelope(result: Result<unknown>): ToolEnvelope {
  if (result.ok) {
    return {
      ok: true,
      data: result.data as unknown as Record<string, JsonValue>,
      error: { ...EMPTY_ERROR },
      meta: result.meta,
    }
  }
  return { ok: false, data: {}, error: result.error, meta: result.meta }
}

function text(value: string): Array<{ type: 'text'; text: string }> {
  return [{ type: 'text', text: value }]
}

function renderSearch(value: unknown): string {
  const result = value as ToolEnvelope
  if (!result.ok) return `${result.error.code}: ${result.error.message}`
  const data = result.data as { query?: string; hitCount?: number; items?: Array<{ title?: string; doi?: string }> }
  const items = data.items ?? []
  const lines = [`${items.length} result(s) of ${data.hitCount ?? 0} for ${data.query ?? ''}`]
  for (const [index, paper] of items.slice(0, 5).entries()) {
    lines.push(`${index + 1}. ${paper.title ?? '(no title)'} — ${paper.doi ?? ''}`)
  }
  return lines.join('\n')
}

function renderPaper(value: unknown): string {
  const result = value as ToolEnvelope
  if (!result.ok) return `${result.error.code}: ${result.error.message}`
  const data = result.data as {
    title?: string
    doi?: string
    version?: number
    versionsCount?: number
    publishedDoi?: string
    journal?: string
    retracted?: boolean | null
  }
  const lines = [
    `${data.title ?? '(no title)'}`,
    `DOI: ${data.doi ?? ''}`,
    `Version: ${data.version ?? 1} of ${data.versionsCount ?? 1}`,
  ]
  if ((data.publishedDoi ?? '') !== '') lines.push(`Published: ${data.publishedDoi}${data.journal ? ` (${data.journal})` : ''}`)
  if (data.retracted !== null && data.retracted !== undefined) lines.push(`Retracted: ${data.retracted ? 'yes' : 'no'}`)
  return lines.join('\n')
}

function renderLatest(value: unknown): string {
  const result = value as ToolEnvelope
  if (!result.ok) return `${result.error.code}: ${result.error.message}`
  const data = result.data as { days?: number; items?: Array<{ title?: string; doi?: string; date?: string }> }
  const items = data.items ?? []
  return [`${items.length} latest preprint(s) in ${data.days ?? 0} day(s)`]
    .concat(items.slice(0, 10).map((paper, index) => `${index + 1}. ${paper.title ?? '(no title)'} — ${paper.doi ?? ''} (${paper.date ?? ''})`))
    .join('\n')
}

function renderExport(value: unknown): string {
  const result = value as ToolEnvelope
  if (!result.ok) return `${result.error.code}: ${result.error.message}`
  const data = result.data as { format?: string; count?: number; path?: string }
  return data.path
    ? `Exported ${data.count ?? 0} item(s) as ${data.format ?? ''} to ${data.path}`
    : `Exported ${data.count ?? 0} item(s) as ${data.format ?? ''} (inline content)`
}

function renderDigest(value: unknown): string {
  const result = value as ToolEnvelope
  if (!result.ok) return `${result.error.code}: ${result.error.message}`
  const data = result.data as { count?: number; markdown?: string }
  return data.markdown ?? `${data.count ?? 0} digest item(s)`
}

function renderTrend(value: unknown): string {
  const result = value as ToolEnvelope
  if (!result.ok) return `${result.error.code}: ${result.error.message}`
  const data = result.data as {
    topic?: string
    months?: number
    dateFrom?: string
    dateTo?: string
    total?: number
    buckets?: Array<{ label?: string; count?: number; perWeek?: number; complete?: boolean }>
    peak?: { label?: string; count?: number }
    monthOverMonth?: { absolute?: number; percent?: number | null } | null
    overall?: { percent?: number | null } | null
  }
  const buckets = data.buckets ?? []
  const lines = [`Trend for ${data.topic ?? ''} (${data.months ?? 0} month(s), ${data.dateFrom ?? ''} to ${data.dateTo ?? ''})`]
  for (const bucket of buckets) {
    lines.push(`${bucket.label ?? ''}${bucket.complete === false ? '*' : ''}  ${bucket.count ?? 0} · ${bucket.perWeek ?? 0}/week`)
  }
  lines.push(`Total (completed months only): ${data.total ?? 0}${data.peak?.label ? ` · peak ${data.peak.label} (${data.peak.count ?? 0})` : ''}`)
  const mom = data.monthOverMonth
  if (mom !== undefined && mom !== null) {
    const percent = mom.percent === null || mom.percent === undefined ? 'baseline was 0' : `${mom.percent > 0 ? '+' : ''}${mom.percent}%`
    lines.push(`Month over month: ${percent} (${mom.absolute ?? 0} preprint(s))`)
  }
  const overall = data.overall
  if (overall !== undefined && overall !== null) {
    const percent = overall.percent === null || overall.percent === undefined ? 'baseline was 0' : `${overall.percent > 0 ? '+' : ''}${overall.percent}%`
    lines.push(`Over the window: ${percent}`)
  }
  lines.push('* current month so far — excluded from total, peak and both changes')
  return lines.join('\n')
}

export function buildTools(deps: ServiceDeps): ToolSet {
  return {
    biorxiv_search: defineTool({
      name: 'biorxiv_search',
      description:
        'Search bioRxiv preprints by topic, optional date window and field. Returns a ranked list with DOI, title, authors, date and abstract. Read-only; no full-text PDF download.',
      parameters: {
        topic: { type: 'string', required: true, description: 'Topic phrase; use | to separate synonyms.' },
        dateFrom: { type: 'string', description: 'Start date YYYY-MM-DD (optional).' },
        dateTo: { type: 'string', description: 'End date YYYY-MM-DD (optional).' },
        limit: { type: 'number', description: 'Maximum results, 1–100 (default 20).' },
        field: { type: 'string', enum: ['any', 'title', 'abstract'], description: 'Search field (default any).' },
        minScore: { type: 'number', description: 'Minimum relevance score 0–10 (default 3; 0 disables filtering).' },
      },
      output: { schema: OUTPUT_SCHEMA, render: (_args: unknown, value: unknown) => text(renderSearch(value)) },
      async execute(args: { topic: string; dateFrom?: string; dateTo?: string; limit?: number; field?: 'any' | 'title' | 'abstract'; minScore?: number }) {
        return envelope(await searchTool(deps, args))
      },
    }),
    biorxiv_paper: defineTool({
      name: 'biorxiv_paper',
      description:
        'Look up one bioRxiv preprint by DOI: latest version, publication DOI/journal and retraction flag when available. Read-only; unknown optional status is reported as null.',
      parameters: { doi: { type: 'string', required: true, description: 'DOI, e.g. 10.1101/2026.01.01.000001.' } },
      output: { schema: OUTPUT_SCHEMA, render: (_args: unknown, value: unknown) => text(renderPaper(value)) },
      async execute(args: { doi: string }) {
        return envelope(await paperTool(deps, args))
      },
    }),
    biorxiv_latest: defineTool({
      name: 'biorxiv_latest',
      description:
        'List the latest bioRxiv preprints for a date window and optional category, newest first. Read-only; uses the public bioRxiv latest feed.',
      parameters: {
        days: { type: 'number', description: 'Lookback window in days, 1–30 (default 3).' },
        limit: { type: 'number', description: 'Maximum results, 1–100 (default 20).' },
        category: { type: 'string', description: 'Optional bioRxiv category, e.g. neuroscience.' },
      },
      output: { schema: OUTPUT_SCHEMA, render: (_args: unknown, value: unknown) => text(renderLatest(value)) },
      async execute(args: { days?: number; limit?: number; category?: string }) {
        return envelope(await latestTool(deps, args))
      },
    }),
    biorxiv_export: defineTool({
      name: 'biorxiv_export',
      description:
        'Export search results or one DOI as JSON, Markdown, CSV or BibTeX. If out is given, writes inside the current working directory and refuses to overwrite unless force=true.',
      parameters: {
        query: { type: 'string', description: 'Topic query; required unless doi is given.' },
        doi: { type: 'string', description: 'Single DOI to export.' },
        dateFrom: { type: 'string', description: 'Start date YYYY-MM-DD (optional).' },
        dateTo: { type: 'string', description: 'End date YYYY-MM-DD (optional).' },
        limit: { type: 'number', description: 'Maximum records, 1–100 (default 100).' },
        format: { type: 'string', enum: ['json', 'markdown', 'csv', 'bibtex'], description: 'Output format (default bibtex).' },
        out: { type: 'string', description: 'Optional relative output path inside cwd.' },
        force: { type: 'boolean', description: 'Overwrite an existing output file (default false).' },
      },
      output: { schema: OUTPUT_SCHEMA, render: (_args: unknown, value: unknown) => text(renderExport(value)) },
      async execute(args: {
        query?: string
        doi?: string
        dateFrom?: string
        dateTo?: string
        limit?: number
        format?: 'json' | 'markdown' | 'csv' | 'bibtex'
        out?: string
        force?: boolean
      }) {
        return envelope(await exportTool(deps, args))
      },
    }),
    biorxiv_digest: defineTool({
      name: 'biorxiv_digest',
      description:
        'Build a structured markdown digest (titles, dates, DOIs, abstract previews) for a topic. Extractive only; no AI summary and no automatic delivery.',
      parameters: {
        topic: { type: 'string', required: true, description: 'Topic phrase; use | for synonyms.' },
        dateFrom: { type: 'string', description: 'Start date YYYY-MM-DD (optional).' },
        dateTo: { type: 'string', description: 'End date YYYY-MM-DD (optional).' },
        limit: { type: 'number', description: 'Maximum results, 1–100 (default 20).' },
        summary: { type: 'boolean', description: 'Generate Chinese summaries. Default false; sends public title/abstract to the configured model.' },
      },
      output: { schema: OUTPUT_SCHEMA, render: (_args: unknown, value: unknown) => text(renderDigest(value)) },
      async execute(args: { topic: string; dateFrom?: string; dateTo?: string; limit?: number; summary?: boolean }) {
        return envelope(await digestTool(deps, args))
      },
    }),
    biorxiv_trend: defineTool({
      name: 'biorxiv_trend',
      description:
        'Month-by-month preprint volume for a topic: one hit count per completed calendar month plus the month in progress, with month-over-month and window-wide change. Read-only; counts come from the Europe PMC bioRxiv preprint index.',
      parameters: {
        topic: { type: 'string', required: true, description: 'Topic phrase; use | for synonyms.' },
        months: { type: 'number', description: 'Completed months to look back, 1–12 (default 6).' },
        field: { type: 'string', enum: ['any', 'title', 'abstract'], description: 'Search field (default any).' },
      },
      output: { schema: OUTPUT_SCHEMA, render: (_args: unknown, value: unknown) => text(renderTrend(value)) },
      async execute(args: { topic: string; months?: number; field?: 'any' | 'title' | 'abstract' }) {
        return envelope(await trendTool(deps, args))
      },
    }),
  }
}
