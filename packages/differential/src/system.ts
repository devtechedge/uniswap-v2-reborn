/**
 * One deployed AMM system on a fresh in-process chain: either the ORIGINAL mainnet bytecode
 * or our clean-room REBORN contracts. Shared fixtures (WETH9, test tokens, flash receiver,
 * users) sit at identical addresses in both so results can be compared label for label.
 */
import { decodeEventLog, decodeFunctionResult, encodeFunctionData, getAddress, type Address, type Hex } from "viem";
import { MAINNET_PAIR_INIT_CODE_HASH, pairFor } from "@v2r/model";
import { Chain, type CallResult, type RawLog } from "./chain.js";
import { eventsAbi, factoryAbi, pairAbi, routerAbi, tokenAbi } from "./abi.js";
import { forgeArtifact, initCodeHashOf, mainnetCode, withArgs } from "./artifacts.js";

export type Impl = "original" | "reborn";

export const WETH = getAddress("0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2");
export const MAINNET_FACTORY = getAddress("0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f");
export const MAINNET_ROUTER = getAddress("0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D");
export const TOKENS = {
  TA: getAddress("0x1000000000000000000000000000000000000001"),
  TB: getAddress("0x2000000000000000000000000000000000000002"),
  TC: getAddress("0x3000000000000000000000000000000000000003"),
} as const;
export const BORROWER = getAddress("0xb0b0000000000000000000000000000000000b0b");
export const ADMIN = getAddress("0xad00000000000000000000000000000000000001");
export const FEE_TO = getAddress("0xfee0000000000000000000000000000000000001");
export const DEPLOYER = getAddress("0xde00000000000000000000000000000000000001");
export const USERS = [
  getAddress("0xa11ce00000000000000000000000000000000001"),
  getAddress("0xb0b0000000000000000000000000000000000002"),
  getAddress("0xca70000000000000000000000000000000000003"),
] as const;
export const ZERO = "0x0000000000000000000000000000000000000000" as Address;
export const ALL_TOKENS: Address[] = [TOKENS.TA, TOKENS.TB, TOKENS.TC, WETH];
export const PAIR_KEYS: [Address, Address][] = [
  [TOKENS.TA, TOKENS.TB], [TOKENS.TB, TOKENS.TC], [TOKENS.TA, WETH], [TOKENS.TC, WETH],
];

export interface LabeledEvent {
  emitter: string;
  name: string;
  args: string[];
}

export class System {
  readonly labels = new Map<string, string>();
  private constructor(
    readonly impl: Impl,
    readonly chain: Chain,
    readonly factory: Address,
    readonly router: Address,
    readonly initCodeHash: Hex,
  ) {
    const set = (a: Address, l: string) => this.labels.set(a.toLowerCase(), l);
    set(factory, "FACTORY"); set(router, "ROUTER"); set(WETH, "WETH"); set(BORROWER, "BORROWER");
    set(ADMIN, "ADMIN"); set(FEE_TO, "FEE_TO"); set(ZERO, "ZERO");
    for (const [k, v] of Object.entries(TOKENS)) set(v, k);
    USERS.forEach((u, i) => set(u, `U${i}`));
    // label every possible pair, not just the fuzzed pools, since CREATE2 addresses differ per implementation
    for (let i = 0; i < ALL_TOKENS.length; i++)
      for (let j = i + 1; j < ALL_TOKENS.length; j++) {
        const [a, b] = [ALL_TOKENS[i]!, ALL_TOKENS[j]!];
        set(this.pairAddress(a, b), `PAIR(${this.label(a)},${this.label(b)})`);
      }
  }

  static async create(impl: Impl): Promise<System> {
    const chain = await Chain.create();
    // WETH9 runtime with its initialised storage (name, symbol, decimals as short strings)
    await chain.setCode(WETH, mainnetCode("WETH9"));
    const short = (s: string): Hex => `0x${Buffer.from(s).toString("hex").padEnd(62, "0")}${(s.length * 2).toString(16).padStart(2, "0")}`;
    await chain.setStorage(WETH, 0n, short("Wrapped Ether"));
    await chain.setStorage(WETH, 1n, short("WETH"));
    await chain.setStorage(WETH, 2n, 18n);
    const token = forgeArtifact("helpers/MockToken.sol");
    for (const t of Object.values(TOKENS)) await chain.setCode(t, token.deployedBytecode);
    await chain.setCode(BORROWER, forgeArtifact("helpers/FlashBorrower.sol").deployedBytecode);
    for (const a of [...USERS, ADMIN, DEPLOYER]) await chain.fund(a, 10n ** 30n);

    let sys: System;
    if (impl === "original") {
      await chain.setCode(MAINNET_FACTORY, mainnetCode("UniswapV2Factory"));
      await chain.setStorage(MAINNET_FACTORY, 1n, BigInt(ADMIN)); // slot 1 = feeToSetter (storage probe)
      await chain.setCode(MAINNET_ROUTER, mainnetCode("UniswapV2Router02")); // factory and WETH are immutables
      sys = new System(impl, chain, MAINNET_FACTORY, MAINNET_ROUTER, MAINNET_PAIR_INIT_CODE_HASH);
    } else {
      const f = forgeArtifact("RebornFactory.sol");
      const fr = await chain.call(DEPLOYER, undefined, withArgs(f.bytecode, [{ type: "address" }], [ADMIN]));
      if (!fr.ok || !fr.createdAddress) throw new Error(`factory deploy failed: ${fr.reason}`);
      const r = forgeArtifact("RebornRouter.sol");
      const rr = await chain.call(DEPLOYER, undefined, withArgs(r.bytecode, [{ type: "address" }, { type: "address" }], [fr.createdAddress, WETH]));
      if (!rr.ok || !rr.createdAddress) throw new Error(`router deploy failed: ${rr.reason}`);
      sys = new System(impl, chain, fr.createdAddress, rr.createdAddress, initCodeHashOf(forgeArtifact("RebornPair.sol").bytecode));
    }
    // fund users with test tokens and give the router infinite allowance
    for (const u of USERS) {
      for (const t of Object.values(TOKENS)) {
        await sys.must(DEPLOYER, t, encodeFunctionData({ abi: tokenAbi, functionName: "mint", args: [u, 10n ** 32n] }));
        await sys.must(u, t, encodeFunctionData({ abi: tokenAbi, functionName: "approve", args: [sys.router, 2n ** 256n - 1n] }));
      }
    }
    for (const t of Object.values(TOKENS)) {
      await sys.must(DEPLOYER, t, encodeFunctionData({ abi: tokenAbi, functionName: "mint", args: [BORROWER, 10n ** 30n] }));
    }
    return sys;
  }

  label(a: string): string {
    return this.labels.get(a.toLowerCase()) ?? a.toLowerCase();
  }
  pairAddress(a: Address, b: Address): Address {
    return pairFor(this.factory, a, b, this.initCodeHash);
  }

  async must(from: Address, to: Address, data: Hex, value = 0n): Promise<CallResult> {
    const r = await this.chain.call(from, to, data, value);
    if (!r.ok) throw new Error(`setup call failed: ${r.reason}`);
    return r;
  }
  call(from: Address, to: Address, data: Hex, value = 0n) {
    return this.chain.call(from, to, data, value);
  }
  async view<T>(to: Address, abi: readonly unknown[], functionName: string, args: unknown[] = []): Promise<T> {
    const data = encodeFunctionData({ abi: abi as never, functionName, args } as never);
    const r = await this.chain.call(DEPLOYER, to, data);
    if (!r.ok) throw new Error(`view ${functionName} failed: ${r.reason}`);
    return decodeFunctionResult({ abi: abi as never, functionName, data: r.returnData } as never) as T;
  }

  labelEvents(logs: RawLog[]): LabeledEvent[] {
    return logs.map((l) => {
      const ev = decodeEventLog({ abi: eventsAbi, topics: l.topics as [Hex, ...Hex[]], data: l.data });
      const item = eventsAbi.find((e) => e.name === ev.eventName)!;
      const named = ev.args as Record<string, unknown>;
      const values = (item.inputs as readonly { name?: string }[]).map((inp, i) => named[inp.name ?? ""] ?? (named as unknown as unknown[])[i] ?? Object.values(named)[i]);
      const args = values.map((v) => (typeof v === "string" ? this.label(v) : String(v)));
      return { emitter: this.label(l.address), name: ev.eventName, args };
    });
  }

  async hasPair(a: Address, b: Address) {
    return (await this.chain.code(this.pairAddress(a, b))) !== "0x";
  }

  /** Full observable state: every pair's storage-visible values and all relevant balances. */
  async snapshot(): Promise<Record<string, string>> {
    const s: Record<string, string> = {};
    const holders = [...USERS, BORROWER, FEE_TO, ZERO, this.router];
    s["feeTo"] = this.label(await this.view<Address>(this.factory, factoryAbi, "feeTo"));
    s["allPairsLength"] = String(await this.view<bigint>(this.factory, factoryAbi, "allPairsLength"));
    for (const [a, b] of PAIR_KEYS) {
      if (!(await this.hasPair(a, b))) continue;
      const p = this.pairAddress(a, b);
      const L = this.label(p);
      const [r0, r1, ts] = await this.view<[bigint, bigint, number]>(p, pairAbi, "getReserves");
      s[`${L}.reserves`] = `${r0},${r1},${ts}`;
      s[`${L}.price0CumulativeLast`] = String(await this.view(p, pairAbi, "price0CumulativeLast"));
      s[`${L}.price1CumulativeLast`] = String(await this.view(p, pairAbi, "price1CumulativeLast"));
      s[`${L}.kLast`] = String(await this.view(p, pairAbi, "kLast"));
      s[`${L}.totalSupply`] = String(await this.view(p, pairAbi, "totalSupply"));
      for (const h of [...holders, p]) s[`${L}.lp[${this.label(h)}]`] = String(await this.view(p, pairAbi, "balanceOf", [h]));
      for (const t of [a, b]) s[`${this.label(t)}[${L}]`] = String(await this.view(t, tokenAbi, "balanceOf", [p]));
    }
    for (const t of ALL_TOKENS) for (const h of holders) s[`${this.label(t)}[${this.label(h)}]`] = String(await this.view(t, tokenAbi, "balanceOf", [h]));
    for (const h of [...USERS, this.router, WETH]) s[`eth[${this.label(h)}]`] = String(await this.chain.balance(h));
    return s;
  }

  routerData(functionName: string, args: unknown[]): Hex {
    return encodeFunctionData({ abi: routerAbi as never, functionName, args } as never);
  }
  pairData(functionName: string, args: unknown[]): Hex {
    return encodeFunctionData({ abi: pairAbi as never, functionName, args } as never);
  }
  factoryData(functionName: string, args: unknown[]): Hex {
    return encodeFunctionData({ abi: factoryAbi as never, functionName, args } as never);
  }
  tokenData(functionName: string, args: unknown[]): Hex {
    return encodeFunctionData({ abi: tokenAbi as never, functionName, args } as never);
  }
}
