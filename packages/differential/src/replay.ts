/**
 * Replays real mainnet swaps from evidence/historical: rebuild the pre-swap reserves in a fresh
 * pool, send the recorded input, call swap with the recorded outputs, and require the resulting
 * Sync to equal the one mainnet emitted. Runs on original bytecode, reborn Solidity and the model.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { getAmountOut } from "@v2r/model";
import { System, TOKENS, USERS, type Impl } from "./system.js";
import { execEvm, execModel, makeModel, type Op, type Outcome } from "./ops.js";

export interface HistoricalCase {
  block: number;
  tx: string;
  logIndex: number;
  before: { reserve0: string; reserve1: string };
  after: { reserve0: string; reserve1: string };
  swap: { amount0In: string; amount1In: string; amount0Out: string; amount1Out: string };
}

export function loadHistorical(): { fromBlock: number; toBlock: number; cases: HistoricalCase[] } {
  const p = fileURLToPath(new URL("../../../evidence/historical/weth-usdc-swaps.json", import.meta.url));
  return JSON.parse(readFileSync(p, "utf8"));
}

export interface ReplayResult {
  impl: Impl;
  cases: number;
  exact: number;
  modelExact: number;
  routerExactOut: number;
  failures: { tx: string; why: string }[];
}

export async function replay(impl: Impl, cases: HistoricalCase[]): Promise<ReplayResult> {
  const res: ReplayResult = { impl, cases: 0, exact: 0, modelExact: 0, routerExactOut: 0, failures: [] };
  const U = USERS[0];
  // TA < TB, so TA plays token0 (USDC) and TB plays token1 (WETH), keeping the mainnet ordering.
  const [t0, t1] = [TOKENS.TA, TOKENS.TB];
  for (const c of cases) {
    res.cases++;
    const sys = await System.create(impl);
    const w = makeModel(sys);
    const r0 = BigInt(c.before.reserve0), r1 = BigInt(c.before.reserve1);
    const s = Object.fromEntries(Object.entries(c.swap).map(([k, v]) => [k, BigInt(v)])) as Record<string, bigint>;
    const ops: Op[] = [
      { kind: "createPair", from: U, a: t0, b: t1 },
      { kind: "donate", from: U, token: t0, a: t0, b: t1, amount: r0 },
      { kind: "donate", from: U, token: t1, a: t0, b: t1, amount: r1 },
      { kind: "sync", from: U, a: t0, b: t1 },
    ];
    if (s.amount0In! > 0n) ops.push({ kind: "donate", from: U, token: t0, a: t0, b: t1, amount: s.amount0In! });
    if (s.amount1In! > 0n) ops.push({ kind: "donate", from: U, token: t1, a: t0, b: t1, amount: s.amount1In! });
    ops.push({ kind: "rawSwap", from: U, a: t0, b: t1, out0: s.amount0Out!, out1: s.amount1Out!, to: U });
    let evmLast: Outcome | undefined;
    let modelLast: Outcome | undefined;
    for (const op of ops) {
      evmLast = await execEvm(sys, op);
      modelLast = execModel(sys, w, op);
    }
    const expect = [c.after.reserve0, c.after.reserve1];
    const syncOf = (o: Outcome | undefined) => o?.events.find((e) => e.name === "Sync")?.args;
    const got = syncOf(evmLast);
    if (evmLast?.ok && JSON.stringify(got) === JSON.stringify(expect)) res.exact++;
    else res.failures.push({ tx: c.tx, why: `evm ${evmLast?.ok ? JSON.stringify(got) : evmLast?.reason}` });
    if (modelLast?.ok && JSON.stringify(syncOf(modelLast)) === JSON.stringify(expect)) res.modelExact++;
    // How many real swaps took exactly the router's getAmountOut quote for their input
    const quoted = s.amount0In! > 0n && s.amount1In === 0n ? getAmountOut(s.amount0In!, r0, r1) : s.amount1In! > 0n && s.amount0In === 0n ? getAmountOut(s.amount1In!, r1, r0) : -1n;
    if (quoted === s.amount0Out! + s.amount1Out!) res.routerExactOut++;
  }
  return res;
}
