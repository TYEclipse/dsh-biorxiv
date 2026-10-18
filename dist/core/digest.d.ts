/** Structured daily digest. No AI summary is generated; the content is an extractive package. */
import { fail, type Result } from './errors.ts';
import { type ServiceDeps } from './service.ts';
import type { SummaryProvider } from './summary.ts';
import type { DigestData } from './types.ts';
export interface DigestInput {
    topic: string;
    dateFrom?: string;
    dateTo?: string;
    limit?: number;
    summary?: boolean;
}
export declare function digestTool(deps: ServiceDeps & {
    summarizer?: SummaryProvider;
}, input: DigestInput): Promise<Result<DigestData>>;
export { fail };
//# sourceMappingURL=digest.d.ts.map