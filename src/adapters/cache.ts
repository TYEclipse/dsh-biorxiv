/** Cache ports and zero-dependency implementations (memory, JSON, SQLite). */

import { createHash } from 'node:crypto'
import { chmod, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

export interface CacheStore {
  get<T>(key: string): Promise<T | null>
  set<T>(key: string, value: T, ttlSeconds: number): Promise<void>
  delete(key: string): Promise<void>
  clear(): Promise<void>
  close(): Promise<void>
}

export type CacheMode = 'auto' | 'sqlite' | 'json'

/** Stable JSON so identical logical inputs always hash to the same cache key. */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const record = value as Record<string, unknown>
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(',')}}`
}

export function hashCacheKey(input: unknown): string {
  return createHash('sha256').update(stableStringify(input)).digest('hex')
}

interface Entry {
  value: unknown
  expiresAt: number
}

export class MemoryCache implements CacheStore {
  private readonly entries = new Map<string, Entry>()

  constructor(private readonly now: () => number = Date.now) {}

  async get<T>(key: string): Promise<T | null> {
    const entry = this.entries.get(key)
    if (entry === undefined) return null
    if (entry.expiresAt <= this.now()) {
      this.entries.delete(key)
      return null
    }
    return entry.value as T
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    this.entries.set(key, { value, expiresAt: this.now() + ttlSeconds * 1000 })
  }

  async delete(key: string): Promise<void> {
    this.entries.delete(key)
  }

  async clear(): Promise<void> {
    this.entries.clear()
  }

  async close(): Promise<void> {
    this.entries.clear()
  }
}

interface FileEntry {
  v: unknown
  e: number
}

export class JsonFileCache implements CacheStore {
  private entries: Record<string, FileEntry> | null = null

  constructor(
    private readonly path: string,
    private readonly now: () => number = Date.now,
  ) {}

  private async load(): Promise<Record<string, FileEntry>> {
    if (this.entries !== null) return this.entries
    try {
      const parsed = JSON.parse(await readFile(this.path, 'utf8')) as { entries?: Record<string, FileEntry> }
      this.entries = parsed.entries ?? {}
    } catch {
      this.entries = {}
    }
    return this.entries
  }

  private async flush(): Promise<void> {
    const dir = dirname(this.path)
    await mkdir(dir, { recursive: true, mode: 0o700 })
    const temp = `${this.path}.${process.pid}.${this.now()}.tmp`
    await writeFile(temp, JSON.stringify({ version: 1, entries: this.entries ?? {} }), { encoding: 'utf8', mode: 0o600 })
    await rename(temp, this.path)
    await chmod(this.path, 0o600).catch(() => undefined)
  }

  async get<T>(key: string): Promise<T | null> {
    const entries = await this.load()
    const entry = entries[key]
    if (entry === undefined) return null
    if (entry.e <= this.now()) {
      delete entries[key]
      await this.flush()
      return null
    }
    return entry.v as T
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    const entries = await this.load()
    entries[key] = { v: value, e: this.now() + ttlSeconds * 1000 }
    await this.flush()
  }

  async delete(key: string): Promise<void> {
    const entries = await this.load()
    delete entries[key]
    await this.flush()
  }

  async clear(): Promise<void> {
    this.entries = {}
    await this.flush()
  }

  async close(): Promise<void> {
    if (this.entries !== null) await this.flush()
  }
}

type SqliteDatabase = {
  exec(sql: string): void
  prepare(sql: string): {
    get(...args: unknown[]): unknown
    run(...args: unknown[]): unknown
  }
  close(): void
}

export class SqliteCache implements CacheStore {
  private constructor(
    private readonly db: SqliteDatabase,
    private readonly now: () => number = Date.now,
  ) {}

  static async open(path: string, now: () => number = Date.now): Promise<SqliteCache> {
    const sqlite = (await import('node:sqlite')) as unknown as {
      DatabaseSync: new (path: string) => SqliteDatabase
    }
    await mkdir(dirname(path), { recursive: true, mode: 0o700 })
    const db = new sqlite.DatabaseSync(path)
    db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;')
    db.exec(`
      CREATE TABLE IF NOT EXISTS cache (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        ts REAL NOT NULL,
        ttl INTEGER NOT NULL,
        kind TEXT NOT NULL DEFAULT 'generic'
      );
      CREATE INDEX IF NOT EXISTS idx_cache_ts ON cache(ts);
      CREATE INDEX IF NOT EXISTS idx_cache_kind_ts ON cache(kind, ts);
    `)
    return new SqliteCache(db, now)
  }

  async get<T>(key: string): Promise<T | null> {
    const row = this.db.prepare('SELECT value, ts, ttl FROM cache WHERE key = ?').get(key) as
      | { value: string; ts: number; ttl: number }
      | undefined
    if (row === undefined) return null
    if (row.ts + row.ttl * 1000 <= this.now()) {
      await this.delete(key)
      return null
    }
    return JSON.parse(row.value) as T
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO cache (key, value, ts, ttl, kind) VALUES (?, ?, ?, ?, 'generic')
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, ts = excluded.ts, ttl = excluded.ttl`,
      )
      .run(key, JSON.stringify(value), this.now(), ttlSeconds)
  }

  async delete(key: string): Promise<void> {
    this.db.prepare('DELETE FROM cache WHERE key = ?').run(key)
  }

  async clear(): Promise<void> {
    this.db.exec('DELETE FROM cache')
  }

  async close(): Promise<void> {
    this.db.close()
  }
}

export async function openCache(path: string, mode: CacheMode = 'auto'): Promise<CacheStore> {
  if (mode === 'json') return new JsonFileCache(path)
  try {
    return await SqliteCache.open(path)
  } catch (error) {
    if (mode === 'sqlite') throw error
    return new JsonFileCache(path)
  }
}

/** Remove a cache file and its WAL/SHM companions. */
export async function removeCache(path: string): Promise<void> {
  await Promise.all([rm(path, { force: true }), rm(`${path}-wal`, { force: true }), rm(`${path}-shm`, { force: true })])
}
