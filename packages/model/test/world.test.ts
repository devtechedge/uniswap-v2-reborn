import { describe, expect, it } from "vitest";
import { type Address } from "viem";
import { MINIMUM_LIQUIDITY, World, ZERO_ADDRESS, MAINNET_PAIR_INIT_CODE_HASH, currentCumulativePrices, twap, Q112, MAX_UINT256 } from "../src/index.js";

const FACTORY = "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f" as Address;
const ROUTER = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D" as Address;
const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2" as Address;
const TA = "0x1000000000000000000000000000000000000001" as Address;
const TB = "0x2000000000000000000000000000000000000002" as Address;
const TC = "0x3000000000000000000000000000000000000003" as Address;
const ALICE = "0xA11CE00000000000000000000000000000000001" as Address;
const FEE = "0xFEE0000000000000000000000000000000000001" as Address;
const E18 = 10n ** 18n;

function setup() {
  const w = new World({ factory: FACTORY, router: ROUTER, weth: WETH, initCodeHash: MAINNET_PAIR_INIT_CODE_HASH, feeToSetter: ALICE });
  for (const t of [TA, TB, TC]) {
    w.addToken(t);
    w.mintToken(t, ALICE, 10n ** 30n);
    w.tokenApprove(t, ALICE, ROUTER, MAX_UINT256);
  }
  w.dealEth(ALICE, 10n ** 24n);
  return w;
}

describe("pair lifecycle", () => {
  it("locks MINIMUM_LIQUIDITY at address(0) on first mint", () => {
    const w = setup();
    const r = w.tx(() => w.addLiquidity(ALICE, TA, TB, 4n * E18, E18, 0n, 0n, ALICE, MAX_UINT256));
    expect(r.ok).toBe(true);
    const pair = w.getPair(TA, TB);
    expect(w.balanceOf(pair, ZERO_ADDRESS)).toBe(MINIMUM_LIQUIDITY);
    expect(w.balanceOf(pair, ALICE)).toBe(2n * E18 - MINIMUM_LIQUIDITY);
    if (r.ok) expect(r.events.map((e) => e.name)).toEqual(["PairCreated", "Transfer", "Transfer", "Transfer", "Transfer", "Sync", "Mint"]);
  });
  it("first mint below MINIMUM_LIQUIDITY underflows", () => {
    const w = setup();
    const r = w.tx(() => w.addLiquidity(ALICE, TA, TB, 999n, 1000n, 0n, 0n, ALICE, MAX_UINT256));
    expect(r).toEqual({ ok: false, reason: "ds-math-sub-underflow" });
    expect(w.getPair(TA, TB)).toBe(ZERO_ADDRESS); // rolled back including createPair
  });
  it("swap follows getAmountOut and keeps K", () => {
    const w = setup();
    w.tx(() => w.addLiquidity(ALICE, TA, TB, 10n * E18, 10n * E18, 0n, 0n, ALICE, MAX_UINT256));
    const r = w.tx(() => w.swapExactTokensForTokens(ALICE, E18, 0n, [TA, TB], ALICE, MAX_UINT256));
    expect(r.ok && r.value[1]).toBe(906610893880149131n);
    const p = w.pair(w.getPair(TA, TB));
    expect(p.reserve0 * p.reserve1 >= 100n * E18 * E18).toBe(true);
  });
  it("rejects slippage, expired deadline and bad paths", () => {
    const w = setup();
    w.tx(() => w.addLiquidity(ALICE, TA, TB, E18, E18, 0n, 0n, ALICE, MAX_UINT256));
    expect(w.tx(() => w.swapExactTokensForTokens(ALICE, 1000n, 10n ** 6n, [TA, TB], ALICE, MAX_UINT256))).toEqual({ ok: false, reason: "UniswapV2Router: INSUFFICIENT_OUTPUT_AMOUNT" });
    expect(w.tx(() => w.swapExactTokensForTokens(ALICE, 1000n, 0n, [TA, TB], ALICE, 0n))).toEqual({ ok: false, reason: "UniswapV2Router: EXPIRED" });
    expect(w.tx(() => w.swapExactTokensForTokens(ALICE, 1000n, 0n, [TA], ALICE, MAX_UINT256))).toEqual({ ok: false, reason: "UniswapV2Library: INVALID_PATH" });
    expect(w.tx(() => w.swapTokensForExactTokens(ALICE, 1000n, 1n, [TA, TB], ALICE, MAX_UINT256))).toEqual({ ok: false, reason: "UniswapV2Router: EXCESSIVE_INPUT_AMOUNT" });
    expect(w.tx(() => w.swapExactTokensForTokens(ALICE, 1000n, 0n, [TA, TC], ALICE, MAX_UINT256))).toEqual({ ok: false, reason: "" });
  });
  it("multi-hop routes through intermediate pairs", () => {
    const w = setup();
    w.tx(() => w.addLiquidity(ALICE, TA, TB, 5n * E18, 5n * E18, 0n, 0n, ALICE, MAX_UINT256));
    w.tx(() => w.addLiquidity(ALICE, TB, TC, 5n * E18, 9n * E18, 0n, 0n, ALICE, MAX_UINT256));
    const quoted = w.getAmountsOut(E18, [TA, TB, TC]);
    const before = w.balanceOf(TC, ALICE);
    const r = w.tx(() => w.swapExactTokensForTokens(ALICE, E18, 0n, [TA, TB, TC], ALICE, MAX_UINT256));
    expect(r.ok).toBe(true);
    expect(w.balanceOf(TC, ALICE) - before).toBe(quoted[2]);
  });
  it("swap without paying reverts K, flash swap with fee succeeds", () => {
    const w = setup();
    w.tx(() => w.addLiquidity(ALICE, TA, TB, 10n * E18, 10n * E18, 0n, 0n, ALICE, MAX_UINT256));
    const pair = w.getPair(TA, TB);
    const BOR = "0xB0B0000000000000000000000000000000000001" as Address;
    const [t0] = BigInt(TA) < BigInt(TB) ? [TA] : [TB];
    w.mintToken(t0, BOR, E18);
    expect(w.tx(() => w.pairSwap(ALICE, pair, E18, 0n, BOR, { repayToken: t0, repayAmount: E18 })).ok).toBe(false);
    expect(w.tx(() => w.pairSwap(ALICE, pair, E18, 0n, BOR, { repayToken: t0, repayAmount: (E18 * 1000n) / 997n })).ok).toBe(false);
    expect(w.tx(() => w.pairSwap(ALICE, pair, E18, 0n, BOR, { repayToken: t0, repayAmount: (E18 * 1000n) / 997n + 1n })).ok).toBe(true);
    expect(w.tx(() => w.pairSwap(ALICE, pair, 1n, 0n, BOR, { repayToken: t0, repayAmount: 2n, reenter: true }))).toEqual({ ok: false, reason: "UniswapV2: LOCKED" });
    expect(w.tx(() => w.pairSwap(ALICE, pair, E18, 0n, BOR, { repayToken: t0, repayAmount: 0n }))).toEqual({ ok: false, reason: "UniswapV2: INSUFFICIENT_INPUT_AMOUNT" });
    expect(w.tx(() => w.pairSwap(ALICE, pair, 0n, 0n, BOR))).toEqual({ ok: false, reason: "UniswapV2: INSUFFICIENT_OUTPUT_AMOUNT" });
    expect(w.tx(() => w.pairSwap(ALICE, pair, 100n * E18, 0n, BOR))).toEqual({ ok: false, reason: "UniswapV2: INSUFFICIENT_LIQUIDITY" });
    expect(w.tx(() => w.pairSwap(ALICE, pair, 1n, 0n, TA))).toEqual({ ok: false, reason: "UniswapV2: INVALID_TO" });
  });
  it("protocol fee mints one sixth of sqrt(k) growth to feeTo", () => {
    const w = setup();
    w.setFeeTo(ALICE, FEE);
    w.tx(() => w.addLiquidity(ALICE, TA, TB, 1000n * E18, 1000n * E18, 0n, 0n, ALICE, MAX_UINT256));
    for (let i = 0; i < 20; i++) w.tx(() => w.swapExactTokensForTokens(ALICE, 50n * E18, 0n, i % 2 ? [TA, TB] : [TB, TA], ALICE, MAX_UINT256));
    const pair = w.getPair(TA, TB);
    w.tx(() => w.addLiquidity(ALICE, TA, TB, E18, E18, 0n, E18 / 2n, ALICE, MAX_UINT256));
    expect(w.balanceOf(pair, FEE) > 0n).toBe(true);
    expect(w.pair(pair).kLast).toBe(w.pair(pair).reserve0 * w.pair(pair).reserve1);
    w.setFeeTo(ALICE, ZERO_ADDRESS);
    w.tx(() => w.addLiquidity(ALICE, TA, TB, E18, E18, 0n, 0n, ALICE, MAX_UINT256));
    expect(w.pair(pair).kLast).toBe(0n);
    expect(w.tx(() => w.setFeeTo(FEE, FEE))).toEqual({ ok: false, reason: "UniswapV2: FORBIDDEN" });
  });
  it("remove liquidity returns pro-rata amounts", () => {
    const w = setup();
    w.tx(() => w.addLiquidity(ALICE, TA, TB, 4n * E18, E18, 0n, 0n, ALICE, MAX_UINT256));
    const pair = w.getPair(TA, TB);
    w.tokenApprove(pair, ALICE, ROUTER, MAX_UINT256);
    const r = w.tx(() => w.removeLiquidity(ALICE, TA, TB, E18, 0n, 0n, ALICE, MAX_UINT256));
    expect(r.ok && r.value).toEqual([2n * E18, E18 / 2n]);
    expect(w.tx(() => w.removeLiquidity(ALICE, TA, TB, 10n ** 30n, 0n, 0n, ALICE, MAX_UINT256))).toEqual({ ok: false, reason: "ds-math-sub-underflow" });
  });
  it("ETH routes wrap, unwrap and refund", () => {
    const w = setup();
    const r = w.tx(() => w.addLiquidityETH(ALICE, 3n * E18, TA, 6n * E18, 0n, 0n, ALICE, MAX_UINT256));
    expect(r.ok).toBe(true);
    const ethBefore = w.ethBalance(ALICE);
    const s = w.tx(() => w.swapExactTokensForETH(ALICE, E18, 0n, [TA, WETH], ALICE, MAX_UINT256));
    expect(s.ok).toBe(true);
    expect(w.ethBalance(ALICE) > ethBefore).toBe(true);
    expect(w.tx(() => w.swapExactETHForTokens(ALICE, E18, 0n, [TA, WETH], ALICE, MAX_UINT256))).toEqual({ ok: false, reason: "UniswapV2Router: INVALID_PATH" });
    const pair = w.getPair(TA, WETH);
    w.tokenApprove(pair, ALICE, ROUTER, MAX_UINT256);
    expect(w.tx(() => w.removeLiquidityETH(ALICE, TA, E18, 0n, 0n, ALICE, MAX_UINT256)).ok).toBe(true);
    expect(w.ethBalance(ROUTER)).toBe(0n);
  });
  it("skim and sync reconcile donations", () => {
    const w = setup();
    w.tx(() => w.addLiquidity(ALICE, TA, TB, E18, E18, 0n, 0n, ALICE, MAX_UINT256));
    const pair = w.getPair(TA, TB);
    w.tokenTransfer(TA, ALICE, pair, 123n);
    w.tx(() => w.pairSkim(ALICE, pair, FEE));
    expect(w.balanceOf(TA, FEE)).toBe(123n);
    w.tokenTransfer(TA, ALICE, pair, 7n);
    w.tx(() => w.pairSync(ALICE, pair));
    const p = w.pair(pair);
    expect(p.reserve0 + p.reserve1).toBe(2n * E18 + 7n);
  });
  it("uint112 overflow is rejected", () => {
    const w = setup();
    w.mintToken(TA, ALICE, 1n << 120n);
    expect(w.tx(() => w.addLiquidity(ALICE, TA, TB, 1n << 113n, E18, 0n, 0n, ALICE, MAX_UINT256))).toEqual({ ok: false, reason: "UniswapV2: OVERFLOW" });
  });
  it("TWAP accumulates price times elapsed seconds", () => {
    const w = setup();
    w.tx(() => w.addLiquidity(ALICE, TA, TB, 2n * E18, E18, 0n, 0n, ALICE, MAX_UINT256));
    const p = w.pair(w.getPair(TA, TB));
    const o1 = currentCumulativePrices(p, w.timestamp);
    w.timestamp += 3600n;
    const o2 = currentCumulativePrices(p, w.timestamp);
    const { price0, price1 } = twap(o1, o2);
    // token0 = TA holds 2e18, token1 = TB holds 1e18
    expect(price0).toBe(Q112 / 2n);
    expect(price1).toBe(2n * Q112);
    w.tx(() => w.pairSync(ALICE, p.address));
    expect(w.pair(p.address).price0CumulativeLast).toBe(o2.price0Cumulative);
  });
});
