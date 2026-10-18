import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { writeExportFile } from '../../src/core/files.ts'

const dirs: string[] = []

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-biorxiv-file-'))
  dirs.push(dir)
  return dir
}

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('writeExportFile', () => {
  it('writes inside the working directory with a private mode', async () => {
    const cwd = await tempDir()
    const path = await writeExportFile('refs.bib', '@misc{x}', { cwd })
    expect(path).toBe(join(cwd, 'refs.bib'))
    expect(await readFile(path, 'utf8')).toBe('@misc{x}')
    expect((await stat(path)).mode & 0o777).toBe(0o600)
  })

  it('refuses to overwrite unless force is true', async () => {
    const cwd = await tempDir()
    await writeExportFile('refs.bib', 'one', { cwd })
    await expect(writeExportFile('refs.bib', 'two', { cwd })).rejects.toMatchObject({ name: 'FileError', code: 'E-009' })
    expect(await readFile(join(cwd, 'refs.bib'), 'utf8')).toBe('one')
    await writeExportFile('refs.bib', 'two', { cwd, force: true })
    expect(await readFile(join(cwd, 'refs.bib'), 'utf8')).toBe('two')
  })

  it('rejects paths outside the working directory and empty paths', async () => {
    const cwd = await tempDir()
    await expect(writeExportFile('../escape.txt', 'x', { cwd })).rejects.toThrowError(/E-001/)
    await expect(writeExportFile('/etc/passwd', 'x', { cwd })).rejects.toThrowError(/E-001/)
    await expect(writeExportFile('  ', 'x', { cwd })).rejects.toThrowError(/E-001/)
  })
})
