/** Scriptable CLI logic, separated from the bin entrypoint for testability. */
import { type ServiceDeps } from '../../core/service.ts';
export interface CliStream {
    write: (text: string) => void;
    writeError: (text: string) => void;
}
export declare function runCli(argv: string[], deps?: ServiceDeps, stream?: CliStream): Promise<number>;
//# sourceMappingURL=run.d.ts.map