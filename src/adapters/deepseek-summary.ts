/** DeepSeek chat-completions summarizer; opt-in only, sends public metadata only. */

import type { SummaryInput, SummaryProvider } from '../core/summary.ts'

export interface DeepSeekSummaryOptions {
  apiKey: string
  model?: string
  baseUrl?: string
  fetchImpl?: typeof fetch
  timeoutMs?: number
}

export class DeepSeekSummaryProvider implements SummaryProvider {
  readonly name = 'deepseek'
  private readonly model: string
  private readonly baseUrl: string
  private readonly fetchImpl: typeof fetch
  private readonly timeoutMs: number

  constructor(private readonly options: DeepSeekSummaryOptions) {
    if (options.apiKey.trim() === '') throw new Error('E-007: summary API key is empty')
    this.model = options.model ?? 'deepseek-chat'
    this.baseUrl = options.baseUrl ?? 'https://api.deepseek.com'
    this.fetchImpl = options.fetchImpl ?? fetch
    this.timeoutMs = options.timeoutMs ?? 20_000
  }

  async summarize(input: SummaryInput): Promise<string> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)
    try {
      const response = await this.fetchImpl(`${this.baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.options.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          temperature: 0.2,
          max_tokens: 300,
          messages: [
            {
              role: 'system',
              content:
                '你是生物学文献摘要助手。只输出 2–3 句中文要点，保留关键对象/方法/结论；不要编造原文没有的内容；不要输出 Markdown。',
            },
            {
              role: 'user',
              content: `标题：${input.title}\n摘要：${input.abstract.slice(0, 4000)}`,
            },
          ],
        }),
        signal: controller.signal,
      })
      if (!response.ok) throw new Error(`summary HTTP ${response.status}`)
      const payload = (await response.json()) as { choices?: Array<{ message?: { content?: unknown } }> }
      const text = payload.choices?.[0]?.message?.content
      if (typeof text !== 'string' || text.trim() === '') throw new Error('empty summary')
      return text.trim()
    } finally {
      clearTimeout(timer)
    }
  }
}
