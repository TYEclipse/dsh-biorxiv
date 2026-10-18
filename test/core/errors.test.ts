import { describe, expect, it } from 'vitest'
import {
  ERROR_SPECS,
  HttpError,
  fail,
  fromHttpStatus,
  normalizeError,
  ok,
  type ErrorCode,
} from '../../src/core/errors.ts'

describe('result envelope', () => {
  it('builds a success envelope with a complete meta object', () => {
    const result = ok({ count: 1 }, { requestId: 'req_test', elapsedMs: 12, cached: false, source: ['europepmc'] })
    expect(result.ok).toBe(true)
    expect(result.data).toEqual({ count: 1 })
    expect(result.error).toBeNull()
    expect(result.meta).toEqual({
      requestId: 'req_test',
      elapsedMs: 12,
      cached: false,
      source: ['europepmc'],
      warnings: [],
    })
  })

  it('builds a failure envelope with code, message, retryable and hint', () => {
    const result = fail('E-004', { requestId: 'req_fail' })
    expect(result.ok).toBe(false)
    expect(result.data).toBeNull()
    expect(result.error?.code).toBe('E-004')
    expect(result.error?.message).toContain('限流')
    expect(result.error?.retryable).toBe(true)
    expect(result.error?.hint).not.toBe('')
    expect(result.meta.requestId).toBe('req_fail')
  })
})

describe('error registry', () => {
  it('covers E-001 through E-010 exactly once', () => {
    const codes = Object.keys(ERROR_SPECS) as ErrorCode[]
    expect(codes).toEqual(['E-001', 'E-002', 'E-003', 'E-004', 'E-005', 'E-006', 'E-007', 'E-008', 'E-009', 'E-010'])
  })

  it('marks only transient failures retryable', () => {
    expect(ERROR_SPECS['E-003'].retryable).toBe(true)
    expect(ERROR_SPECS['E-004'].retryable).toBe(true)
    expect(ERROR_SPECS['E-005'].retryable).toBe(true)
    expect(ERROR_SPECS['E-001'].retryable).toBe(false)
    expect(ERROR_SPECS['E-006'].retryable).toBe(false)
    expect(ERROR_SPECS['E-007'].retryable).toBe(false)
  })
})

describe('error mapping', () => {
  it('maps HTTP statuses to stable error codes', () => {
    expect(fromHttpStatus(429)).toBe('E-004')
    expect(fromHttpStatus(500)).toBe('E-005')
    expect(fromHttpStatus(502)).toBe('E-005')
    expect(fromHttpStatus(404)).toBe('E-002')
    expect(fromHttpStatus(400)).toBe('E-001')
  })

  it('normalizes an HttpError without leaking a stack', () => {
    const detail = normalizeError(new HttpError(429, 'too many requests'))
    expect(detail.code).toBe('E-004')
    expect(detail.retryable).toBe(true)
    expect(detail.message).toContain('限流')
    expect(JSON.stringify(detail)).not.toContain('at ')
  })

  it('normalizes timeout and parse failures', () => {
    expect(normalizeError(Object.assign(new Error('timed out'), { name: 'TimeoutError' })).code).toBe('E-003')
    expect(normalizeError(new SyntaxError('bad json')).code).toBe('E-006')
    expect(normalizeError(new Error('unknown')).code).toBe('E-010')
  })
})
