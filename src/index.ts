/** dsh-biorxiv plugin entry: config, dependency wiring, and tool registration. */

import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import z from '@deepseek-ai/schemastery'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { HttpClient } from './adapters/http.ts'
import { DeepSeekSummaryProvider } from './adapters/deepseek-summary.ts'
import { openCache, type CacheMode, type CacheStore } from './adapters/cache.ts'
import { buildTools, type ToolSet } from './apps/dsh/tools.ts'
import type { ServiceDeps } from './core/service.ts'
import type { SummaryProvider } from './core/summary.ts'

export const name = 'dsh-biorxiv'
export const inject = ['agents', 'tools']

export interface Config {
  cachePath?: string
  cacheMode?: CacheMode
  timeoutMs?: number
  retries?: number
  maxBytes?: number
  userAgent?: string
  summaryEnabled?: boolean
  summaryModel?: string
  summaryBaseUrl?: string
  summaryApiKeyEnv?: string
}

const DEFAULT_CACHE_PATH = join(homedir(), '.cache', 'dsh-biorxiv', 'cache.db')
const DEFAULT_USER_AGENT = 'dsh-biorxiv/0.1 (DeepSeek Harness plugin)'
const DEFAULT_SUMMARY_MODEL = 'deepseek-chat'
const DEFAULT_SUMMARY_BASE_URL = 'https://api.deepseek.com'
const DEFAULT_SUMMARY_KEY_ENV = 'DEEPSEEK_API_KEY'

export const Config = z.object({
  cachePath: z.string().default(DEFAULT_CACHE_PATH),
  cacheMode: z.string().default('auto'),
  timeoutMs: z.number().min(1_000).max(60_000).default(10_000),
  retries: z.number().step(1).min(0).max(5).default(2),
  maxBytes: z.number().min(10_000).max(5_000_000).default(2_000_000),
  userAgent: z.string().max(200).default(DEFAULT_USER_AGENT),
  summaryEnabled: z.boolean().default(false),
  summaryModel: z.string().max(100).default(DEFAULT_SUMMARY_MODEL),
  summaryBaseUrl: z.string().max(500).default(DEFAULT_SUMMARY_BASE_URL),
  summaryApiKeyEnv: z.string().max(100).default(DEFAULT_SUMMARY_KEY_ENV),
})

export interface ResolvedConfig {
  cachePath: string
  cacheMode: CacheMode
  timeoutMs: number
  retries: number
  maxBytes: number
  userAgent: string
  summaryEnabled: boolean
  summaryModel: string
  summaryBaseUrl: string
  summaryApiKeyEnv: string
}

function expandHome(path: string): string {
  if (path === '~') return homedir()
  if (path.startsWith('~/')) return join(homedir(), path.slice(2))
  return path
}

export function resolveConfig(config: Config = {}): ResolvedConfig {
  const mode = config.cacheMode ?? 'auto'
  if (!['auto', 'sqlite', 'json'].includes(mode)) throw new Error(`E-007: unsupported cacheMode ${mode}`)
  return {
    cachePath: expandHome(config.cachePath ?? DEFAULT_CACHE_PATH),
    cacheMode: mode,
    timeoutMs: config.timeoutMs ?? 10_000,
    retries: config.retries ?? 2,
    maxBytes: config.maxBytes ?? 2_000_000,
    userAgent: config.userAgent ?? DEFAULT_USER_AGENT,
    summaryEnabled: config.summaryEnabled ?? false,
    summaryModel: config.summaryModel ?? DEFAULT_SUMMARY_MODEL,
    summaryBaseUrl: config.summaryBaseUrl ?? DEFAULT_SUMMARY_BASE_URL,
    summaryApiKeyEnv: config.summaryApiKeyEnv ?? DEFAULT_SUMMARY_KEY_ENV,
  }
}

class LazyCache implements CacheStore {
  private readonly ready: Promise<CacheStore>

  constructor(path: string, mode: CacheMode) {
    this.ready = openCache(path, mode)
  }

  async get<T>(key: string): Promise<T | null> {
    return (await this.ready).get<T>(key)
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    return (await this.ready).set(key, value, ttlSeconds)
  }

  async delete(key: string): Promise<void> {
    return (await this.ready).delete(key)
  }

  async clear(): Promise<void> {
    return (await this.ready).clear()
  }

  async close(): Promise<void> {
    return (await this.ready).close()
  }
}

export function createDeps(config: Config = {}, env: NodeJS.ProcessEnv = process.env): ServiceDeps {
  const resolved = resolveConfig(config)
  const apiKey = env[resolved.summaryApiKeyEnv]?.trim() ?? ''
  const summarizer: SummaryProvider | undefined =
    resolved.summaryEnabled && apiKey !== ''
      ? new DeepSeekSummaryProvider({
          apiKey,
          model: resolved.summaryModel,
          baseUrl: resolved.summaryBaseUrl,
          timeoutMs: resolved.timeoutMs,
        })
      : undefined
  return {
    client: new HttpClient({
      timeoutMs: resolved.timeoutMs,
      retries: resolved.retries,
      maxBytes: resolved.maxBytes,
      userAgent: resolved.userAgent,
    }),
    cache: new LazyCache(resolved.cachePath, resolved.cacheMode),
    summarizer,
  }
}

function decorate(agent: Agent, tools: ToolSet): () => void {
  const disposers = Object.values(tools).map((definition) => agent.ctx.tools.register(definition))
  return () => {
    for (const dispose of disposers) {
      try {
        dispose()
      } catch {
        // already disposed
      }
    }
  }
}

export function apply(ctx: Context, config: Config): void {
  const deps = createDeps(config)
  const tools = buildTools(deps)
  const disposers = new Set<() => void>()

  const decorateAgent = (agent: Agent): void => {
    try {
      disposers.add(decorate(agent, tools))
    } catch (error) {
      ctx.logger(name).warn(`tool registration for agent ${agent.id} failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  for (const agent of ctx.agents.list()) decorateAgent(agent)
  const off = ctx.on('agent/created', ({ agent }) => decorateAgent(agent))

  ctx.effect(() => () => {
    off()
    for (const dispose of disposers) {
      try {
        dispose()
      } catch {
        // already disposed
      }
    }
    disposers.clear()
  })
}

export { buildTools }
export type { ToolSet }
