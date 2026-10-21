/** pnpm --filter @v2r/differential diff [scenarios] [steps] [impls]  -> writes reports/differential.json */
import { mkdirSync, writeFileSync } from "node:fs";
import { emptyReport, runScenario } from "./run.js";
import type { Impl } from "./system.js";

const scenarios = Number(process.argv[2] ?? 100);
const steps = Number(process.argv[3] ?? 30);
const impls = (process.argv[4] ?? "original,reborn").split(",") as Impl[];
const report = emptyReport();
const t0 = Date.now();
for (let s = 1; s <= scenarios; s++) {
  await runScenario(s, steps, impls, report);
  if (s % 10 === 0) console.log(`scenario ${s}/${scenarios}: ${report.ops} ops, ${report.mismatches.length} mismatches`);
  if (report.mismatches.length) break;
}
const big = (_k: string, v: unknown) => (typeof v === "bigint" ? v.toString() : v);
const out = { generatedAt: new Date().toISOString(), seconds: (Date.now() - t0) / 1000, impls, steps, ...report };
mkdirSync(new URL("../../../reports/", import.meta.url), { recursive: true });
writeFileSync(new URL("../../../reports/differential.json", import.meta.url), JSON.stringify(out, big, 2) + "\n");
console.log(JSON.stringify({ ...out, mismatches: out.mismatches.slice(0, 3) }, big, 2));
process.exit(report.mismatches.length ? 1 : 0);
