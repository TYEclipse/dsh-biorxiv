/** Topic trend: month-bucketed preprint volume from Europe PMC hit counts. */
import { hashCacheKey } from "../adapters/cache.js";
import { searchEuropePmc } from "../adapters/europepmc.js";
import { fail, fromHttpStatus, HttpError, ok } from "./errors.js";
import { buildQuery, InputError } from "./query.js";
const TTL_TREND = 24 * 60 * 60;
const MIN_MONTHS = 1;
const MAX_MONTHS = 12;
const NOTE = 'counts are Europe PMC hitCount for SRC:PPR + PUBLISHER:"bioRxiv", one query per calendar month; ' +
    'only completed months feed total, peak and both changes — the current month is listed with complete=false ' +
    'and perWeek normalises its shorter span; percent is null when the baseline month had zero hits.';
export function roundOut(value, digits) {
    const factor = 10 ** digits;
    const rounded = Math.round(value * factor) / factor;
    return Object.is(rounded, -0) ? 0 : rounded;
}
function ymd(year, monthIndex, day) {
    return new Date(Date.UTC(year, monthIndex, day)).toISOString().slice(0, 10);
}
function label(year, monthIndex) {
    const normalised = new Date(Date.UTC(year, monthIndex, 1));
    return `${normalised.getUTCFullYear()}-${String(normalised.getUTCMonth() + 1).padStart(2, '0')}`;
}
/** Calendar-month spans for the window ending at `now`: completed months plus the running one. */
export function monthSpans(nowMs, months) {
    const now = new Date(nowMs);
    const year = now.getUTCFullYear();
    const monthIndex = now.getUTCMonth();
    const spans = [];
    for (let offset = months; offset >= 1; offset -= 1) {
        const start = new Date(Date.UTC(year, monthIndex - offset, 1));
        const lastDay = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0));
        spans.push({
            label: label(start.getUTCFullYear(), start.getUTCMonth()),
            dateFrom: ymd(start.getUTCFullYear(), start.getUTCMonth(), 1),
            dateTo: ymd(lastDay.getUTCFullYear(), lastDay.getUTCMonth(), lastDay.getUTCDate()),
            days: lastDay.getUTCDate(),
            complete: true,
        });
    }
    const elapsed = now.getUTCDate();
    spans.push({
        label: label(year, monthIndex),
        dateFrom: ymd(year, monthIndex, 1),
        dateTo: ymd(year, monthIndex, elapsed),
        days: elapsed,
        complete: false,
    });
    return spans;
}
export function perWeek(count, days) {
    if (days <= 0)
        return 0;
    return roundOut((count * 7) / days, 2);
}
export function changeOf(from, to) {
    const absolute = to.count - from.count;
    const percent = from.count === 0 ? null : roundOut((absolute / from.count) * 100, 1);
    return {
        fromLabel: from.label,
        toLabel: to.label,
        fromCount: from.count,
        toCount: to.count,
        absolute,
        percent,
    };
}
export function summarise(buckets, months) {
    const completed = buckets.filter((bucket) => bucket.complete);
    const total = completed.reduce((sum, bucket) => sum + bucket.count, 0);
    let peak = { label: '', count: -1 };
    for (const bucket of completed) {
        if (bucket.count > peak.count)
            peak = { label: bucket.label, count: bucket.count };
    }
    const last = completed.length >= 2 ? completed[completed.length - 1] : undefined;
    const previous = completed.length >= 2 ? completed[completed.length - 2] : undefined;
    const first = completed.length >= 2 ? completed[0] : undefined;
    return {
        months,
        dateFrom: buckets[0]?.dateFrom ?? '',
        dateTo: buckets[buckets.length - 1]?.dateTo ?? '',
        buckets,
        total,
        peak: last === undefined ? { label: '', count: 0 } : peak,
        monthOverMonth: last !== undefined && previous !== undefined ? changeOf(previous, last) : null,
        overall: last !== undefined && first !== undefined ? changeOf(first, last) : null,
        note: NOTE,
    };
}
function codeOf(error) {
    if (error instanceof InputError)
        return 'E-001';
    if (error instanceof HttpError)
        return fromHttpStatus(error.status);
    if (error instanceof SyntaxError)
        return 'E-006';
    if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError'))
        return 'E-003';
    return 'E-010';
}
export async function trendTool(deps, input) {
    const now = deps.now ?? Date.now;
    const started = now();
    const months = input.months ?? 6;
    try {
        if (!Number.isInteger(months) || months < MIN_MONTHS || months > MAX_MONTHS) {
            throw new InputError(`months must be an integer between ${MIN_MONTHS} and ${MAX_MONTHS}`);
        }
        const spans = monthSpans(started, months);
        const built = buildQuery({ topic: input.topic, field: input.field, limit: 1 });
        const key = hashCacheKey({
            kind: 'trend',
            query: built.query,
            months,
            window: spans[0]?.dateFrom ?? '',
        });
        const cached = await deps.cache.get(key).catch(() => null);
        if (cached !== null && cached !== undefined) {
            return ok(cached, { elapsedMs: Math.max(0, now() - started), source: ['cache'], cached: true });
        }
        const buckets = [];
        for (const span of spans) {
            const scoped = buildQuery({
                topic: input.topic,
                field: input.field,
                limit: 1,
                dateFrom: span.dateFrom,
                dateTo: span.dateTo,
            });
            const found = await searchEuropePmc(deps.client, scoped);
            buckets.push({ ...span, count: found.hitCount, perWeek: perWeek(found.hitCount, span.days) });
        }
        const data = { topic: input.topic, ...summarise(buckets, months) };
        await deps.cache.set(key, data, TTL_TREND).catch(() => undefined);
        return ok(data, { elapsedMs: Math.max(0, now() - started), source: ['europepmc'], cached: false });
    }
    catch (error) {
        const code = codeOf(error);
        return fail(code, {
            elapsedMs: Math.max(0, now() - started),
            source: ['europepmc'],
            message: error instanceof Error ? error.message : undefined,
        });
    }
}
//# sourceMappingURL=trend.js.map