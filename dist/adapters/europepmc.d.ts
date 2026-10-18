/** Europe PMC search adapter (bioRxiv preprints are indexed with SRC:PPR). */
import type { BuiltQuery } from '../core/query.ts';
import type { SearchData } from '../core/types.ts';
export interface JsonClient {
    getJson<T>(url: string): Promise<T>;
}
export declare function stripHtml(value: string): string;
export declare function searchEuropePmc(client: JsonClient, input: BuiltQuery): Promise<SearchData>;
//# sourceMappingURL=europepmc.d.ts.map