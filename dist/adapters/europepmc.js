/** Europe PMC search adapter (bioRxiv preprints are indexed with SRC:PPR). */
import { buildUrl } from "./http.js";
const SEARCH_URL = 'https://www.ebi.ac.uk/europepmc/webservices/rest/search';
export function stripHtml(value) {
    return value
        .replace(/<[^>]*>/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\s+/g, ' ')
        .trim();
}
function stringOrEmpty(value) {
    return typeof value === 'string' ? value.trim() : '';
}
function numberOrZero(value) {
    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}
function toPaper(result) {
    const doi = stringOrEmpty(result.doi);
    if (doi === '')
        return null;
    const publisher = stringOrEmpty(result.bookOrReportDetails?.publisher);
    return {
        doi,
        title: stringOrEmpty(result.title),
        authors: stringOrEmpty(result.authorString),
        date: stringOrEmpty(result.firstPublicationDate),
        abstract: stripHtml(stringOrEmpty(result.abstractText)),
        cited: numberOrZero(result.citedByCount),
        category: '',
        server: publisher === '' ? 'bioRxiv' : publisher,
        url: `https://doi.org/${doi}`,
    };
}
export async function searchEuropePmc(client, input) {
    const url = buildUrl(SEARCH_URL, {
        query: input.query,
        format: 'json',
        resultType: 'core',
        pageSize: Math.min(Math.max(input.limit * 3, input.limit), 100),
    });
    const payload = await client.getJson(url);
    if (payload === null ||
        typeof payload !== 'object' ||
        typeof payload.hitCount !== 'number' ||
        payload.resultList === null ||
        typeof payload.resultList !== 'object' ||
        !Array.isArray(payload.resultList.result)) {
        throw new SyntaxError('invalid Europe PMC response');
    }
    const items = [];
    for (const raw of payload.resultList.result) {
        if (raw === null || typeof raw !== 'object')
            continue;
        const paper = toPaper(raw);
        if (paper !== null)
            items.push(paper);
    }
    return { query: input.query, hitCount: payload.hitCount, items };
}
//# sourceMappingURL=europepmc.js.map