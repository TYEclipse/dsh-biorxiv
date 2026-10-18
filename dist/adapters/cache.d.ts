/** Cache ports and zero-dependency implementations (memory, JSON, SQLite). */
export interface CacheStore {
    get<T>(key: string): Promise<T | null>;
    set<T>(key: string, value: T, ttlSeconds: number): Promise<void>;
    delete(key: string): Promise<void>;
    clear(): Promise<void>;
    close(): Promise<void>;
}
export type CacheMode = 'auto' | 'sqlite' | 'json';
export declare function hashCacheKey(input: unknown): string;
export declare class MemoryCache implements CacheStore {
    private readonly now;
    private readonly entries;
    constructor(now?: () => number);
    get<T>(key: string): Promise<T | null>;
    set<T>(key: string, value: T, ttlSeconds: number): Promise<void>;
    delete(key: string): Promise<void>;
    clear(): Promise<void>;
    close(): Promise<void>;
}
export declare class JsonFileCache implements CacheStore {
    private readonly path;
    private readonly now;
    private entries;
    constructor(path: string, now?: () => number);
    private load;
    private flush;
    get<T>(key: string): Promise<T | null>;
    set<T>(key: string, value: T, ttlSeconds: number): Promise<void>;
    delete(key: string): Promise<void>;
    clear(): Promise<void>;
    close(): Promise<void>;
}
export declare class SqliteCache implements CacheStore {
    private readonly db;
    private readonly now;
    private constructor();
    static open(path: string, now?: () => number): Promise<SqliteCache>;
    get<T>(key: string): Promise<T | null>;
    set<T>(key: string, value: T, ttlSeconds: number): Promise<void>;
    delete(key: string): Promise<void>;
    clear(): Promise<void>;
    close(): Promise<void>;
}
export declare function openCache(path: string, mode?: CacheMode): Promise<CacheStore>;
/** Remove a cache file and its WAL/SHM companions. */
export declare function removeCache(path: string): Promise<void>;
//# sourceMappingURL=cache.d.ts.map