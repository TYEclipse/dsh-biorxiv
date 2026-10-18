import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createDeps, resolveConfig } from '../src/index.ts'

describe('plugin config', () => {
  it('defaults summaries off and resolves a cache path', () => {
    const config = resolveConfig({ cachePath: '/tmp/x.db' })
    expect(config.summaryEnabled).toBe(false)
    expect(config.summaryModel).toBe('deepseek-chat')
    expect(config.cachePath).toBe('/tmp/x.db')
  })

  it('creates a summarizer only when enabled and the env key exists', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dsh-biorxiv-config-'))
    try {
      const config = { cachePath: join(dir, 'cache.db'), summaryEnabled: true }
      expect(createDeps(config, {}).summarizer).toBeUndefined()
      expect(createDeps(config, { DEEPSEEK_API_KEY: 'test-key' }).summarizer?.name).toBe('deepseek')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
