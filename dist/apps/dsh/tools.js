/** dsh tool surface: four thin adapters over src/core/service.ts. */
import { defineTool } from '@deepseek-ai/dsh-tools';
import { digestTool } from "../../core/digest.js";
import { exportTool, latestTool, paperTool, searchTool } from "../../core/service.js";
import { trendTool } from "../../core/trend.js";
const EMPTY_ERROR = { code: '', message: '', retryable: false, hint: '' };
const OUTPUT_SCHEMA = {
    type: 'object',
    additionalProperties: false,
    properties: {
        ok: { type: 'boolean', required: true },
        data: { type: 'object', additionalProperties: true, required: true },
        error: {
            type: 'object',
            additionalProperties: false,
            required: true,
            properties: {
                code: { type: 'string', required: true },
                message: { type: 'string', required: true },
                retryable: { type: 'boolean', required: true },
                hint: { type: 'string', required: true },
            },
        },
        meta: {
            type: 'object',
            additionalProperties: false,
            required: true,
            properties: {
                requestId: { type: 'string', required: true },
                elapsedMs: { type: 'number', required: true },
                cached: { type: 'boolean', required: true },
                source: { type: 'array', items: { type: 'string' }, required: true },
                warnings: { type: 'array', items: { type: 'string' }, required: true },
            },
        },
    },
};
function envelope(result) {
    if (result.ok) {
        return {
            ok: true,
            data: result.data,
            error: { ...EMPTY_ERROR },
            meta: result.meta,
        };
    }
    return { ok: false, data: {}, error: result.error, meta: result.meta };
}
function text(value) {
    return [{ type: 'text', text: value }];
}
function renderSearch(value) {
    const result = value;
    if (!result.ok)
        return `${result.error.code}: ${result.error.message}`;
    const data = result.data;
    const items = data.items ?? [];
    const lines = [`${items.length} result(s) of ${data.hitCount ?? 0} for ${data.query ?? ''}`];
    for (const [index, paper] of items.slice(0, 5).entries()) {
        lines.push(`${index + 1}. ${paper.title ?? '(no title)'} — ${paper.doi ?? ''}`);
    }
    return lines.join('\n');
}
function renderPaper(value) {
    const result = value;
    if (!result.ok)
        return `${result.error.code}: ${result.error.message}`;
    const data = result.data;
    const lines = [
        `${data.title ?? '(no title)'}`,
        `DOI: ${data.doi ?? ''}`,
        `Version: ${data.version ?? 1} of ${data.versionsCount ?? 1}`,
    ];
    if ((data.publishedDoi ?? '') !== '')
        lines.push(`Published: ${data.publishedDoi}${data.journal ? ` (${data.journal})` : ''}`);
    if (data.retracted !== null && data.retracted !== undefined)
        lines.push(`Retracted: ${data.retracted ? 'yes' : 'no'}`);
    return lines.join('\n');
}
function renderLatest(value) {
    const result = value;
    if (!result.ok)
        return `${result.error.code}: ${result.error.message}`;
    const data = result.data;
    const items = data.items ?? [];
    return [`${items.length} latest preprint(s) in ${data.days ?? 0} day(s)`]
        .concat(items.slice(0, 10).map((paper, index) => `${index + 1}. ${paper.title ?? '(no title)'} — ${paper.doi ?? ''} (${paper.date ?? ''})`))
        .join('\n');
}
function renderExport(value) {
    const result = value;
    if (!result.ok)
        return `${result.error.code}: ${result.error.message}`;
    const data = result.data;
    return data.path
        ? `Exported ${data.count ?? 0} item(s) as ${data.format ?? ''} to ${data.path}`
        : `Exported ${data.count ?? 0} item(s) as ${data.format ?? ''} (inline content)`;
}
function renderDigest(value) {
    const result = value;
    if (!result.ok)
        return `${result.error.code}: ${result.error.message}`;
    const data = result.data;
    return data.markdown ?? `${data.count ?? 0} digest item(s)`;
}
function renderTrend(value) {
    const result = value;
    if (!result.ok)
        return `${result.error.code}: ${result.error.message}`;
    const data = result.data;
    const buckets = data.buckets ?? [];
    const lines = [`Trend for ${data.topic ?? ''} (${data.months ?? 0} month(s), ${data.dateFrom ?? ''} to ${data.dateTo ?? ''})`];
    for (const bucket of buckets) {
        lines.push(`${bucket.label ?? ''}${bucket.complete === false ? '*' : ''}  ${bucket.count ?? 0} · ${bucket.perWeek ?? 0}/week`);
    }
    lines.push(`Total (completed months only): ${data.total ?? 0}${data.peak?.label ? ` · peak ${data.peak.label} (${data.peak.count ?? 0})` : ''}`);
    const mom = data.monthOverMonth;
    if (mom !== undefined && mom !== null) {
        const percent = mom.percent === null || mom.percent === undefined ? 'baseline was 0' : `${mom.percent > 0 ? '+' : ''}${mom.percent}%`;
        lines.push(`Month over month: ${percent} (${mom.absolute ?? 0} preprint(s))`);
    }
    const overall = data.overall;
    if (overall !== undefined && overall !== null) {
        const percent = overall.percent === null || overall.percent === undefined ? 'baseline was 0' : `${overall.percent > 0 ? '+' : ''}${overall.percent}%`;
        lines.push(`Over the window: ${percent}`);
    }
    lines.push('* current month so far — excluded from total, peak and both changes');
    return lines.join('\n');
}
export function buildTools(deps) {
    return {
        biorxiv_search: defineTool({
            name: 'biorxiv_search',
            description: 'Search bioRxiv preprints by topic, optional date window and field. Returns a ranked list with DOI, title, authors, date and abstract. Read-only; no full-text PDF download.',
            parameters: {
                topic: { type: 'string', required: true, description: 'Topic phrase; use | to separate synonyms.' },
                dateFrom: { type: 'string', description: 'Start date YYYY-MM-DD (optional).' },
                dateTo: { type: 'string', description: 'End date YYYY-MM-DD (optional).' },
                limit: { type: 'number', description: 'Maximum results, 1–100 (default 20).' },
                field: { type: 'string', enum: ['any', 'title', 'abstract'], description: 'Search field (default any).' },
                minScore: { type: 'number', description: 'Minimum relevance score 0–10 (default 3; 0 disables filtering).' },
            },
            output: { schema: OUTPUT_SCHEMA, render: (_args, value) => text(renderSearch(value)) },
            async execute(args) {
                return envelope(await searchTool(deps, args));
            },
        }),
        biorxiv_paper: defineTool({
            name: 'biorxiv_paper',
            description: 'Look up one bioRxiv preprint by DOI: latest version, publication DOI/journal and retraction flag when available. Read-only; unknown optional status is reported as null.',
            parameters: { doi: { type: 'string', required: true, description: 'DOI, e.g. 10.1101/2026.01.01.000001.' } },
            output: { schema: OUTPUT_SCHEMA, render: (_args, value) => text(renderPaper(value)) },
            async execute(args) {
                return envelope(await paperTool(deps, args));
            },
        }),
        biorxiv_latest: defineTool({
            name: 'biorxiv_latest',
            description: 'List the latest bioRxiv preprints for a date window and optional category, newest first. Read-only; uses the public bioRxiv latest feed.',
            parameters: {
                days: { type: 'number', description: 'Lookback window in days, 1–30 (default 3).' },
                limit: { type: 'number', description: 'Maximum results, 1–100 (default 20).' },
                category: { type: 'string', description: 'Optional bioRxiv category, e.g. neuroscience.' },
            },
            output: { schema: OUTPUT_SCHEMA, render: (_args, value) => text(renderLatest(value)) },
            async execute(args) {
                return envelope(await latestTool(deps, args));
            },
        }),
        biorxiv_export: defineTool({
            name: 'biorxiv_export',
            description: 'Export search results or one DOI as JSON, Markdown, CSV or BibTeX. If out is given, writes inside the current working directory and refuses to overwrite unless force=true.',
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
            output: { schema: OUTPUT_SCHEMA, render: (_args, value) => text(renderExport(value)) },
            async execute(args) {
                return envelope(await exportTool(deps, args));
            },
        }),
        biorxiv_digest: defineTool({
            name: 'biorxiv_digest',
            description: 'Build a structured markdown digest (titles, dates, DOIs, abstract previews) for a topic. Extractive only; no AI summary and no automatic delivery.',
            parameters: {
                topic: { type: 'string', required: true, description: 'Topic phrase; use | for synonyms.' },
                dateFrom: { type: 'string', description: 'Start date YYYY-MM-DD (optional).' },
                dateTo: { type: 'string', description: 'End date YYYY-MM-DD (optional).' },
                limit: { type: 'number', description: 'Maximum results, 1–100 (default 20).' },
                summary: { type: 'boolean', description: 'Generate Chinese summaries. Default false; sends public title/abstract to the configured model.' },
            },
            output: { schema: OUTPUT_SCHEMA, render: (_args, value) => text(renderDigest(value)) },
            async execute(args) {
                return envelope(await digestTool(deps, args));
            },
        }),
        biorxiv_trend: defineTool({
            name: 'biorxiv_trend',
            description: 'Month-by-month preprint volume for a topic: one hit count per completed calendar month plus the month in progress, with month-over-month and window-wide change. Read-only; counts come from the Europe PMC bioRxiv preprint index.',
            parameters: {
                topic: { type: 'string', required: true, description: 'Topic phrase; use | for synonyms.' },
                months: { type: 'number', description: 'Completed months to look back, 1–12 (default 6).' },
                field: { type: 'string', enum: ['any', 'title', 'abstract'], description: 'Search field (default any).' },
            },
            output: { schema: OUTPUT_SCHEMA, render: (_args, value) => text(renderTrend(value)) },
            async execute(args) {
                return envelope(await trendTool(deps, args));
            },
        }),
    };
}
//# sourceMappingURL=tools.js.map