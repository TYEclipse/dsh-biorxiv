/** Optional AI summary contract. Disabled by default; only public title/abstract is sent. */
export interface SummaryInput {
    doi: string;
    title: string;
    abstract: string;
}
export interface SummaryProvider {
    name: string;
    summarize(input: SummaryInput): Promise<string>;
}
//# sourceMappingURL=summary.d.ts.map