import { describe, expect, it } from 'vitest'
import { DeepSeekSummaryProvider } from '../../src/adapters/deepseek-summary.ts'

describe('DeepSeekSummaryProvider', () => {
  it('sends only the public title/abstract and returns the Chinese summary', async () => {
    let captured: { url?: string; body?: any; headers?: any } = {}
    const fetchImpl = (async (url: string, init: RequestInit) => {
      captured = { url, body: JSON.parse(String(init.body)), headers: init.headers }
      return new Response(JSON.stringify({ choices: [{ message: { content: '这是一段中文摘要。' } }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }) as typeof fetch
    const provider = new DeepSeekSummaryProvider({ apiKey: 'test-key', fetchImpl })
    const text = await provider.summarize({
      doi: '10.1101/x',
      title: 'A paper',
      abstract: 'A public abstract.',
    })
    expect(text).toBe('这是一段中文摘要。')
    expect(captured.url).toContain('/chat/completions')
    expect(captured.body.model).toBe('deepseek-chat')
    expect(JSON.stringify(captured.body)).toContain('A public abstract.')
    expect(JSON.stringify(captured.body)).not.toContain('test-key')
  })

  it('rejects a response without a summary', async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ choices: [] }), { status: 200 })) as typeof fetch
    const provider = new DeepSeekSummaryProvider({ apiKey: 'test-key', fetchImpl })
    await expect(provider.summarize({ doi: '10.1101/x', title: 'A', abstract: 'B' })).rejects.toThrowError(/empty summary/)
  })

  it('rejects an HTTP error without exposing the key', async () => {
    const fetchImpl = (async () => new Response('nope', { status: 429 })) as typeof fetch
    const provider = new DeepSeekSummaryProvider({ apiKey: 'secret-key', fetchImpl })
    await expect(provider.summarize({ doi: '10.1101/x', title: 'A', abstract: 'B' })).rejects.toThrowError(/429/)
  })
})
