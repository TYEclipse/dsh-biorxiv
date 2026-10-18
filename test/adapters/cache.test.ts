import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  JsonFileCache,
  MemoryCache,
  SqliteCache,
  hashCacheKey,
  openCache,
  removeCache,
} from '../../src/adapters/cache.ts'

const dirs: string[] = []

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-biorxiv-cache-'))
  dirs.push(dir)
  return dir
}

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('hashCacheKey', () => {
  it('is stable, hex and does not contain the original query', () => {
    const key = hashCacheKey({ topic: 'secret brain ripple', limit: 20 })
    expect(key).toMatch(/^[0-9a-f]{64}$/)
    expect(key).not.toContain('secret')
    expect(hashCacheKey({ topic: 'secret brain ripple', limit: 20 })).toBe(key)
    expect(hashCacheKey({ topic: 'secret brain ripple', limit: 21 })).not.toBe(key)
  })
})

describe('MemoryCache', () => {
  it('stores and expires values using the injected clock', async () => {
    let now = 1_000
    const cache = new MemoryCache(() => now)
    await cache.set('k', { value: 1 }, 10)
    expect(await cache.get('k')).toEqual({ value: 1 })
    now = 10_999
    expect(await cache.get('k')).toEqual({ value: 1 })
    now = 11_001
    expect(await cache.get('k')).toBeNull()
  })

  it('deletes and clears entries', async () => {
    const cache = new MemoryCache()
    await cache.set('a', 1, 60)
    await cache.set('b', 2, 60)
    await cache.delete('a')
    expect(await cache.get('a')).toBeNull()
    expect(await cache.get('b')).toBe(2)
    await cache.clear()
    expect(await cache.get('b')).toBeNull()
    await cache.close()
  })
})

describe('JsonFileCache', () => {
  it('persists across instances and writes a private file', async () => {
    const dir = await tempDir()
    const path = join(dir, 'cache.json')
    const first = new JsonFileCache(path)
    await first.set('key', { hello: 'world' }, 60)
    const second = new JsonFileCache(path)
    expect(await second.get('key')).toEqual({ hello: 'world' })
    const mode = (await stat(path)).mode & 0o777
    expect(mode).toBe(0o600)
    expect((await readFile(path, 'utf8')).length).toBeGreaterThan(0)
  })

  it('expires values and survives a corrupt file', async () => {
    const dir = await tempDir()
    const path = join(dir, 'cache.json')
    let now = 100_000
    const cache = new JsonFileCache(path, () => now)
    await cache.set('key', 'value', 5)
    now = 106_000
    expect(await cache.get('key')).toBeNull()

    await rm(path)
    await writeFile(path, '{not json', 'utf8')
    expect(await cache.get('key')).toBeNull()
    await cache.set('after', 'ok', 60)
    expect(await cache.get('after')).toBe('ok')
  })

  it('deletes, clears and closes without losing the file contract', async () => {
    const dir = await tempDir()
    const path = join(dir, 'cache.json')
    const cache = new JsonFileCache(path)
    await cache.set('a', 1, 60)
    await cache.set('b', 2, 60)
    await cache.delete('a')
    expect(await cache.get('a')).toBeNull()
    await cache.clear()
    expect(await cache.get('b')).toBeNull()
    await cache.close()
    const untouched = new JsonFileCache(join(dir, 'missing.json'))
    await untouched.close()
  })
})

describe('SqliteCache', () => {
  it('persists, expires, deletes and clears values', async () => {
    const dir = await tempDir()
    let now = 1_000_000
    const cache = await SqliteCache.open(join(dir, 'cache.db'), () => now)
    await cache.set('key', { value: 1 }, 5)
    expect(await cache.get('key')).toEqual({ value: 1 })
    now = 1_006_000
    expect(await cache.get('key')).toBeNull()
    await cache.set('key2', 2, 60)
    await cache.delete('key2')
    expect(await cache.get('key2')).toBeNull()
    await cache.set('key3', 3, 60)
    await cache.clear()
    expect(await cache.get('key3')).toBeNull()
    await cache.close()
  })
})

describe('openCache', () => {
  it('opens a sqlite cache when requested', async () => {
    const dir = await tempDir()
    const cache = await openCache(join(dir, 'cache.db'), 'sqlite')
    await cache.set('k', { value: 1 }, 60)
    expect(await cache.get('k')).toEqual({ value: 1 })
    await cache.close()
  })

  it('falls back to JSON when sqlite cannot open the path', async () => {
    const dir = await tempDir()
    const cache = await openCache(dir, 'auto')
    expect(cache).toBeInstanceOf(JsonFileCache)
  })

  it('throws in explicit sqlite mode when the path is a directory', async () => {
    const dir = await tempDir()
    await expect(openCache(dir, 'sqlite')).rejects.toThrow()
  })

  it('opens a JSON cache when requested', async () => {
    const dir = await tempDir()
    const path = join(dir, 'cache.json')
    const cache = await openCache(path, 'json')
    await cache.set('k', 1, 60)
    expect(await cache.get('k')).toBe(1)
    await cache.close()
  })
})

describe('removeCache', () => {
  it('removes the cache file and companions', async () => {
    const dir = await tempDir()
    const path = join(dir, 'cache.json')
    const cache = new JsonFileCache(path)
    await cache.set('k', 1, 60)
    await removeCache(path)
    expect(await new JsonFileCache(path).get('k')).toBeNull()
  })
})
