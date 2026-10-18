/** Safe export-file writing: stay inside the working directory, never overwrite by default. */
export declare class FileError extends Error {
    readonly code = "E-009";
    constructor(message: string);
}
export interface WriteOptions {
    cwd?: string;
    force?: boolean;
}
export declare function writeExportFile(filePath: string, content: string, options?: WriteOptions): Promise<string>;
//# sourceMappingURL=files.d.ts.map