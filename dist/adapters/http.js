/** Minimal HTTP JSON client: URL validation, timeout, bounded retries, size cap. */
import { HttpError } from "../core/errors.js";
import { InputError } from "../core/query.js";
export class TimeoutError extends Error {
    constructor(message = 'request timed out') {
        super(message);
        this.name = 'TimeoutError';
    }
}
export function validateHttpUrl(value) {
    let url;
    try {
        url = new URL(value);
    }
    catch {
        throw new InputError('URL must be absolute');
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:')
        throw new InputError('only http/https URLs are allowed');
    if (url.username !== '' || url.password !== '')
        throw new InputError('URL credentials are not allowed');
    return url.toString();
}
export function buildUrl(base, params) {
    const url = new URL(validateHttpUrl(base));
    for (const [key, value] of Object.entries(params)) {
        if (value !== undefined)
            url.searchParams.set(key, String(value));
    }
    return url.toString();
}
export class HttpClient {
    timeoutMs;
    retries;
    retryDelayMs;
    maxBytes;
    userAgent;
    fetchImpl;
    sleep;
    constructor(options = {}) {
        this.timeoutMs = options.timeoutMs ?? 10_000;
        this.retries = options.retries ?? 2;
        this.retryDelayMs = options.retryDelayMs ?? 250;
        this.maxBytes = options.maxBytes ?? 2_000_000;
        this.userAgent = options.userAgent ?? 'dsh-biorxiv/0.1 (DeepSeek Harness plugin)';
        this.fetchImpl = options.fetchImpl ?? fetch;
        this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    }
    retryable(status) {
        return status === 429 || status >= 500;
    }
    async getJson(value) {
        const url = validateHttpUrl(value);
        let lastError;
        for (let attempt = 0; attempt <= this.retries; attempt += 1) {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), this.timeoutMs);
            try {
                const response = await this.fetchImpl(url, {
                    headers: { accept: 'application/json', 'user-agent': this.userAgent },
                    signal: controller.signal,
                });
                if (!response.ok) {
                    const error = new HttpError(response.status);
                    if (this.retryable(response.status) && attempt < this.retries) {
                        lastError = error;
                        await this.sleep(this.retryDelayMs * (attempt + 1));
                        continue;
                    }
                    throw error;
                }
                const body = await response.text();
                if (Buffer.byteLength(body, 'utf8') > this.maxBytes)
                    throw new HttpError(413, 'response too large');
                return JSON.parse(body);
            }
            catch (error) {
                if (error instanceof SyntaxError)
                    throw error;
                if (controller.signal.aborted) {
                    lastError = new TimeoutError();
                    if (attempt < this.retries) {
                        await this.sleep(this.retryDelayMs * (attempt + 1));
                        continue;
                    }
                    throw lastError;
                }
                if (error instanceof HttpError) {
                    if (this.retryable(error.status) && attempt < this.retries) {
                        lastError = error;
                        await this.sleep(this.retryDelayMs * (attempt + 1));
                        continue;
                    }
                    throw error;
                }
                lastError = error;
                if (attempt < this.retries) {
                    await this.sleep(this.retryDelayMs * (attempt + 1));
                    continue;
                }
                throw error;
            }
            finally {
                clearTimeout(timer);
            }
        }
        throw lastError instanceof Error ? lastError : new Error('request failed');
    }
}
//# sourceMappingURL=http.js.map