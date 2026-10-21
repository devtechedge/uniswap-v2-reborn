/** Replays every captured mainnet swap on original + reborn and writes reports/historical.json. */
import { writeFileSync } from "node:fs";
import { loadHistorical, replay } from "./replay.js";

const f = loadHistorical();
const results = [];
for (const impl of ["original", "reborn"] as const) results.push(await replay(impl, f.cases));
const out = { fromBlock: f.fromBlock, toBlock: f.toBlock, results };
writeFileSync(new URL("../../../reports/historical.json", import.meta.url), JSON.stringify(out, null, 2) + "\n");
console.log(JSON.stringify(results.map((r) => ({ impl: r.impl, cases: r.cases, exact: r.exact, modelExact: r.modelExact, routerExactOut: r.routerExactOut, failures: r.failures.length }))));
process.exit(results.every((r) => r.failures.length === 0) ? 0 : 1);
