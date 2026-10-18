import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { SERVER_VERSION } from '../../src/apps/mcp/server.ts'

function packageVersion(): string {
  const raw = readFileSync(new URL('../../package.json', import.meta.url), 'utf8')
  return (JSON.parse(raw) as { version: string }).version
}

describe('MCP server version', () => {
  it('matches the package.json version (single source of truth)', () => {
    expect(SERVER_VERSION).toBe(packageVersion())
  })
})
