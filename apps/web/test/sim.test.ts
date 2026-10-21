import { describe, expect, it } from "vitest";
import { createSim, observe, twapSeries, SIM, TOKENS } from "../lib/sim";
import { fmt, parse } from "../lib/format";

describe("browser simulator", () => {
  it("boots with two seeded pools and a working swap", () => {
    const w = createSim();
    expect(w.allPairs.length).toBe(2);
    const path = [TOKENS[0]!.address, TOKENS[1]!.address];
    const q = w.getAmountsOut(10n ** 20n, path);
    const r = w.tx(() => w.swapExactTokensForTokens(SIM.user, 10n ** 20n, 0n, path, SIM.user, 2n ** 64n));
    expect(r.ok && r.value).toEqual(q);
  });
  it("TWAP over a constant price equals the spot price", () => {
    const w = createSim();
    const p = w.allPairs[0]!;
    const pts = [observe(w, p)];
    w.timestamp += 3600n;
    pts.push(observe(w, p));
    const [t] = twapSeries(pts);
    expect(t!.twap).toBeCloseTo(pts[0]!.spot, 6);
  });
  it("formats and parses amounts", () => {
    expect(parse("1.5")).toBe(15n * 10n ** 17n);
    expect(parse("abc")).toBeNull();
    expect(fmt(1234567n * 10n ** 15n)).toBe("1,234.567");
  });
});
