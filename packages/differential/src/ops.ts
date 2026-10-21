/** Operation language shared by the fuzzer, the EVM executor and the model executor. */
import { encodeAbiParameters, type Address } from "viem";
import { MAX_UINT256, World, type ModelEvent } from "@v2r/model";
import { ADMIN, ALL_TOKENS, BORROWER, DEPLOYER, FEE_TO, PAIR_KEYS, TOKENS, USERS, WETH, ZERO, type LabeledEvent, type System } from "./system.js";

export type Op =
  | { kind: "warp"; seconds: bigint }
  | { kind: "setFeeTo"; from: Address; on: boolean }
  | { kind: "createPair"; from: Address; a: Address; b: Address }
  | { kind: "addLiquidity"; from: Address; a: Address; b: Address; aDesired: bigint; bDesired: bigint; aMin: bigint; bMin: bigint; deadline: bigint }
  | { kind: "addLiquidityETH"; from: Address; token: Address; tokenDesired: bigint; value: bigint; tokenMin: bigint; ethMin: bigint; deadline: bigint }
  | { kind: "approveLP"; from: Address; a: Address; b: Address }
  | { kind: "removeLiquidity"; from: Address; a: Address; b: Address; liquidity: bigint; aMin: bigint; bMin: bigint; deadline: bigint }
  | { kind: "removeLiquidityETH"; from: Address; token: Address; liquidity: bigint; tokenMin: bigint; ethMin: bigint; deadline: bigint }
  | { kind: "swapExactIn"; from: Address; path: Address[]; amountIn: bigint; minOut: bigint; deadline: bigint }
  | { kind: "swapExactOut"; from: Address; path: Address[]; amountOut: bigint; maxIn: bigint; deadline: bigint }
  | { kind: "swapExactETHIn"; from: Address; path: Address[]; value: bigint; minOut: bigint; deadline: bigint }
  | { kind: "swapExactInForETH"; from: Address; path: Address[]; amountIn: bigint; minOut: bigint; deadline: bigint }
  | { kind: "flash"; from: Address; a: Address; b: Address; out0: bigint; out1: bigint; repayToken: Address; repay: bigint; reenter: boolean }
  | { kind: "rawSwap"; from: Address; a: Address; b: Address; out0: bigint; out1: bigint; to: Address }
  | { kind: "donate"; from: Address; token: Address; a: Address; b: Address; amount: bigint }
  | { kind: "skim"; from: Address; a: Address; b: Address; to: Address }
  | { kind: "sync"; from: Address; a: Address; b: Address };

export interface Outcome {
  ok: boolean;
  reason: string;
  events: LabeledEvent[];
  gasUsed?: bigint;
}

/** Executes an op against deployed bytecode. */
export async function execEvm(sys: System, op: Op): Promise<Outcome> {
  const R = sys.router;
  const run = async (from: Address, to: Address, data: `0x${string}`, value = 0n): Promise<Outcome> => {
    const r = await sys.call(from, to, data, value);
    return { ok: r.ok, reason: r.reason, events: sys.labelEvents(r.logs), gasUsed: r.gasUsed };
  };
  switch (op.kind) {
    case "warp":
      sys.chain.timestamp += op.seconds;
      sys.chain.number += 1n;
      return { ok: true, reason: "", events: [] };
    case "setFeeTo":
      return run(op.from, sys.factory, sys.factoryData("setFeeTo", [op.on ? FEE_TO : ZERO]));
    case "createPair":
      return run(op.from, sys.factory, sys.factoryData("createPair", [op.a, op.b]));
    case "addLiquidity":
      return run(op.from, R, sys.routerData("addLiquidity", [op.a, op.b, op.aDesired, op.bDesired, op.aMin, op.bMin, op.from, op.deadline]));
    case "addLiquidityETH":
      return run(op.from, R, sys.routerData("addLiquidityETH", [op.token, op.tokenDesired, op.tokenMin, op.ethMin, op.from, op.deadline]), op.value);
    case "approveLP":
      return run(op.from, sys.pairAddress(op.a, op.b), sys.pairData("approve", [R, MAX_UINT256]));
    case "removeLiquidity":
      return run(op.from, R, sys.routerData("removeLiquidity", [op.a, op.b, op.liquidity, op.aMin, op.bMin, op.from, op.deadline]));
    case "removeLiquidityETH":
      return run(op.from, R, sys.routerData("removeLiquidityETH", [op.token, op.liquidity, op.tokenMin, op.ethMin, op.from, op.deadline]));
    case "swapExactIn":
      return run(op.from, R, sys.routerData("swapExactTokensForTokens", [op.amountIn, op.minOut, op.path, op.from, op.deadline]));
    case "swapExactOut":
      return run(op.from, R, sys.routerData("swapTokensForExactTokens", [op.amountOut, op.maxIn, op.path, op.from, op.deadline]));
    case "swapExactETHIn":
      return run(op.from, R, sys.routerData("swapExactETHForTokens", [op.minOut, op.path, op.from, op.deadline]), op.value);
    case "swapExactInForETH":
      return run(op.from, R, sys.routerData("swapExactTokensForETH", [op.amountIn, op.minOut, op.path, op.from, op.deadline]));
    case "flash": {
      const data = encodeAbiParameters([{ type: "address" }, { type: "uint256" }, { type: "bool" }], [op.repayToken, op.repay, op.reenter]);
      return run(op.from, sys.pairAddress(op.a, op.b), sys.pairData("swap", [op.out0, op.out1, BORROWER, data]));
    }
    case "rawSwap":
      return run(op.from, sys.pairAddress(op.a, op.b), sys.pairData("swap", [op.out0, op.out1, op.to, "0x"]));
    case "donate":
      return run(op.from, op.token, sys.tokenData("transfer", [sys.pairAddress(op.a, op.b), op.amount]));
    case "skim":
      return run(op.from, sys.pairAddress(op.a, op.b), sys.pairData("skim", [op.to]));
    case "sync":
      return run(op.from, sys.pairAddress(op.a, op.b), sys.pairData("sync", []));
  }
}

/** Builds a model world whose setup mirrors System.create for the given deployment. */
export function makeModel(sys: System): World {
  const w = new World({ factory: sys.factory, router: sys.router, weth: WETH, initCodeHash: sys.initCodeHash, feeToSetter: ADMIN });
  w.timestamp = sys.chain.timestamp;
  for (const t of Object.values(TOKENS)) {
    w.addToken(t);
    for (const u of USERS) {
      w.mintToken(t, u, 10n ** 32n);
      w.tokenApprove(t, u, sys.router, MAX_UINT256);
    }
    w.mintToken(t, BORROWER, 10n ** 30n);
  }
  for (const a of [...USERS, ADMIN, DEPLOYER]) w.dealEth(a, 10n ** 30n);
  w.events.length = 0;
  return w;
}

function labelModelEvents(sys: System, evs: ModelEvent[]): LabeledEvent[] {
  return evs.map((e) => ({ emitter: sys.label(e.address), name: e.name, args: e.args.map((a) => (typeof a === "string" ? sys.label(a) : String(a))) }));
}

/** Executes an op against the TypeScript model. */
export function execModel(sys: System, w: World, op: Op): Outcome {
  const pa = (a: Address, b: Address) => sys.pairAddress(a, b);
  // A call to an address without code succeeds with no effect on the EVM.
  const direct = (a: Address, b: Address, fn: () => void) => (w.pairs.has(pa(a, b)) ? fn() : undefined);
  const r = w.tx(() => {
    switch (op.kind) {
      case "warp":
        w.timestamp += op.seconds;
        return;
      case "setFeeTo":
        return w.setFeeTo(op.from, op.on ? FEE_TO : ZERO);
      case "createPair":
        return void w.createPair(op.a, op.b);
      case "addLiquidity":
        return void w.addLiquidity(op.from, op.a, op.b, op.aDesired, op.bDesired, op.aMin, op.bMin, op.from, op.deadline);
      case "addLiquidityETH":
        return void w.addLiquidityETH(op.from, op.value, op.token, op.tokenDesired, op.tokenMin, op.ethMin, op.from, op.deadline);
      case "approveLP":
        return direct(op.a, op.b, () => w.tokenApprove(pa(op.a, op.b), op.from, sys.router, MAX_UINT256));
      case "removeLiquidity":
        return void w.removeLiquidity(op.from, op.a, op.b, op.liquidity, op.aMin, op.bMin, op.from, op.deadline);
      case "removeLiquidityETH":
        return void w.removeLiquidityETH(op.from, op.token, op.liquidity, op.tokenMin, op.ethMin, op.from, op.deadline);
      case "swapExactIn":
        return void w.swapExactTokensForTokens(op.from, op.amountIn, op.minOut, op.path, op.from, op.deadline);
      case "swapExactOut":
        return void w.swapTokensForExactTokens(op.from, op.amountOut, op.maxIn, op.path, op.from, op.deadline);
      case "swapExactETHIn":
        return void w.swapExactETHForTokens(op.from, op.value, op.minOut, op.path, op.from, op.deadline);
      case "swapExactInForETH":
        return void w.swapExactTokensForETH(op.from, op.amountIn, op.minOut, op.path, op.from, op.deadline);
      case "flash":
        return direct(op.a, op.b, () => w.pairSwap(op.from, pa(op.a, op.b), op.out0, op.out1, BORROWER, { repayToken: op.repayToken, repayAmount: op.repay, reenter: op.reenter }));
      case "rawSwap":
        return direct(op.a, op.b, () => w.pairSwap(op.from, pa(op.a, op.b), op.out0, op.out1, op.to));
      case "donate":
        return w.tokenTransfer(op.token, op.from, pa(op.a, op.b), op.amount);
      case "skim":
        return direct(op.a, op.b, () => w.pairSkim(op.from, pa(op.a, op.b), op.to));
      case "sync":
        return direct(op.a, op.b, () => w.pairSync(op.from, pa(op.a, op.b)));
    }
  });
  return r.ok ? { ok: true, reason: "", events: labelModelEvents(sys, r.events) } : { ok: false, reason: r.reason, events: [] };
}

/** Model state in the same key space as System.snapshot. */
export function modelSnapshot(sys: System, w: World): Record<string, string> {
  const s: Record<string, string> = {};
  const holders = [...USERS, BORROWER, FEE_TO, ZERO, sys.router];
  s["feeTo"] = sys.label(w.feeTo);
  s["allPairsLength"] = String(w.allPairs.length);
  for (const [a, b] of PAIR_KEYS) {
    const pAddr = sys.pairAddress(a, b);
    const p = w.pairs.get(pAddr);
    if (!p) continue;
    const L = sys.label(pAddr);
    s[`${L}.reserves`] = `${p.reserve0},${p.reserve1},${p.blockTimestampLast}`;
    s[`${L}.price0CumulativeLast`] = String(p.price0CumulativeLast);
    s[`${L}.price1CumulativeLast`] = String(p.price1CumulativeLast);
    s[`${L}.kLast`] = String(p.kLast);
    s[`${L}.totalSupply`] = String(p.totalSupply);
    for (const h of [...holders, pAddr]) s[`${L}.lp[${sys.label(h)}]`] = String(w.balanceOf(pAddr, h));
    for (const t of [a, b]) s[`${sys.label(t)}[${L}]`] = String(w.balanceOf(t, pAddr));
  }
  for (const t of ALL_TOKENS) for (const h of holders) s[`${sys.label(t)}[${sys.label(h)}]`] = String(w.balanceOf(t, h));
  for (const h of [...USERS, sys.router, WETH]) s[`eth[${sys.label(h)}]`] = String(w.ethBalance(h));
  return s;
}
