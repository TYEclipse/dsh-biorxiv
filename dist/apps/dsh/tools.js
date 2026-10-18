/** dsh tool surface: four thin adapters over src/core/service.ts. */
import { defineTool } from '@deepseek-ai/dsh-tools';
import { digestTool } from "../../core/digest.js";
import { exportTool, latestTool, paperTool, searchTool } from "../../core/service.js";
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
    };
}
//# sourceMappingURL=tools.js.map