/** Topic trend: month-bucketed preprint volume from Europe PMC hit counts. */
import { type Result } from './errors.ts';
import { type QueryField } from './query.ts';
import type { ServiceDeps } from './service.ts';
export interface TrendInput {
    topic: string;
    months?: number;
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
    months: number;
    dateFrom: string;
    dateTo: string;
    buckets: TrendBucket[];
    total: number;
    peak: {
        label: string;
        count: number;
    };
    monthOverMonth: TrendChange | null;
    overall: TrendChange | null;
    note: string;
}
export declare function roundOut(value: number, digits: number): number;
export interface MonthSpan {
    label: string;
    dateFrom: string;
    dateTo: string;
    days: number;
    complete: boolean;
}
/** Calendar-month spans for the window ending at `now`: completed months plus the running one. */
export declare function monthSpans(nowMs: number, months: number): MonthSpan[];
export declare function perWeek(count: number, days: number): number;
export declare function changeOf(from: TrendBucket, to: TrendBucket): TrendChange;
export declare function summarise(buckets: TrendBucket[], months: number): Omit<TrendData, 'topic'>;
export declare function trendTool(deps: ServiceDeps, input: TrendInput): Promise<Result<TrendData>>;
//# sourceMappingURL=trend.d.ts.map