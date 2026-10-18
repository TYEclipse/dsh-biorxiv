/** Scriptable CLI logic, separated from the bin entrypoint for testability. */

import { digestTool } from '../../core/digest.ts'
import { exportTool, latestTool, paperTool, searchTool, type ServiceDeps } from '../../core/service.ts'
import { createDeps } from '../../index.ts'

export interface CliStream {
  write: (text: string) => void
  writeError: (text: string) => void
}

const DEFAULT_STREAM: CliStream = {
  write: (text) => process.stdout.write(text),
  writeError: (text) => process.stderr.write(text),
}

const USAGE = `dsh-biorxiv <command> [options]

Commands:
  search <topic>   [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--limit N] [--field any|title|abstract] [--min-score N]
  paper <doi>
  latest           [--days N] [--limit N] [--category NAME]
  export <topic>   [--format json|markdown|csv|bibtex] [--out PATH] [--force] [--limit N]
  digest <topic>   [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--limit N] [--summary]
  --help

All commands print one JSON envelope: { ok, data, error, meta }.`

function valueOf(argv: string[], name: string): string | undefined {
  const index = argv.indexOf(name)
  if (index < 0) return undefined
  return argv[index + 1]
}

function has(argv: string[], name: string): boolean {
  return argv.includes(name)
}

function integer(value: string | undefined): number | undefined {
  if (value === undefined) return undefined
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : undefined
}

function firstPositional(argv: string[], command: string): string | undefined {
  const start = argv.indexOf(command) + 1
  for (let index = start; index < argv.length; index += 1) {
    const value = argv[index]
    if (value !== undefined && !value.startsWith('--')) return value
  }
  return undefined
}

export async function runCli(
  argv: string[],
  deps: ServiceDeps = createDeps({ summaryEnabled: argv.includes('--summary') }),
  stream: CliStream = DEFAULT_STREAM,
): Promise<number> {
  const command = argv[0]
  if (command === undefined || command === '--help' || command === '-h') {
    stream.write(`${USAGE}\n`)
    return 0
  }
  const rendered = (result: { ok: boolean }): number => {
    stream.write(`${JSON.stringify(result, null, 2)}\n`)
    return result.ok ? 0 : 1
  }
  if (command === 'search') {
    return rendered(
      await searchTool(deps, {
        topic: firstPositional(argv, 'search') ?? '',
        dateFrom: valueOf(argv, '--from'),
        dateTo: valueOf(argv, '--to'),
        limit: integer(valueOf(argv, '--limit')),
        field: valueOf(argv, '--field') as 'any' | 'title' | 'abstract' | undefined,
        minScore: integer(valueOf(argv, '--min-score')),
      }),
    )
  }
  if (command === 'paper') {
    return rendered(await paperTool(deps, { doi: firstPositional(argv, 'paper') ?? '' }))
  }
  if (command === 'latest') {
    return rendered(
      await latestTool(deps, {
        days: integer(valueOf(argv, '--days')),
        limit: integer(valueOf(argv, '--limit')),
        category: valueOf(argv, '--category'),
      }),
    )
  }
  if (command === 'export') {
    return rendered(
      await exportTool(deps, {
        query: firstPositional(argv, 'export') ?? '',
        format: valueOf(argv, '--format') as 'json' | 'markdown' | 'csv' | 'bibtex' | undefined,
        out: valueOf(argv, '--out'),
        force: has(argv, '--force'),
        limit: integer(valueOf(argv, '--limit')),
      }),
    )
  }
  if (command === 'digest') {
    return rendered(
      await digestTool(deps, {
        topic: firstPositional(argv, 'digest') ?? '',
        dateFrom: valueOf(argv, '--from'),
        dateTo: valueOf(argv, '--to'),
        limit: integer(valueOf(argv, '--limit')),
        summary: has(argv, '--summary'),
      }),
    )
  }
  stream.writeError(`unknown command: ${command}\n`)
  stream.writeError(`${USAGE}\n`)
  return 2
}
