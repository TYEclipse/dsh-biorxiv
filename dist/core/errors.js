/** Stable error codes and the result envelope shared by every entrypoint. */
export const ERROR_SPECS = {
    'E-001': { message: '参数不合法', retryable: false, hint: '检查主题、日期区间、limit 或 DOI 格式' },
    'E-002': { message: '未找到结果', retryable: false, hint: '换关键词或放宽日期范围' },
    'E-003': { message: '上游超时或被取消', retryable: true, hint: '稍后重试；缓存命中时可直接使用旧结果' },
    'E-004': { message: '上游限流', retryable: true, hint: '等待后重试，降低请求频率' },
    'E-005': { message: '上游服务异常', retryable: true, hint: '稍后重试；连续失败时检查上游状态' },
    'E-006': { message: '上游响应解析失败', retryable: false, hint: '记录响应片段并检查上游字段变化' },
    'E-007': { message: '配置不合法', retryable: false, hint: '检查配置文件或环境变量' },
    'E-008': { message: '缓存不可用', retryable: false, hint: '删除缓存文件后重建，或关闭缓存' },
    'E-009': { message: '写盘失败', retryable: false, hint: '检查目录权限、磁盘空间和路径' },
    'E-010': { message: '内部错误或版本不兼容', retryable: false, hint: '保留日志并报告版本信息' },
};
export class HttpError extends Error {
    status;
    constructor(status, message = `HTTP ${status}`) {
        super(message);
        this.name = 'HttpError';
        this.status = status;
    }
}
function requestId() {
    return `req_${globalThis.crypto.randomUUID()}`;
}
function meta(input = {}) {
    return {
        requestId: input.requestId ?? requestId(),
        elapsedMs: input.elapsedMs ?? 0,
        cached: input.cached ?? false,
        source: input.source ?? [],
        warnings: input.warnings ?? [],
    };
}
export function ok(data, input = {}) {
    return { ok: true, data, error: null, meta: meta(input) };
}
export function fail(code, input = {}) {
    const spec = ERROR_SPECS[code];
    return {
        ok: false,
        data: null,
        error: {
            code,
            message: input.message ?? spec.message,
            retryable: spec.retryable,
            hint: input.hint ?? spec.hint,
        },
        meta: meta(input),
    };
}
export function fromHttpStatus(status) {
    if (status === 429)
        return 'E-004';
    if (status >= 500)
        return 'E-005';
    if (status === 404)
        return 'E-002';
    return 'E-001';
}
export function normalizeError(error) {
    if (error instanceof HttpError) {
        const code = fromHttpStatus(error.status);
        const spec = ERROR_SPECS[code];
        return { code, message: spec.message, retryable: spec.retryable, hint: spec.hint };
    }
    if (error instanceof SyntaxError) {
        const spec = ERROR_SPECS['E-006'];
        return { code: 'E-006', message: spec.message, retryable: spec.retryable, hint: spec.hint };
    }
    if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
        const spec = ERROR_SPECS['E-003'];
        return { code: 'E-003', message: spec.message, retryable: spec.retryable, hint: spec.hint };
    }
    const spec = ERROR_SPECS['E-010'];
    return { code: 'E-010', message: spec.message, retryable: spec.retryable, hint: spec.hint };
}
//# sourceMappingURL=errors.js.map