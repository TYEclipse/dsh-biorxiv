#!/usr/bin/env node
/** Coverage ratchet: fail if line coverage falls below the committed baseline. */

import { readFile, writeFile } from 'node:fs/promises'

const summaryPath = new URL('../coverage/coverage-summary.json', import.meta.url)
const baselinePath = new URL('../.coverage-baseline.json', import.meta.url)
const checkOnly = process.argv.includes('--check')

function lines(summary) {
  const value = summary?.total?.lines?.pct
  if (typeof value !== 'number' || Number.isNaN(value)) throw new Error('invalid coverage summary')
  return Math.round(value * 100) / 100
}

const current = lines(JSON.parse(await readFile(summaryPath, 'utf8')))
let baseline = current
try {
  baseline = lines(JSON.parse(await readFile(baselinePath, 'utf8')))
} catch {
  baseline = 0
}

console.log(`coverage: current ${current}% / baseline ${baseline}%`)
if (current < baseline) {
  console.error(`coverage ratchet failed: ${current}% < ${baseline}%`)
  process.exit(1)
}
if (!checkOnly && current > baseline) {
  await writeFile(baselinePath, JSON.stringify({ total: { lines: { pct: current } } }, null, 2) + '\n')
  console.log(`coverage baseline updated: ${baseline}% -> ${current}%`)
}
