/** Optional Crossref/OpenAlex enrichment; failures never block the core result. */
import type { JsonClient } from './europepmc.ts';
import { type BiorxivDetail } from '../core/status.ts';
import type { PaperStatus } from '../core/types.ts';
export declare function fetchCrossrefJournal(client: JsonClient, doi: string): Promise<string>;
export declare function fetchOpenAlexRetraction(client: JsonClient, doi: string): Promise<boolean | null>;
export declare function enrichStatus(client: JsonClient, doi: string, details: BiorxivDetail[]): Promise<PaperStatus | null>;
//# sourceMappingURL=status-enrichment.d.ts.map