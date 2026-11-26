/** Topic trend: month- or week-bucketed preprint volume from Europe PMC hit counts. */
import { type Result } from './errors.ts';
import { type QueryField } from './query.ts';
import type { ServiceDeps } from './service.ts';
export type TrendBucketKind = 'month' | 'week';
export interface TrendInput {
    topic: string;
    bucket?: TrendBucketKind;
    months?: number;
    weeks?: number;
    field?: QueryField;
}
export interface TrendBucket {
    label: string;
    dateFrom: string;
    dateTo: string;
    days: number;
    complete: boolean;
    count: number;
    perWeek: number;
}
export interface TrendChange {
    fromLabel: string;
    toLabel: string;
    fromCount: number;
    toCount: number;
    absolute: number;
    percent: number | null;
}
export interface TrendData {
    topic: string;
    bucket: TrendBucketKind;
    months?: number;
    weeks?: number;
    dateFrom: string;
    dateTo: string;
    buckets: TrendBucket[];
    total: number;
    peak: {
        label: string;
        count: number;
    };
    monthOverMonth?: TrendChange | null;
    weekOverWeek?: TrendChange | null;
    overall: TrendChange | null;
    note: string;
}
export declare function roundOut(value: number, digits: number): number;
export interface TrendSpan {
    label: string;
    dateFrom: string;
    dateTo: string;
    days: number;
    complete: boolean;
}
/** @deprecated kept for callers that still name the month-only shape; use `TrendSpan`. */
export type MonthSpan = TrendSpan;
/** Calendar-month spans for the window ending at `now`: completed months plus the running one. */
export declare function monthSpans(nowMs: number, months: number): TrendSpan[];
export declare function perWeek(count: number, days: number): number;
/**
 * ISO-8601 week label (`2026-W45`). The year shown is the ISO week-numbering
 * year, which only equals the calendar year when the week does not straddle
 * New Year — 2026-01-01 is `2026-W01` only if it falls in that week's Monday–Sunday.
 */
export declare function isoWeekLabel(day: Date): string;
/** ISO-week spans (Monday–Sunday) for the window ending at `now`: completed weeks plus the running one. */
export declare function weekSpans(nowMs: number, weeks: number): TrendSpan[];
export declare function changeOf(from: TrendBucket, to: TrendBucket): TrendChange;
export interface TrendSummary {
    dateFrom: string;
    dateTo: string;
    buckets: TrendBucket[];
    total: number;
    peak: {
        label: string;
        count: number;
    };
    /** Change between the last two completed buckets (month-over-month or week-over-week). */
    latest: TrendChange | null;
    overall: TrendChange | null;
}
export declare function summarise(buckets: TrendBucket[]): TrendSummary;
export declare function trendTool(deps: ServiceDeps, input: TrendInput): Promise<Result<TrendData>>;
//# sourceMappingURL=trend.d.ts.map