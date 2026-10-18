#!/usr/bin/env node
/** Real-API smoke test for all four tools (no dsh scheduler required). */

import { HttpClient } from '../dist/adapters/http.js'
import { MemoryCache } from '../dist/adapters/cache.js'
import { buildTools } from '../dist/apps/dsh/tools.js'

const topic = process.argv[2] ?? 'protein language model'
const tools = buildTools({
  client: new HttpClient({ timeoutMs: 20_000, retries: 1 }),
  cache: new MemoryCache(),
})

const call = (name, args) => tools[name].execute(args)

const search = await call('biorxiv_search', { topic, limit: 2 })
if (!search.ok) {
  console.error(JSON.stringify(search, null, 2))
  process.exit(1)
}
const doi = search.data.items[0]?.doi
const paper = await call('biorxiv_paper', { doi })
const latest = await call('biorxiv_latest', { days: 1, limit: 2 })
const exported = await call('biorxiv_export', { query: topic, format: 'json', limit: 2 })

const summary = {
  search: { ok: search.ok, count: search.data.items.length, firstDoi: doi },
  paper: { ok: paper.ok, doi: paper.data.doi, version: paper.data.version },
  latest: { ok: latest.ok, count: latest.data.items.length },
  export: { ok: exported.ok, count: exported.data.count },
}
console.log(JSON.stringify(summary, null, 2))
if (![paper.ok, latest.ok, exported.ok].every(Boolean)) process.exit(1)
