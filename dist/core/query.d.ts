/** Query construction for Europe PMC's bioRxiv preprint index. */
export type QueryField = 'any' | 'title' | 'abstract';
export interface QueryInput {
    topic: string;
    dateFrom?: string;
    dateTo?: string;
    authors?: string[];
    limit?: number;
    field?: QueryField;
    preprintsOnly?: boolean;
}
export interface BuiltQuery {
    query: string;
    terms: string[];
    limit: number;
}
export declare class InputError extends Error {
    readonly code = "E-001";
    constructor(message: string);
}
export declare function splitTerms(topic: string): string[];
export declare function buildQuery(input: QueryInput): BuiltQuery;
//# sourceMappingURL=query.d.ts.map