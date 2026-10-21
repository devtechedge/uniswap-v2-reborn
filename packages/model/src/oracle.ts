import { MAX_UINT256, MAX_UINT32, Q112, uqdiv, wrap256 } from "./math.js";
import type { PairState } from "./world.js";

export interface Observation {
  timestamp: bigint;
  price0Cumulative: bigint;
  price1Cumulative: bigint;
}

/** Counterfactual cumulative prices at `now`, as if `sync` were called (no state change). */
export function currentCumulativePrices(p: PairState, now: bigint): Observation {
  const ts = now & MAX_UINT32;
  let price0Cumulative = p.price0CumulativeLast;
  let price1Cumulative = p.price1CumulativeLast;
  if (p.blockTimestampLast !== ts && p.reserve0 !== 0n && p.reserve1 !== 0n) {
    const elapsed = (ts - p.blockTimestampLast) & MAX_UINT32;
    price0Cumulative = wrap256(price0Cumulative + wrap256(uqdiv(p.reserve1, p.reserve0) * elapsed));
    price1Cumulative = wrap256(price1Cumulative + wrap256(uqdiv(p.reserve0, p.reserve1) * elapsed));
  }
  return { timestamp: ts, price0Cumulative, price1Cumulative };
}

/** Time-weighted average price between two observations, as UQ112x112 (wrap-safe). */
export function twap(a: Observation, b: Observation): { price0: bigint; price1: bigint } {
  const elapsed = (b.timestamp - a.timestamp) & MAX_UINT32;
  if (elapsed === 0n) throw new Error("twap: zero elapsed time");
  return {
    price0: ((b.price0Cumulative - a.price0Cumulative) & MAX_UINT256) / elapsed,
    price1: ((b.price1Cumulative - a.price1Cumulative) & MAX_UINT256) / elapsed,
  };
}

/** UQ112x112 to a JS number, for display only. */
export const uqToNumber = (x: bigint): number => Number(x) / Number(Q112);
