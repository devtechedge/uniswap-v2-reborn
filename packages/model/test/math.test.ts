import { describe, expect, it } from "vitest";
import { MAX_UINT256, Revert, add, div, getAmountIn, getAmountOut, mul, quote, sqrt, sub, uqdiv, Q112 } from "../src/index.js";

const reason = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    if (e instanceof Revert) return e.reason;
    throw e;
  }
  return null;
};

describe("ds-math", () => {
  it("reverts with the original strings", () => {
    expect(reason(() => add(MAX_UINT256, 1n))).toBe("ds-math-add-overflow");
    expect(reason(() => sub(1n, 2n))).toBe("ds-math-sub-underflow");
    expect(reason(() => mul(MAX_UINT256, 2n))).toBe("ds-math-mul-overflow");
    expect(reason(() => div(1n, 0n))).toBe("");
  });
  it("passes in range", () => {
    expect(add(1n, 2n)).toBe(3n);
    expect(mul(0n, MAX_UINT256)).toBe(0n);
  });
});

describe("sqrt", () => {
  it("handles the small cases", () => {
    expect([0n, 1n, 2n, 3n, 4n, 8n, 9n].map(sqrt)).toEqual([0n, 1n, 1n, 1n, 2n, 2n, 3n]);
  });
  it("is the floor square root on random values", () => {
    for (let i = 0; i < 500; i++) {
      const y = BigInt(Math.floor(Math.random() * 2 ** 50)) ** 3n;
      const r = sqrt(y);
      expect(r * r <= y && (r + 1n) * (r + 1n) > y).toBe(true);
    }
  });
});

describe("library", () => {
  it("getAmountOut matches the docs example shape", () => {
    expect(getAmountOut(1000n, 100_000n, 100_000n)).toBe(987n);
  });
  it("getAmountIn is the inverse rounded up", () => {
    for (let i = 1n; i < 200n; i++) {
      const rIn = 10n ** 18n + i * 7919n;
      const rOut = 5n * 10n ** 17n + i;
      const out = i * 10n ** 14n;
      const inp = getAmountIn(out, rIn, rOut);
      expect(getAmountOut(inp, rIn, rOut) >= out).toBe(true);
      expect(getAmountOut(inp - 1n, rIn, rOut) < out).toBe(true);
    }
  });
  it("validates inputs", () => {
    expect(reason(() => getAmountOut(0n, 1n, 1n))).toBe("UniswapV2Library: INSUFFICIENT_INPUT_AMOUNT");
    expect(reason(() => getAmountOut(1n, 0n, 1n))).toBe("UniswapV2Library: INSUFFICIENT_LIQUIDITY");
    expect(reason(() => getAmountIn(0n, 1n, 1n))).toBe("UniswapV2Library: INSUFFICIENT_OUTPUT_AMOUNT");
    expect(reason(() => getAmountIn(5n, 10n, 5n))).toBe("");
    expect(reason(() => getAmountIn(6n, 10n, 5n))).toBe("ds-math-sub-underflow");
    expect(reason(() => quote(0n, 1n, 1n))).toBe("UniswapV2Library: INSUFFICIENT_AMOUNT");
    expect(quote(10n, 20n, 40n)).toBe(20n);
  });
  it("uqdiv encodes a UQ112x112 ratio", () => {
    expect(uqdiv(2n, 1n)).toBe(2n * Q112);
  });
});
