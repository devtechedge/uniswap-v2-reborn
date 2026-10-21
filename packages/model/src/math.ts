import { require } from "./errors.js";

export const MAX_UINT256 = (1n << 256n) - 1n;
export const MAX_UINT112 = (1n << 112n) - 1n;
export const MAX_UINT32 = (1n << 32n) - 1n;
export const Q112 = 1n << 112n;
export const MINIMUM_LIQUIDITY = 1000n;

// Checked arithmetic matching the ds-math revert strings found in the bytecode.
export function add(x: bigint, y: bigint): bigint {
  const z = x + y;
  require(z <= MAX_UINT256, "ds-math-add-overflow");
  return z;
}
export function sub(x: bigint, y: bigint): bigint {
  require(y <= x, "ds-math-sub-underflow");
  return x - y;
}
export function mul(x: bigint, y: bigint): bigint {
  const z = x * y;
  require(z <= MAX_UINT256, "ds-math-mul-overflow");
  return z;
}

/** Integer division; division by zero hits INVALID in solc < 0.8 (empty revert data). */
export function div(x: bigint, y: bigint): bigint {
  require(y !== 0n, "");
  return x / y;
}

/** Unchecked uint256 wrap, used where the original intentionally overflows. */
export const wrap256 = (x: bigint): bigint => x & MAX_UINT256;

/** Babylonian integer square root with the same edge cases: sqrt(0)=0, sqrt(1..3)=1. */
export function sqrt(y: bigint): bigint {
  if (y > 3n) {
    let z = y;
    let x = y / 2n + 1n;
    while (x < z) {
      z = x;
      x = (y / x + x) / 2n;
    }
    return z;
  }
  return y !== 0n ? 1n : 0n;
}

export const min = (a: bigint, b: bigint): bigint => (a < b ? a : b);

/** UQ112x112 encode then divide by a uint112, as used for the TWAP accumulators. */
export const uqdiv = (numerator: bigint, denominator: bigint): bigint => (numerator * Q112) / denominator;
