/** Thin wrapper around @ethereumjs/evm: one in-process chain with controllable block time. */
import { Block } from "@ethereumjs/block";
import { Chain as CommonChain, Common, Hardfork } from "@ethereumjs/common";
import { EVM } from "@ethereumjs/evm";
import { Account, Address as EAddress, bytesToHex, hexToBytes, setLengthLeft } from "@ethereumjs/util";
import { decodeAbiParameters, getAddress, type Address, type Hex } from "viem";

export interface RawLog {
  address: Address;
  topics: Hex[];
  data: Hex;
}
export interface CallResult {
  ok: boolean;
  reason: string;
  returnData: Hex;
  logs: RawLog[];
  gasUsed: bigint;
  createdAddress?: Address;
}

const ea = (a: Address) => EAddress.fromString(a.toLowerCase());

/** Decodes revert data the way a user sees it: Error(string), Panic(uint256), or empty. */
export function decodeRevert(data: Hex): string {
  if (data === "0x") return "";
  if (data.startsWith("0x08c379a0")) return decodeAbiParameters([{ type: "string" }], `0x${data.slice(10)}`)[0];
  if (data.startsWith("0x4e487b71")) return `panic:0x${BigInt(`0x${data.slice(10)}`).toString(16)}`;
  return `raw:${data}`;
}

export class Chain {
  timestamp = 1_700_000_000n;
  number = 18_000_000n;
  private constructor(readonly evm: EVM, readonly common: Common) {}

  static async create(): Promise<Chain> {
    const common = new Common({ chain: CommonChain.Mainnet, hardfork: Hardfork.Cancun });
    const evm = await EVM.create({ common });
    return new Chain(evm, common);
  }

  private block() {
    return Block.fromBlockData({ header: { timestamp: this.timestamp, number: this.number, gasLimit: 60_000_000n, baseFeePerGas: 0n } }, { common: this.common });
  }

  async setCode(address: Address, code: Hex) {
    const sm = this.evm.stateManager;
    if (!(await sm.getAccount(ea(address)))) await sm.putAccount(ea(address), new Account());
    await sm.putContractCode(ea(address), hexToBytes(code));
  }
  async setStorage(address: Address, slot: bigint, value: Hex | bigint) {
    const key = setLengthLeft(hexToBytes(`0x${slot.toString(16).padStart(2, "0")}`), 32);
    const v = typeof value === "bigint" ? `0x${value.toString(16).padStart(64, "0")}` : value;
    await this.evm.stateManager.putContractStorage(ea(address), key, hexToBytes(v as Hex));
  }
  async fund(address: Address, wei: bigint) {
    const sm = this.evm.stateManager;
    const acct = (await sm.getAccount(ea(address))) ?? new Account();
    acct.balance = wei;
    await sm.putAccount(ea(address), acct);
  }
  async balance(address: Address): Promise<bigint> {
    return (await this.evm.stateManager.getAccount(ea(address)))?.balance ?? 0n;
  }
  async code(address: Address): Promise<Hex> {
    return bytesToHex(await this.evm.stateManager.getContractCode(ea(address))) as Hex;
  }

  async call(from: Address, to: Address | undefined, data: Hex, value = 0n): Promise<CallResult> {
    const sm = this.evm.stateManager;
    const caller = ea(from);
    const acct = (await sm.getAccount(caller)) ?? new Account();
    if (acct.balance < value) return { ok: false, reason: "harness: insufficient ETH", returnData: "0x", logs: [], gasUsed: 0n };
    const r = await this.evm.runCall({
      caller, origin: caller, to: to ? ea(to) : undefined, data: hexToBytes(data), value,
      gasLimit: 30_000_000n, block: this.block(), skipBalance: false,
    });
    if (!to) {
      acct.nonce += 1n;
      const after = (await sm.getAccount(caller))!;
      after.nonce = acct.nonce;
      await sm.putAccount(caller, after);
    }
    const ex = r.execResult;
    const returnData = bytesToHex(ex.returnValue) as Hex;
    const ok = !ex.exceptionError;
    return {
      ok,
      reason: ok ? "" : decodeRevert(returnData),
      returnData,
      gasUsed: ex.executionGasUsed,
      logs: ok
        ? (ex.logs ?? []).map(([a, topics, d]) => ({ address: getAddress(bytesToHex(a)), topics: topics.map((t) => bytesToHex(t) as Hex), data: bytesToHex(d) as Hex }))
        : [],
      createdAddress: r.createdAddress ? getAddress(r.createdAddress.toString()) : undefined,
    };
  }
}
