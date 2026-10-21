/**
 * Browser simulator: the same TypeScript reference model that the differential suite proves
 * equal to the mainnet bytecode, wired to demo tokens and one demo account.
 */
import { MAX_UINT256, World, currentCumulativePrices, uqToNumber, type Address } from "./model";

export const SIM = {
  factory: "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f" as Address,
  router: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D" as Address,
  weth: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2" as Address,
  user: "0xA11CE00000000000000000000000000000000001" as Address,
  feeTo: "0xFEE0000000000000000000000000000000000001" as Address,
  admin: "0xAD00000000000000000000000000000000000001" as Address,
  initCodeHash: "0x96e8ac4277198ff8b6f785478aa9a39f403cb768dd02cbee326c3e7da348845f" as const,
};

export const TOKENS: { symbol: string; address: Address }[] = [
  { symbol: "ALPHA", address: "0x1000000000000000000000000000000000000001" },
  { symbol: "BETA", address: "0x2000000000000000000000000000000000000002" },
  { symbol: "WETH", address: SIM.weth },
];

export const symbolOf = (a: string) => TOKENS.find((t) => t.address.toLowerCase() === a.toLowerCase())?.symbol ?? a.slice(0, 8);

export interface HistoryPoint {
  t: number;
  spot: number;
  cumulative: bigint;
}

export function createSim(): World {
  const w = new World({ factory: SIM.factory, router: SIM.router, weth: SIM.weth, initCodeHash: SIM.initCodeHash, feeToSetter: SIM.admin });
  w.timestamp = BigInt(Math.floor(Date.UTC(2026, 0, 1) / 1000));
  for (const t of TOKENS.slice(0, 2)) {
    w.addToken(t.address);
    w.mintToken(t.address, SIM.user, 1_000_000n * 10n ** 18n);
    w.tokenApprove(t.address, SIM.user, SIM.router, MAX_UINT256);
  }
  w.dealEth(SIM.user, 1_000n * 10n ** 18n);
  const D = 2n ** 64n;
  w.tx(() => w.addLiquidity(SIM.user, TOKENS[0]!.address, TOKENS[1]!.address, 100_000n * 10n ** 18n, 50_000n * 10n ** 18n, 0n, 0n, SIM.user, D));
  w.tx(() => w.addLiquidityETH(SIM.user, 20n * 10n ** 18n, TOKENS[0]!.address, 60_000n * 10n ** 18n, 0n, 0n, SIM.user, D));
  w.events.length = 0;
  return w;
}

export function observe(w: World, pair: Address): HistoryPoint {
  const p = w.pair(pair);
  const o = currentCumulativePrices(p, w.timestamp);
  const spot = p.reserve0 === 0n ? 0 : Number((p.reserve1 * 10n ** 12n) / p.reserve0) / 1e12;
  return { t: Number(w.timestamp), spot, cumulative: o.price0Cumulative };
}

/** TWAP of price0 over consecutive observations, as a JS number. */
export function twapSeries(points: HistoryPoint[]): { t: number; twap: number }[] {
  const out: { t: number; twap: number }[] = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[0]!;
    const b = points[i]!;
    const dt = BigInt(b.t - a.t);
    if (dt > 0n) out.push({ t: b.t, twap: uqToNumber((b.cumulative - a.cumulative) / dt) });
  }
  return out;
}
