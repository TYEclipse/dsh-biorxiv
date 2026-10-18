/** Deterministic exporters: JSON, Markdown, CSV and BibTeX. */
import type { ExportFormat, Paper } from './types.ts';
export interface ExportResult {
    format: ExportFormat;
    content: string;
    count: number;
    extension: string;
}
export declare function toBibtex(paper: Paper, index?: number): string;
export declare function toCsv(papers: Paper[]): string;
export declare function toMarkdown(papers: Paper[]): string;
export declare function exportPapers(papers: Paper[], format: ExportFormat): ExportResult;
//# sourceMappingURL=export.d.ts.map