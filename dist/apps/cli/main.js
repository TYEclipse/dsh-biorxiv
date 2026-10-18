#!/usr/bin/env node
/** CLI bin entrypoint. */
import { runCli } from "./run.js";
runCli(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
});
//# sourceMappingURL=main.js.map