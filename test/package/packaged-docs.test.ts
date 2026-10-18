import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { basename, dirname, join, normalize, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = fileURLToPath(new URL('../../', import.meta.url))
const MD_REFERENCE = /[A-Za-z0-9_./-]+\.md\b/g

type Exists = (absolutePath: string) => boolean

const isFile: Exists = (absolutePath) => existsSync(absolutePath) && statSync(absolutePath).isFile()

function addPath(entry: string, out: Set<string>): void {
  const absolute = join(ROOT, entry)
  if (!existsSync(absolute)) return
  if (statSync(absolute).isDirectory()) {
    for (const name of readdirSync(absolute)) {
      if (name === 'node_modules' || name === '.git') continue
      addPath(`${entry}/${name}`, out)
    }
    return
  }
  out.add(normalize(entry))
}

function shippedFiles(): Set<string> {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { files?: string[] }
  const shipped = new Set<string>(['package.json'])
  for (const entry of pkg.files ?? []) addPath(entry, shipped)
  return shipped
}

export function findPrivateRefs(
  doc: string,
  text: string,
  shipped: Set<string>,
  exists: Exists = isFile,
): string[] {
  const found: string[] = []
  for (const match of text.matchAll(MD_REFERENCE)) {
    const reference = match[0]
    const candidates = [
      join(ROOT, reference),
      join(ROOT, dirname(doc), reference),
      join(ROOT, basename(reference)),
    ]
    const hit = candidates.find((candidate) => exists(candidate))
    if (hit === undefined) continue
    if (!shipped.has(normalize(relative(ROOT, hit)))) found.push(`${doc} -> ${reference}`)
  }
  return [...new Set(found)]
}

describe('packaged documentation', () => {
  it('does not reference private project files', () => {
    const shipped = shippedFiles()
    const docs = [...shipped].filter((path) => path.endsWith('.md'))
    const violations = docs.flatMap((doc) =>
      findPrivateRefs(doc, readFileSync(join(ROOT, doc), 'utf8'), shipped),
    )
    expect(violations).toEqual([])
  })

  it('ships the release documents required by PLAN 8.2', () => {
    const shipped = shippedFiles()
    for (const required of ['README.md', 'LICENSE', 'CHANGELOG.md', 'PRIVACY.md']) {
      expect(shipped.has(required), `${required} must be in package.json files`).toBe(true)
    }
  })

  it('detects a reference to a private evidence file', () => {
    const shipped = new Set(['README.md'])
    const exists: Exists = (absolutePath) => absolutePath.endsWith('/G1_EVIDENCE.md')
    expect(findPrivateRefs('skills/dsh-biorxiv/SKILL.md', 'see G1_EVIDENCE.md', shipped, exists)).toEqual([
      'skills/dsh-biorxiv/SKILL.md -> G1_EVIDENCE.md',
    ])
  })
})
