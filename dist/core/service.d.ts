/** Four user-facing operations; every entrypoint calls these and nothing else. */
import { type CacheStore } from '../adapters/cache.ts';
import { type JsonClient } from '../adapters/europepmc.ts';
import { type Result } from './errors.ts';
import { type QueryField } from './query.ts';
import { buildStatus } from './status.ts';
import type { SummaryProvider } from './summary.ts';
import type { ExportData, ExportFormat, LatestData, PaperDetail, SearchData } from './types.ts';
export interface ServiceDeps {
    client: JsonClient;
    cache: CacheStore;
    now?: () => number;
    cwd?: string;
    summarizer?: SummaryProvider;
}
export interface SearchInput {
    topic: string;
    dateFrom?: string;
    dateTo?: string;
    limit?: number;
    field?: QueryField;
    minScore?: number;
}
export interface PaperInput {
    doi: string;
}
export interface LatestInput {
    days?: number;
    limit?: number;
    category?: string;
}
export interface ExportInput {
    query?: string;
    doi?: string;
    dateFrom?: string;
    dateTo?: string;
    limit?: number;
    format?: ExportFormat;
    out?: string;
    force?: boolean;
}
export declare function searchTool(deps: ServiceDeps, input: SearchInput): Promise<Result<SearchData>>;
export declare function paperTool(deps: ServiceDeps, input: PaperInput): Promise<Result<PaperDetail>>;
export declare function latestTool(deps: ServiceDeps, input: LatestInput): Promise<Result<LatestData>>;
export declare function exportTool(deps: ServiceDeps, input: ExportInput): Promise<Result<ExportData>>;
export { buildStatus };
//# sourceMappingURL=service.d.ts.map