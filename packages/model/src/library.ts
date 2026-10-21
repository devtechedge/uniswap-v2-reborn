import { require } from "./errors.js";
import { add, div, mul, sub } from "./math.js";

const L = "UniswapV2Library: ";

export function quote(amountA: bigint, reserveA: bigint, reserveB: bigint): bigint {
  require(amountA > 0n, L + "INSUFFICIENT_AMOUNT");
  require(reserveA > 0n && reserveB > 0n, L + "INSUFFICIENT_LIQUIDITY");
  return div(mul(amountA, reserveB), reserveA);
}

export function getAmountOut(amountIn: bigint, reserveIn: bigint, reserveOut: bigint): bigint {
  require(amountIn > 0n, L + "INSUFFICIENT_INPUT_AMOUNT");
  require(reserveIn > 0n && reserveOut > 0n, L + "INSUFFICIENT_LIQUIDITY");
  const amountInWithFee = mul(amountIn, 997n);
  const numerator = mul(amountInWithFee, reserveOut);
  const denominator = add(mul(reserveIn, 1000n), amountInWithFee);
  return div(numerator, denominator);
}

export function getAmountIn(amountOut: bigint, reserveIn: bigint, reserveOut: bigint): bigint {
  require(amountOut > 0n, L + "INSUFFICIENT_OUTPUT_AMOUNT");
  require(reserveIn > 0n && reserveOut > 0n, L + "INSUFFICIENT_LIQUIDITY");
  const numerator = mul(mul(reserveIn, amountOut), 1000n);
  const denominator = mul(sub(reserveOut, amountOut), 997n);
  return add(div(numerator, denominator), 1n);
}
