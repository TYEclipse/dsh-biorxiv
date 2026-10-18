/** Cache ports and zero-dependency implementations (memory, JSON, SQLite). */
import { createHash } from 'node:crypto';
import { chmod, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
/** Stable JSON so identical logical inputs always hash to the same cache key. */
function stableStringify(value) {
    if (value === null || typeof value !== 'object')
        return JSON.stringify(value);
    if (Array.isArray(value))
        return `[${value.map(stableStringify).join(',')}]`;
    const record = value;
    return `{${Object.keys(record)
        .sort()
        .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
        .join(',')}}`;
}
export function hashCacheKey(input) {
    return createHash('sha256').update(stableStringify(input)).digest('hex');
}
export class MemoryCache {
    now;
    entries = new Map();
    constructor(now = Date.now) {
        this.now = now;
    }
    async get(key) {
        const entry = this.entries.get(key);
        if (entry === undefined)
            return null;
        if (entry.expiresAt <= this.now()) {
            this.entries.delete(key);
            return null;
        }
        return entry.value;
    }
    async set(key, value, ttlSeconds) {
        this.entries.set(key, { value, expiresAt: this.now() + ttlSeconds * 1000 });
    }
    async delete(key) {
        this.entries.delete(key);
    }
    async clear() {
        this.entries.clear();
    }
    async close() {
        this.entries.clear();
    }
}
export class JsonFileCache {
    path;
    now;
    entries = null;
    constructor(path, now = Date.now) {
        this.path = path;
        this.now = now;
    }
    async load() {
        if (this.entries !== null)
            return this.entries;
        try {
            const parsed = JSON.parse(await readFile(this.path, 'utf8'));
            this.entries = parsed.entries ?? {};
        }
        catch {
            this.entries = {};
        }
        return this.entries;
    }
    async flush() {
        const dir = dirname(this.path);
        await mkdir(dir, { recursive: true, mode: 0o700 });
        const temp = `${this.path}.${process.pid}.${this.now()}.tmp`;
        await writeFile(temp, JSON.stringify({ version: 1, entries: this.entries ?? {} }), { encoding: 'utf8', mode: 0o600 });
        await rename(temp, this.path);
        await chmod(this.path, 0o600).catch(() => undefined);
    }
    async get(key) {
        const entries = await this.load();
        const entry = entries[key];
        if (entry === undefined)
            return null;
        if (entry.e <= this.now()) {
            delete entries[key];
            await this.flush();
            return null;
        }
        return entry.v;
    }
    async set(key, value, ttlSeconds) {
        const entries = await this.load();
        entries[key] = { v: value, e: this.now() + ttlSeconds * 1000 };
        await this.flush();
    }
    async delete(key) {
        const entries = await this.load();
        delete entries[key];
        await this.flush();
    }
    async clear() {
        this.entries = {};
        await this.flush();
    }
    async close() {
        if (this.entries !== null)
            await this.flush();
    }
}
export class SqliteCache {
    db;
    now;
    constructor(db, now = Date.now) {
        this.db = db;
        this.now = now;
    }
    static async open(path, now = Date.now) {
        const sqlite = (await import('node:sqlite'));
        await mkdir(dirname(path), { recursive: true, mode: 0o700 });
        const db = new sqlite.DatabaseSync(path);
        db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;');
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
    `);
        return new SqliteCache(db, now);
    }
    async get(key) {
        const row = this.db.prepare('SELECT value, ts, ttl FROM cache WHERE key = ?').get(key);
        if (row === undefined)
            return null;
        if (row.ts + row.ttl * 1000 <= this.now()) {
            await this.delete(key);
            return null;
        }
        return JSON.parse(row.value);
    }
    async set(key, value, ttlSeconds) {
        this.db
            .prepare(`INSERT INTO cache (key, value, ts, ttl, kind) VALUES (?, ?, ?, ?, 'generic')
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, ts = excluded.ts, ttl = excluded.ttl`)
            .run(key, JSON.stringify(value), this.now(), ttlSeconds);
    }
    async delete(key) {
        this.db.prepare('DELETE FROM cache WHERE key = ?').run(key);
    }
    async clear() {
        this.db.exec('DELETE FROM cache');
    }
    async close() {
        this.db.close();
    }
}
export async function openCache(path, mode = 'auto') {
    if (mode === 'json')
        return new JsonFileCache(path);
    try {
        return await SqliteCache.open(path);
    }
    catch (error) {
        if (mode === 'sqlite')
            throw error;
        return new JsonFileCache(path);
    }
}
/** Remove a cache file and its WAL/SHM companions. */
export async function removeCache(path) {
    await Promise.all([rm(path, { force: true }), rm(`${path}-wal`, { force: true }), rm(`${path}-shm`, { force: true })]);
}
//# sourceMappingURL=cache.js.map