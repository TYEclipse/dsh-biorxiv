/** bioRxiv version selection and publication/retraction status. */
import type { PaperStatus } from './types.ts';
export interface BiorxivDetail {
    doi: string;
    title: string;
    authors: string;
    date: string;
    category: string;
    abstract: string;
    server: string;
    version?: string;
    published?: string;
}
export interface SelectedVersion {
    detail: BiorxivDetail;
    version: number;
    versionsCount: number;
}
export interface StatusOptions {
    journal?: string;
    retracted?: boolean | null;
}
export declare function pickLatestVersion(details: BiorxivDetail[]): SelectedVersion | null;
export declare function buildStatus(doi: string, details: BiorxivDetail[], options?: StatusOptions): PaperStatus | null;
//# sourceMappingURL=status.d.ts.map