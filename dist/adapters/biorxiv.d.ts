/** bioRxiv API adapter for version details and the latest-preprint stream. */
import type { BiorxivDetail } from '../core/status.ts';
import type { Paper } from '../core/types.ts';
import type { JsonClient } from './europepmc.ts';
export declare function fetchBiorxivDetails(client: JsonClient, doi: string): Promise<BiorxivDetail[]>;
export declare function fetchLatestBiorxiv(client: JsonClient, options: {
    days: number;
    limit: number;
    category?: string;
    today?: Date;
}): Promise<Paper[]>;
//# sourceMappingURL=biorxiv.d.ts.map