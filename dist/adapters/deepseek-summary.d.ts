/** DeepSeek chat-completions summarizer; opt-in only, sends public metadata only. */
import type { SummaryInput, SummaryProvider } from '../core/summary.ts';
export interface DeepSeekSummaryOptions {
    apiKey: string;
    model?: string;
    baseUrl?: string;
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
}
export declare class DeepSeekSummaryProvider implements SummaryProvider {
    private readonly options;
    readonly name = "deepseek";
    private readonly model;
    private readonly baseUrl;
    private readonly fetchImpl;
    private readonly timeoutMs;
    constructor(options: DeepSeekSummaryOptions);
    summarize(input: SummaryInput): Promise<string>;
}
//# sourceMappingURL=deepseek-summary.d.ts.map