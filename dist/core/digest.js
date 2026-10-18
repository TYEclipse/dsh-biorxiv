/** Structured daily digest. No AI summary is generated; the content is an extractive package. */
import { fail, ok } from "./errors.js";
import { searchTool } from "./service.js";
function renderMarkdown(topic, query, generatedAt, items) {
    const header = [
        '# bioRxiv digest',
        '',
        `Topic: ${topic}`,
        `Query: ${query}`,
        `Generated: ${generatedAt}`,
        `Results: ${items.length}`,
        '',
    ];
    if (items.length === 0)
        return `${header.join('\n')}No results.\n`;
    const body = items.map((paper) => {
        const lines = [`- **${paper.title}**${paper.date === '' ? '' : ` (${paper.date})`}`];
        if (paper.authors !== '')
            lines.push(`  Authors: ${paper.authors}`);
        lines.push(`  DOI: ${paper.doi}`);
        if (paper.abstract !== '')
            lines.push(`  Abstract: ${paper.abstract.slice(0, 500)}${paper.abstract.length > 500 ? '…' : ''}`);
        if (paper.summary !== undefined && paper.summary !== '') {
            lines.push(`  Summary (machine-generated, verify against the abstract): ${paper.summary}`);
        }
        return lines.join('\n');
    });
    return `${header.join('\n')}${body.join('\n')}\n`;
}
export async function digestTool(deps, input) {
    const started = (deps.now ?? Date.now)();
    const search = await searchTool(deps, {
        topic: input.topic,
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
        limit: input.limit ?? 20,
    });
    if (!search.ok)
        return search;
    const warnings = [];
    let items = search.data.items;
    if (input.summary === true) {
        if (deps.summarizer === undefined) {
            warnings.push('summary provider is not configured; no summaries generated');
        }
        else {
            const withSummaries = [];
            for (const paper of items) {
                try {
                    const summary = await deps.summarizer.summarize({ doi: paper.doi, title: paper.title, abstract: paper.abstract });
                    withSummaries.push({ ...paper, summary });
                }
                catch {
                    warnings.push(`summary failed for ${paper.doi}`);
                    withSummaries.push(paper);
                }
            }
            items = withSummaries;
        }
    }
    const generatedAt = new Date((deps.now ?? Date.now)()).toISOString();
    const data = {
        topic: input.topic.trim(),
        query: search.data.query,
        count: items.length,
        generatedAt,
        items,
        markdown: renderMarkdown(input.topic.trim(), search.data.query, generatedAt, items),
    };
    return ok(data, {
        elapsedMs: Math.max(0, (deps.now ?? Date.now)() - started),
        source: search.meta.source,
        cached: search.meta.cached,
        warnings,
    });
}
export { fail };
//# sourceMappingURL=digest.js.map