/** dsh-biorxiv plugin entry: config, dependency wiring, and tool registration. */
import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import { type CacheMode } from './adapters/cache.ts';
import { buildTools, type ToolSet } from './apps/dsh/tools.ts';
import type { ServiceDeps } from './core/service.ts';
export declare const name = "dsh-biorxiv";
export declare const inject: string[];
export interface Config {
    cachePath?: string;
    cacheMode?: CacheMode;
    timeoutMs?: number;
    retries?: number;
    maxBytes?: number;
    userAgent?: string;
    summaryEnabled?: boolean;
    summaryModel?: string;
    summaryBaseUrl?: string;
    summaryApiKeyEnv?: string;
}
export declare const Config: z<Schemastery.ObjectS<NoInfer<{
    cachePath: z<string, string, "defined">;
    cacheMode: z<string, string, "defined">;
    timeoutMs: z<number, number, "defined">;
    retries: z<number, number, "defined">;
    maxBytes: z<number, number, "defined">;
    userAgent: z<string, string, "defined">;
    summaryEnabled: z<boolean, boolean, "defined">;
    summaryModel: z<string, string, "defined">;
    summaryBaseUrl: z<string, string, "defined">;
    summaryApiKeyEnv: z<string, string, "defined">;
}>>, Schemastery.ObjectT<NoInfer<{
    cachePath: z<string, string, "defined">;
    cacheMode: z<string, string, "defined">;
    timeoutMs: z<number, number, "defined">;
    retries: z<number, number, "defined">;
    maxBytes: z<number, number, "defined">;
    userAgent: z<string, string, "defined">;
    summaryEnabled: z<boolean, boolean, "defined">;
    summaryModel: z<string, string, "defined">;
    summaryBaseUrl: z<string, string, "defined">;
    summaryApiKeyEnv: z<string, string, "defined">;
}>>, "plain">;
export interface ResolvedConfig {
    cachePath: string;
    cacheMode: CacheMode;
    timeoutMs: number;
    retries: number;
    maxBytes: number;
    userAgent: string;
    summaryEnabled: boolean;
    summaryModel: string;
    summaryBaseUrl: string;
    summaryApiKeyEnv: string;
}
export declare function resolveConfig(config?: Config): ResolvedConfig;
export declare function createDeps(config?: Config, env?: NodeJS.ProcessEnv): ServiceDeps;
export declare function apply(ctx: Context, config: Config): void;
export { buildTools };
export type { ToolSet };
//# sourceMappingURL=index.d.ts.map