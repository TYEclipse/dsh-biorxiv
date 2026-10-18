import { createServer, type Server } from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { HttpClient, buildUrl, validateHttpUrl } from '../../src/adapters/http.ts'
import { HttpError } from '../../src/core/errors.ts'

let server: Server
let base = ''
const hits: Record<string, number> = {}

beforeAll(async () => {
  server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    hits[url.pathname] = (hits[url.pathname] ?? 0) + 1
    if (url.pathname === '/ok') {
      res.writeHead(200, { 'content-type': 'application/json', 'x-test': 'yes' })
      res.end(JSON.stringify({ hello: 'world' }))
      return
    }
    if (url.pathname === '/retry429') {
      if ((hits[url.pathname] ?? 0) < 3) {
        res.writeHead(429, { 'content-type': 'application/json' })
        res.end('{"error":"rate limited"}')
      } else {
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end('{"ok":true}')
      }
      return
    }
    if (url.pathname === '/retry500') {
      if ((hits[url.pathname] ?? 0) < 2) {
        res.writeHead(503, { 'content-type': 'application/json' })
        res.end('{"error":"down"}')
      } else {
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end('{"ok":true}')
      }
      return
    }
    if (url.pathname === '/missing') {
      res.writeHead(404, { 'content-type': 'application/json' })
      res.end('{"error":"not found"}')
      return
    }
    if (url.pathname === '/badjson') {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end('{not json')
      return
    }
    if (url.pathname === '/slow') {
      setTimeout(() => {
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end('{"late":true}')
      }, 500)
      return
    }
    if (url.pathname === '/slowonce') {
      if ((hits[url.pathname] ?? 0) < 2) {
        setTimeout(() => {
          res.writeHead(200, { 'content-type': 'application/json' })
          res.end('{"late":true}')
        }, 500)
      } else {
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end('{"ok":true}')
      }
      return
    }
    if (url.pathname === '/big') {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ data: 'x'.repeat(5_000) }))
      return
    }
    res.writeHead(404)
    res.end()
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('failed to bind fixture server')
  base = `http://127.0.0.1:${address.port}`
})

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()))
})

describe('validateHttpUrl', () => {
  it('accepts http/https and rejects other schemes and credentials', () => {
    expect(validateHttpUrl('https://example.com/x')).toBe('https://example.com/x')
    expect(validateHttpUrl('http://127.0.0.1:1234/x')).toBe('http://127.0.0.1:1234/x')
    expect(() => validateHttpUrl('file:///etc/passwd')).toThrowError(/E-001/)
    expect(() => validateHttpUrl('https://user:pass@example.com/x')).toThrowError(/E-001/)
    expect(() => validateHttpUrl('not a url')).toThrowError(/E-001/)
  })
})

describe('buildUrl', () => {
  it('encodes query parameters and skips undefined values', () => {
    expect(buildUrl('https://example.com/search', { q: 'a b', page: 1, empty: undefined })).toBe(
      'https://example.com/search?q=a+b&page=1',
    )
  })

  it('rejects a base URL with a non-http scheme', () => {
    expect(() => buildUrl('ftp://example.com', {})).toThrowError(/E-001/)
  })
})

describe('HttpClient', () => {
  it('fetches and parses JSON with the configured user agent', async () => {
    const client = new HttpClient({ timeoutMs: 2_000, retries: 0, retryDelayMs: 0, userAgent: 'test-agent' })
    const data = await client.getJson<{ hello: string }>(`${base}/ok`)
    expect(data.hello).toBe('world')
  })

  it('retries 429 and 5xx, then succeeds', async () => {
    const client = new HttpClient({ timeoutMs: 2_000, retries: 2, retryDelayMs: 0 })
    expect(await client.getJson(`${base}/retry429`)).toEqual({ ok: true })
    expect(await client.getJson(`${base}/retry500`)).toEqual({ ok: true })
    expect(hits['/retry429']).toBe(3)
    expect(hits['/retry500']).toBe(2)
  })

  it('does not retry a 404', async () => {
    const client = new HttpClient({ timeoutMs: 2_000, retries: 3, retryDelayMs: 0 })
    await expect(client.getJson(`${base}/missing`)).rejects.toMatchObject({ name: 'HttpError', status: 404 })
  })

  it('surfaces parse failures as SyntaxError without retrying', async () => {
    const client = new HttpClient({ timeoutMs: 2_000, retries: 3, retryDelayMs: 0 })
    await expect(client.getJson(`${base}/badjson`)).rejects.toBeInstanceOf(SyntaxError)
  })

  it('times out with a TimeoutError', async () => {
    const client = new HttpClient({ timeoutMs: 50, retries: 0, retryDelayMs: 0 })
    await expect(client.getJson(`${base}/slow`)).rejects.toMatchObject({ name: 'TimeoutError' })
  })

  it('retries a timeout when attempts remain', async () => {
    const client = new HttpClient({ timeoutMs: 50, retries: 1, retryDelayMs: 0 })
    expect(await client.getJson(`${base}/slowonce`)).toEqual({ ok: true })
  })

  it('retries HttpError thrown by the transport', async () => {
    let calls = 0
    const fetchImpl = (async () => {
      calls += 1
      if (calls === 1) throw new HttpError(503)
      return new Response('{"ok":true}', { status: 200, headers: { 'content-type': 'application/json' } })
    }) as typeof fetch
    const client = new HttpClient({ retries: 1, retryDelayMs: 0, fetchImpl })
    expect(await client.getJson('https://example.com/x')).toEqual({ ok: true })
    expect(calls).toBe(2)
  })

  it('retries a generic network error', async () => {
    let calls = 0
    const fetchImpl = (async () => {
      calls += 1
      if (calls === 1) throw new TypeError('network down')
      return new Response('{"ok":true}', { status: 200, headers: { 'content-type': 'application/json' } })
    }) as typeof fetch
    const client = new HttpClient({ retries: 1, retryDelayMs: 0, fetchImpl })
    expect(await client.getJson('https://example.com/x')).toEqual({ ok: true })
    expect(calls).toBe(2)
  })

  it('surfaces the last generic network error when no retries remain', async () => {
    const fetchImpl = (async () => {
      throw new TypeError('offline')
    }) as typeof fetch
    const client = new HttpClient({ retries: 0, retryDelayMs: 0, fetchImpl })
    await expect(client.getJson('https://example.com/x')).rejects.toBeInstanceOf(TypeError)
  })

  it('rejects responses larger than maxBytes', async () => {
    const client = new HttpClient({ timeoutMs: 2_000, retries: 0, retryDelayMs: 0, maxBytes: 1_000 })
    await expect(client.getJson(`${base}/big`)).rejects.toMatchObject({ name: 'HttpError', status: 413 })
  })

  it('rejects non-http URLs before making a request', async () => {
    const client = new HttpClient()
    await expect(client.getJson('file:///etc/passwd')).rejects.toThrowError(/E-001/)
  })
})
