/** Seeded, model-guided scenario generator. Mixes valid flows with deliberate edge cases. */
import type { Address } from "viem";
import { MAX_UINT112, getAmountIn, type World } from "@v2r/model";
import { ADMIN, PAIR_KEYS, TOKENS, USERS, WETH, ZERO, type System } from "./system.js";
import type { Op } from "./ops.js";

export class Rng {
  private s: bigint;
  constructor(seed: number) {
    this.s = BigInt(seed) * 0x9e3779b97f4a7c15n + 1n;
  }
  next(): bigint {
    // xorshift64*
    let x = this.s & 0xffffffffffffffffn;
    x ^= x >> 12n; x ^= (x << 25n) & 0xffffffffffffffffn; x ^= x >> 27n;
    this.s = x;
    return (x * 0x2545f4914f6cdd1dn) & 0xffffffffffffffffn;
  }
  int(n: number): number {
    return Number(this.next() % BigInt(n));
  }
  chance(p: number): boolean {
    return this.int(1_000_000) < p * 1_000_000;
  }
  pick<T>(xs: readonly T[]): T {
    return xs[this.int(xs.length)]!;
  }
  /** Below `max`, log-uniform across magnitudes. */
  below(max: bigint): bigint {
    if (max <= 0n) return 0n;
    const bits = max.toString(2).length;
    const b = 1 + this.int(bits);
    let v = 0n;
    for (let i = 0; i < b; i += 60) v = (v << 60n) | this.next();
    return v % (1n << BigInt(b)) % max;
  }
  /** A token amount across 1 wei .. 1e26 with a bias toward realistic sizes. */
  amount(): bigint {
    const mags = [0, 1, 3, 6, 9, 12, 15, 17, 18, 18, 19, 20, 21, 22, 24, 26];
    const m = BigInt(this.pick(mags));
    return (10n ** m * BigInt(1 + this.int(999))) / 100n;
  }
}

const PATHS: Address[][] = [
  [TOKENS.TA, TOKENS.TB], [TOKENS.TB, TOKENS.TA], [TOKENS.TB, TOKENS.TC], [TOKENS.TC, TOKENS.TB],
  [TOKENS.TA, TOKENS.TB, TOKENS.TC], [TOKENS.TC, TOKENS.TB, TOKENS.TA], [TOKENS.TA, WETH], [WETH, TOKENS.TA],
  [TOKENS.TA, WETH, TOKENS.TC], [TOKENS.TC, WETH, TOKENS.TA, TOKENS.TB], [TOKENS.TA, TOKENS.TC], [TOKENS.TA],
];

export function generateOp(rng: Rng, sys: System, w: World): Op {
  const from = rng.pick(USERS);
  const deadline = rng.chance(0.03) ? w.timestamp - 1n : 2n ** 64n;
  const [a, b] = rng.pick(PAIR_KEYS);
  const pair = w.pairs.get(sys.pairAddress(a, b));
  const lp = pair ? w.balanceOf(pair.address, from) : 0n;
  const reserves = (x: Address, y: Address): [bigint, bigint] => {
    try {
      return w.getReserves(x, y);
    } catch {
      return [0n, 0n];
    }
  };
  // Seed liquidity early so most ops hit live pools instead of empty-address reverts.
  const missing = PAIR_KEYS.filter(([x, y]) => !w.pairs.has(sys.pairAddress(x, y)));
  if (missing.length && rng.chance(0.15 + 0.1 * missing.length)) {
    const [x, y] = rng.pick(missing);
    const amt = () => 10n ** BigInt(18 + rng.int(5)) * BigInt(1 + rng.int(50));
    if (y === WETH) return { kind: "addLiquidityETH", from, token: x, tokenDesired: amt(), value: 10n ** 18n * BigInt(1 + rng.int(500)), tokenMin: 0n, ethMin: 0n, deadline: 2n ** 64n };
    return { kind: "addLiquidity", from, a: x, b: y, aDesired: amt(), bDesired: amt(), aMin: 0n, bMin: 0n, deadline: 2n ** 64n };
  }
  // Removing liquidity needs an LP allowance for the router; grant it most of the time first.
  if (pair && lp > 0n && (pair.allowances.get(`${from}|${sys.router}`) ?? 0n) === 0n && rng.chance(0.3)) return { kind: "approveLP", from, a, b };
  const roll = rng.int(100);
  if (roll < 5) return { kind: "warp", seconds: rng.chance(0.05) ? 3_000_000_000n : BigInt(rng.int(100_000)) };
  if (roll < 8) return { kind: "setFeeTo", from: rng.chance(0.8) ? ADMIN : from, on: rng.chance(0.6) };
  if (roll < 10) {
    const opts: [Address, Address][] = [[a, b], [a, a], [ZERO, a], [TOKENS.TC, TOKENS.TA]];
    const [x, y] = rng.pick(opts);
    return { kind: "createPair", from, a: x, b: y };
  }
  if (roll < 28) {
    const [ra, rb] = reserves(a, b);
    const aDesired = rng.chance(0.02) ? MAX_UINT112 : rng.amount();
    let bDesired = rng.amount();
    if (ra > 0n && rng.chance(0.6)) bDesired = (aDesired * rb) / ra + BigInt(rng.int(3)) - 1n;
    if (bDesired < 0n) bDesired = 0n;
    const tight = rng.chance(0.1);
    const order = rng.chance(0.5);
    const x = order ? a : b, y = order ? b : a;
    const xd = order ? aDesired : bDesired, yd = order ? bDesired : aDesired;
    if (x === WETH || y === WETH) {
      const token = x === WETH ? y : x;
      const td = x === WETH ? yd : xd;
      const ed = x === WETH ? xd : yd;
      return { kind: "addLiquidityETH", from, token, tokenDesired: td, value: ed > 10n ** 27n ? 10n ** 24n : ed, tokenMin: tight ? td : 0n, ethMin: tight ? ed : 0n, deadline };
    }
    return { kind: "addLiquidity", from, a: x, b: y, aDesired: xd, bDesired: yd, aMin: tight ? xd : 0n, bMin: tight ? yd : 0n, deadline };
  }
  if (roll < 33) return { kind: "approveLP", from, a, b };
  if (roll < 42) {
    // act as whichever user holds the most LP in this pool, so burns usually have something to burn
    let holder: Address = from;
    for (const u of USERS) if (pair && w.balanceOf(pair.address, u) > w.balanceOf(pair.address, holder)) holder = u;
    const lp = pair ? w.balanceOf(pair.address, holder) : 0n;
    const from2 = holder;
    if (pair && lp > 0n && (pair.allowances.get(`${holder}|${sys.router}`) ?? 0n) === 0n && rng.chance(0.9)) return { kind: "approveLP", from: holder, a, b };
    const liquidity = rng.chance(0.1) ? lp + 1n + rng.below(10n ** 18n) : rng.below(lp + 1n);
    const tight = rng.chance(0.1);
    if (a === WETH || b === WETH) {
      const token = a === WETH ? b : a;
      return { kind: "removeLiquidityETH", from: from2, token, liquidity, tokenMin: tight ? 10n ** 30n : 0n, ethMin: 0n, deadline };
    }
    return { kind: "removeLiquidity", from: from2, a, b, liquidity, aMin: 0n, bMin: tight ? 10n ** 30n : 0n, deadline };
  }
  if (roll < 70) {
    const path = rng.pick(PATHS);
    const [rIn, rOut] = path.length >= 2 ? reserves(path[0]!, path[1]!) : [0n, 0n];
    const mode = rng.int(4);
    if (mode === 0 || mode === 1) {
      const amountIn = rIn > 0n && rng.chance(0.7) ? rng.below(rIn) + 1n : rng.amount();
      let minOut = 0n;
      if (rng.chance(0.15)) {
        try {
          const q = w.getAmountsOut(amountIn, path);
          minOut = q[q.length - 1]! + BigInt(rng.int(2));
        } catch {
          minOut = 1n;
        }
      }
      if (path[0] === WETH && mode === 1) return { kind: "swapExactETHIn", from, path, value: amountIn > 10n ** 26n ? 10n ** 24n : amountIn, minOut, deadline };
      if (path[path.length - 1] === WETH && mode === 1) return { kind: "swapExactInForETH", from, path, amountIn, minOut, deadline };
      return { kind: "swapExactIn", from, path, amountIn, minOut, deadline };
    }
    const last = path.length >= 2 ? reserves(path[path.length - 2]!, path[path.length - 1]!)[1] : 0n;
    const amountOut = last > 0n && rng.chance(0.85) ? rng.below(last + 2n) : rng.amount();
    let maxIn = 2n ** 255n;
    if (rng.chance(0.15)) {
      try {
        maxIn = w.getAmountsIn(amountOut, path)[0]! - BigInt(rng.int(2));
      } catch {
        maxIn = 0n;
      }
    }
    return { kind: "swapExactOut", from, path, amountOut, maxIn, deadline };
  }
  if (roll < 82) {
    const r0 = pair?.reserve0 ?? 0n;
    const r1 = pair?.reserve1 ?? 0n;
    const zeroSide = rng.chance(0.5);
    const out0 = zeroSide ? rng.below(r0 + 2n) : 0n;
    const out1 = zeroSide ? (rng.chance(0.1) ? rng.below(r1 + 1n) : 0n) : rng.below(r1 + 2n);
    const repayToken = out0 > 0n ? (pair?.token0 ?? a) : (pair?.token1 ?? b);
    const owed = out0 + out1;
    let repay = 0n;
    if (owed > 0n && rng.chance(0.85)) repay = (owed * 1000n) / 997n + BigInt(rng.int(5)) - 2n;
    if (repay < 0n) repay = 0n;
    if (repayToken === WETH) {
      // the receiver holds no WETH; repay with the other token to exercise cross-token flash swaps
      const other = pair ? (pair.token0 === WETH ? pair.token1 : pair.token0) : a;
      return { kind: "flash", from, a, b, out0, out1, repayToken: other, repay: repay * 3n, reenter: rng.chance(0.08) };
    }
    return { kind: "flash", from, a, b, out0, out1, repayToken, repay, reenter: rng.chance(0.08) };
  }
  if (roll < 87) {
    const to = rng.pick<Address>([from, a, b, from]);
    const r0 = pair?.reserve0 ?? 0n;
    return { kind: "rawSwap", from, a, b, out0: rng.below(r0 / 100n + 2n), out1: 0n, to };
  }
  if (roll < 94) {
    const token = rng.pick([a, b].filter((t) => t !== WETH)) ?? TOKENS.TA;
    return { kind: "donate", from, token, a, b, amount: rng.chance(0.03) ? MAX_UINT112 : rng.amount() };
  }
  if (roll < 97) return { kind: "skim", from, a, b, to: rng.pick<Address>([from, USERS[0], a]) };
  return { kind: "sync", from, a, b };
}

/** Small helper used by tests: exact input amount needed for an output, or null. */
export function needed(out: bigint, rIn: bigint, rOut: bigint): bigint | null {
  try {
    return getAmountIn(out, rIn, rOut);
  } catch {
    return null;
  }
}
