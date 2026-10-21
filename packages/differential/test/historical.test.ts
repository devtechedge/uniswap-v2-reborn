import { describe, expect, it } from "vitest";
import { loadHistorical, replay } from "../src/replay.js";
import type { Impl } from "../src/system.js";

const LIMIT = Number(process.env.REPLAY_LIMIT ?? 120);
const IMPLS = (process.env.DIFF_IMPLS ?? "original,reborn").split(",") as Impl[];
const fixture = loadHistorical();
const cases = fixture.cases.slice(0, LIMIT);

describe(`historical replay of ${cases.length} WETH/USDC swaps (blocks ${fixture.fromBlock}-${fixture.toBlock})`, () => {
  for (const impl of IMPLS) {
    it(`${impl} reproduces every post-swap Sync exactly, and so does the model`, async () => {
      const r = await replay(impl, cases);
      expect(r.failures).toEqual([]);
      expect(r.exact).toBe(cases.length);
      expect(r.modelExact).toBe(cases.length);
    });
  }
});
