import { describe, expect, it } from "vitest";
import { emptyReport, runScenario } from "../src/run.js";
import type { Impl } from "../src/system.js";

const SCENARIOS = Number(process.env.DIFF_SCENARIOS ?? 12);
const STEPS = Number(process.env.DIFF_STEPS ?? 30);
const IMPLS = (process.env.DIFF_IMPLS ?? "original,reborn").split(",") as Impl[];

describe(`differential fuzz (${SCENARIOS} scenarios x ${STEPS} ops, ${IMPLS.join(" + ")} + model)`, () => {
  it("original bytecode, TS model and reborn Solidity agree on every op and state", async () => {
    const report = emptyReport();
    for (let s = 1000; s < 1000 + SCENARIOS; s++) await runScenario(s, STEPS, IMPLS, report);
    expect(report.mismatches).toEqual([]);
    expect(report.ops).toBe(SCENARIOS * STEPS);
    expect(report.okOps).toBeGreaterThan(report.ops / 2);
  });
});
