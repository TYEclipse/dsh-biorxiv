/** Safe export-file writing: stay inside the working directory, never overwrite by default. */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { InputError } from "./query.js";
export class FileError extends Error {
    code = 'E-009';
    constructor(message) {
        super(`E-009: ${message}`);
        this.name = 'FileError';
    }
}
export async function writeExportFile(filePath, content, options = {}) {
    if (filePath.trim() === '')
        throw new InputError('out path must not be empty');
    const cwd = resolve(options.cwd ?? process.cwd());
    const target = resolve(cwd, filePath);
    if (target !== cwd && !target.startsWith(`${cwd}${sep}`)) {
        throw new InputError('out path must stay inside the working directory');
    }
    await mkdir(dirname(target), { recursive: true, mode: 0o700 });
    try {
        await writeFile(target, content, { encoding: 'utf8', mode: 0o600, flag: options.force === true ? 'w' : 'wx' });
    }
    catch (error) {
        const code = error.code;
        if (code === 'EEXIST')
            throw new FileError('file already exists; pass force=true to overwrite');
        throw new FileError(error instanceof Error ? error.message : 'write failed');
    }
    return target;
}
//# sourceMappingURL=files.js.map