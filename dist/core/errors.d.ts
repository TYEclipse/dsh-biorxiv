/** Stable error codes and the result envelope shared by every entrypoint. */
export type ErrorCode = 'E-001' | 'E-002' | 'E-003' | 'E-004' | 'E-005' | 'E-006' | 'E-007' | 'E-008' | 'E-009' | 'E-010';
export interface ErrorSpec {
    message: string;
    retryable: boolean;
    hint: string;
}
export declare const ERROR_SPECS: Record<ErrorCode, ErrorSpec>;
export interface AppErrorDetail {
    code: ErrorCode;
    message: string;
    retryable: boolean;
    hint: string;
}
export interface Meta {
    requestId: string;
    elapsedMs: number;
    cached: boolean;
    source: string[];
    warnings: string[];
}
export interface MetaInput {
    requestId?: string;
    elapsedMs?: number;
    cached?: boolean;
    source?: string[];
    warnings?: string[];
}
export type Result<T> = {
    ok: true;
    data: T;
    error: null;
    meta: Meta;
} | {
    ok: false;
    data: null;
    error: AppErrorDetail;
    meta: Meta;
};
export declare class HttpError extends Error {
    readonly status: number;
    constructor(status: number, message?: string);
}
export declare function ok<T>(data: T, input?: MetaInput): Result<T>;
export declare function fail(code: ErrorCode, input?: MetaInput & {
    message?: string;
    hint?: string;
}): Result<never>;
export declare function fromHttpStatus(status: number): ErrorCode;
export declare function normalizeError(error: unknown): AppErrorDetail;
//# sourceMappingURL=errors.d.ts.map