/** Four user-facing operations; every entrypoint calls these and nothing else. */
import { hashCacheKey } from "../adapters/cache.js";
import { fetchBiorxivDetails, fetchLatestBiorxiv } from "../adapters/biorxiv.js";
import { searchEuropePmc } from "../adapters/europepmc.js";
import { enrichStatus } from "../adapters/status-enrichment.js";
import { fail, fromHttpStatus, HttpError, ok } from "./errors.js";
import { exportPapers } from "./export.js";
import { FileError, writeExportFile } from "./files.js";
import { buildQuery, InputError } from "./query.js";
import { normalizeDoi, rankPapers } from "./rank.js";
import { buildStatus, pickLatestVersion } from "./status.js";
const TTL_SEARCH = 24 * 60 * 60;
const TTL_PAPER = 7 * 24 * 60 * 60;
const DEFAULT_MIN_SCORE = 3;
const DOI_RE = /^10\.\d{4,9}\/\S+$/;
function errorCode(error) {
    if (error instanceof InputError)
        return 'E-001';
    if (error instanceof HttpError)
        return fromHttpStatus(error.status);
    if (error instanceof SyntaxError)
        return 'E-006';
    if (error instanceof FileError)
        return 'E-009';
    if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError'))
        return 'E-003';
    return 'E-010';
}
function failure(error, started, now, source) {
    return fail(errorCode(error), {
        elapsedMs: Math.max(0, now() - started),
        source,
        message: error instanceof Error ? error.message : undefined,
    });
}
function meta(started, now, source, cached = false) {
    return { elapsedMs: Math.max(0, now() - started), source, cached };
}
async function cacheGet(cache, key) {
    try {
        return await cache.get(key);
    }
    catch {
        return null;
    }
}
async function cacheSet(cache, key, value, ttl) {
    try {
        await cache.set(key, value, ttl);
    }
    catch {
        // Cache failure must not discard a valid upstream result.
    }
}
export async function searchTool(deps, input) {
    const started = (deps.now ?? Date.now)();
    try {
        const built = buildQuery(input);
        const minScore = input.minScore ?? DEFAULT_MIN_SCORE;
        if (!Number.isInteger(minScore) || minScore < 0 || minScore > 10) {
            throw new InputError('minScore must be an integer between 0 and 10');
        }
        const key = hashCacheKey({ kind: 'search', query: built.query, limit: built.limit, rank: 1, minScore });
        const cached = await cacheGet(deps.cache, key);
        if (cached !== null) {
            return ok({ query: built.query, ...cached }, meta(started, deps.now ?? Date.now, ['cache'], true));
        }
        const raw = await searchEuropePmc(deps.client, built);
        const ranked = rankPapers(raw.items, built.terms);
        const filtered = ranked.filter((paper) => (paper.score ?? 0) >= minScore);
        const data = {
            query: built.query,
            hitCount: raw.hitCount,
            items: filtered.slice(0, built.limit),
        };
        await cacheSet(deps.cache, key, { hitCount: data.hitCount, items: data.items }, TTL_SEARCH);
        return ok(data, meta(started, deps.now ?? Date.now, ['europepmc']));
    }
    catch (error) {
        return failure(error, started, deps.now ?? Date.now, ['europepmc']);
    }
}
export async function paperTool(deps, input) {
    const started = (deps.now ?? Date.now)();
    try {
        const doi = normalizeDoi(input.doi);
        if (!DOI_RE.test(doi))
            throw new InputError('DOI must look like 10.xxxx/…');
        const key = hashCacheKey({ kind: 'paper', doi });
        const cached = await cacheGet(deps.cache, key);
        if (cached !== null)
            return ok(cached, meta(started, deps.now ?? Date.now, ['cache'], true));
        const details = await fetchBiorxivDetails(deps.client, doi);
        if (details.length === 0) {
            return fail('E-002', meta(started, deps.now ?? Date.now, ['biorxiv']));
        }
        const selected = pickLatestVersion(details);
        if (selected === null)
            return fail('E-002', meta(started, deps.now ?? Date.now, ['biorxiv']));
        const status = await enrichStatus(deps.client, doi, details);
        const data = {
            ...selected.detail,
            doi,
            cited: 0,
            version: status?.version ?? selected.version,
            versionsCount: status?.versionsCount ?? selected.versionsCount,
            publishedDoi: status?.publishedDoi ?? '',
            journal: status?.journal ?? '',
            retracted: status?.retracted ?? null,
            url: `https://doi.org/${doi}`,
        };
        await cacheSet(deps.cache, key, data, TTL_PAPER);
        return ok(data, meta(started, deps.now ?? Date.now, ['biorxiv', 'crossref', 'openalex']));
    }
    catch (error) {
        return failure(error, started, deps.now ?? Date.now, ['biorxiv']);
    }
}
export async function latestTool(deps, input) {
    const started = (deps.now ?? Date.now)();
    try {
        const days = input.days ?? 3;
        const limit = input.limit ?? 20;
        const category = (input.category ?? '').trim();
        if (!Number.isInteger(days) || days < 1 || days > 30)
            throw new InputError('days must be an integer between 1 and 30');
        if (!Number.isInteger(limit) || limit < 1 || limit > 100)
            throw new InputError('limit must be an integer between 1 and 100');
        if (category.length > 100)
            throw new InputError('category must be at most 100 characters');
        const key = hashCacheKey({ kind: 'latest', days, limit, category });
        const cached = await cacheGet(deps.cache, key);
        if (cached !== null)
            return ok(cached, meta(started, deps.now ?? Date.now, ['cache'], true));
        const items = await fetchLatestBiorxiv(deps.client, { days, limit, category: category === '' ? undefined : category });
        const data = { category, days, items };
        await cacheSet(deps.cache, key, data, TTL_SEARCH);
        return ok(data, meta(started, deps.now ?? Date.now, ['biorxiv']));
    }
    catch (error) {
        return failure(error, started, deps.now ?? Date.now, ['biorxiv']);
    }
}
export async function exportTool(deps, input) {
    const started = (deps.now ?? Date.now)();
    try {
        const format = input.format ?? 'bibtex';
        if (!['json', 'markdown', 'csv', 'bibtex'].includes(format))
            throw new InputError('unsupported export format');
        let papers;
        if (input.doi !== undefined && input.doi.trim() !== '') {
            const paper = await paperTool(deps, { doi: input.doi });
            if (!paper.ok)
                return paper;
            papers = [paper.data];
        }
        else {
            if (input.query === undefined || input.query.trim() === '')
                throw new InputError('query or doi is required');
            const search = await searchTool(deps, {
                topic: input.query,
                dateFrom: input.dateFrom,
                dateTo: input.dateTo,
                limit: input.limit ?? 100,
            });
            if (!search.ok)
                return search;
            papers = search.data.items;
        }
        const exported = exportPapers(papers, format);
        let path = '';
        if (input.out !== undefined && input.out.trim() !== '') {
            path = await writeExportFile(input.out, exported.content, { cwd: deps.cwd, force: input.force });
        }
        return ok({ format: exported.format, count: exported.count, path, content: exported.content }, meta(started, deps.now ?? Date.now, ['export']));
    }
    catch (error) {
        return failure(error, started, deps.now ?? Date.now, ['export']);
    }
}
export { buildStatus };
//# sourceMappingURL=service.js.map