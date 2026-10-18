/** Deterministic, explainable relevance ranking and DOI deduplication. */
import type { Paper } from './types.ts';
export declare function normalizeDoi(doi: string): string;
export declare function relevanceScore(paper: Paper, terms: string[]): number;
export declare function dedupePapers(papers: Paper[]): Paper[];
export declare function rankPapers(papers: Paper[], terms: string[]): Paper[];
//# sourceMappingURL=rank.d.ts.map