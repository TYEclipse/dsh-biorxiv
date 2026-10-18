import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { MemoryCache } from '../../src/adapters/cache.ts'
import type { JsonClient } from '../../src/adapters/europepmc.ts'
import { runCli } from '../../src/apps/cli/run.ts'

const searchPayload = {
  hitCount: 1,
  resultList: {
    result: [
      {
        doi: '10.1101/2026.01.01.000001',
        title: 'Protein language model',
        authorString: 'Doe J',
        firstPublicationDate: '2026-01-02',
        abstractText: 'A paper',
        citedByCount: 1,
        bookOrReportDetails: { publisher: 'bioRxiv' },
      },
    ],
  },
}

function deps(cwd?: string) {
  const client: JsonClient = {
    async getJson<T>(url: string): Promise<T> {
      if (url.includes('europepmc')) return searchPayload as T
      if (url.includes('crossref')) return { message: { 'container-title': [] } } as T
      if (url.includes('openalex')) return { is_retracted: false } as T
      if (url.includes('/na/json')) {
        return {
          collection: [
            { doi: '10.1101/2026.01.01.000001', title: 'A preprint', authors: 'Doe J', date: '2026-01-01', version: '1', published: 'NA' },
          ],
        } as T
      }
      return { collection: [] } as T
    },
  }
  return { client, cache: new MemoryCache(), cwd }
}

function io() {
  const out: string[] = []
  const err: string[] = []
  return { out, err, write: (s: string) => out.push(s), writeError: (s: string) => err.push(s) }
}

describe('runCli', () => {
  it('prints help and returns 0', async () => {
    const stream = io()
    expect(await runCli(['--help'], deps(), stream)).toBe(0)
    expect(stream.out.join('')).toContain('search <topic>')
  })

  it('runs search and prints a JSON envelope', async () => {
    const stream = io()
    expect(await runCli(['search', 'protein language model', '--limit', '1'], deps(), stream)).toBe(0)
    const parsed = JSON.parse(stream.out.join(''))
    expect(parsed.ok).toBe(true)
    expect(parsed.data.items).toHaveLength(1)
  })

  it('rejects a missing search topic', async () => {
    const stream = io()
    expect(await runCli(['search'], deps(), stream)).toBe(1)
    const parsed = JSON.parse(stream.out.join(''))
    expect(parsed.ok).toBe(false)
    expect(parsed.error.code).toBe('E-001')
  })

  it('runs latest and prints a JSON envelope', async () => {
    const stream = io()
    expect(await runCli(['latest', '--days', '1', '--limit', '1'], deps(), stream)).toBe(0)
    const parsed = JSON.parse(stream.out.join(''))
    expect(parsed.ok).toBe(true)
    expect(Array.isArray(parsed.data.items)).toBe(true)
  })

  it('runs digest and prints markdown', async () => {
    const stream = io()
    expect(await runCli(['digest', 'protein language model', '--limit', '1'], deps(), stream)).toBe(0)
    const parsed = JSON.parse(stream.out.join(''))
    expect(parsed.ok).toBe(true)
    expect(parsed.data.markdown).toContain('# bioRxiv digest')
  })

  it('returns 1 for a failed command and prints the error envelope', async () => {
    const stream = io()
    expect(await runCli(['paper', 'not-a-doi'], deps(), stream)).toBe(1)
    const parsed = JSON.parse(stream.out.join(''))
    expect(parsed.ok).toBe(false)
    expect(parsed.error.code).toBe('E-001')
  })

  it('exports to a file inside cwd', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'dsh-biorxiv-cli-'))
    try {
      const stream = io()
      expect(await runCli(['export', 'protein language model', '--format', 'json', '--out', 'refs.json'], deps(cwd), stream)).toBe(0)
      const parsed = JSON.parse(stream.out.join(''))
      expect(parsed.ok).toBe(true)
      expect(JSON.parse(await readFile(join(cwd, 'refs.json'), 'utf8'))).toHaveLength(1)
    } finally {
      await rm(cwd, { recursive: true, force: true })
    }
  })

  it('rejects unknown commands', async () => {
    const stream = io()
    expect(await runCli(['nope'], deps(), stream)).toBe(2)
    expect(stream.err.join('')).toContain('unknown command')
  })
})
