/** Minimal HTTP JSON client: URL validation, timeout, bounded retries, size cap. */
export interface HttpClientOptions {
    timeoutMs?: number;
    retries?: number;
    retryDelayMs?: number;
    maxBytes?: number;
    userAgent?: string;
    fetchImpl?: typeof fetch;
    sleep?: (ms: number) => Promise<void>;
}
export declare class TimeoutError extends Error {
    constructor(message?: string);
}
export declare function validateHttpUrl(value: string): string;
export declare function buildUrl(base: string, params: Record<string, string | number | undefined>): string;
export declare class HttpClient {
    private readonly timeoutMs;
    private readonly retries;
    private readonly retryDelayMs;
    private readonly maxBytes;
    private readonly userAgent;
    private readonly fetchImpl;
    private readonly sleep;
    constructor(options?: HttpClientOptions);
    private retryable;
    getJson<T>(value: string): Promise<T>;
}
//# sourceMappingURL=http.d.ts.map