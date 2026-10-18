#!/usr/bin/env node
/** CLI bin entrypoint. */

import { runCli } from './run.ts'

runCli(process.argv.slice(2)).then((code) => {
  process.exitCode = code
})
