/** Optional Crossref/OpenAlex enrichment; failures never block the core result. */
import { buildStatus } from "../core/status.js";
function doiPath(doi) {
    return doi.trim().split('/').map(encodeURIComponent).join('/');
}
export async function fetchCrossrefJournal(client, doi) {
    if (doi.trim() === '')
        return '';
    try {
        const payload = await client.getJson(`https://api.crossref.org/works/${doiPath(doi)}`);
        const titles = payload.message?.['container-title'];
        if (!Array.isArray(titles))
            return '';
        const first = titles[0];
        return typeof first === 'string' ? first.trim() : '';
    }
    catch {
        return '';
    }
}
export async function fetchOpenAlexRetraction(client, doi) {
    if (doi.trim() === '')
        return null;
    try {
        const payload = await client.getJson(`https://api.openalex.org/works/doi:${doiPath(doi)}`);
        return typeof payload.is_retracted === 'boolean' ? payload.is_retracted : null;
    }
    catch {
        return null;
    }
}
export async function enrichStatus(client, doi, details) {
    if (details.length === 0)
        return null;
    const [journal, retracted] = await Promise.all([
        fetchCrossrefJournal(client, doi),
        fetchOpenAlexRetraction(client, doi),
    ]);
    return buildStatus(doi, details, { journal, retracted });
}
//# sourceMappingURL=status-enrichment.js.map