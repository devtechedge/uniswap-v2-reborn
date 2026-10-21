// Captures real Swap events (with the Sync before and after each) from the mainnet WETH/USDC
// pair over a pinned block range and stores them as a replay fixture.
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { createPublicClient, http, parseAbiItem } from "viem";
import { mainnet } from "viem/chains";

const client = createPublicClient({ chain: mainnet, transport: http(process.env.RPC_URL ?? "https://ethereum-rpc.publicnode.com") });
const PAIR = "0xB4e16d0168e52d35CaCD2c6185b44281Ec28C9Dc";
const latest = await client.getBlockNumber();
const to = BigInt(process.env.TO_BLOCK ?? latest - 10n);
const from = BigInt(process.env.FROM_BLOCK ?? to - 4999n);
const sync = parseAbiItem("event Sync(uint112 reserve0, uint112 reserve1)");
const swap = parseAbiItem("event Swap(address indexed sender, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out, address indexed to)");
const logs = [];
for (let b = from; b <= to; b += 1000n) {
  const end = b + 999n > to ? to : b + 999n;
  logs.push(...(await client.getLogs({ address: PAIR, events: [sync, swap], fromBlock: b, toBlock: end })));
}
logs.sort((x, y) => (x.blockNumber === y.blockNumber ? x.logIndex - y.logIndex : Number(x.blockNumber - y.blockNumber)));
const cases = [];
let prevSync = null;
for (let i = 0; i < logs.length; i++) {
  const l = logs[i];
  if (l.eventName === "Sync") {
    // A swap emits Sync then Swap; the Sync just before that one is the pre-swap state.
    const next = logs[i + 1];
    if (next?.eventName === "Swap" && next.transactionHash === l.transactionHash && prevSync) {
      cases.push({
        block: Number(l.blockNumber), tx: l.transactionHash, logIndex: next.logIndex,
        before: { reserve0: String(prevSync.args.reserve0), reserve1: String(prevSync.args.reserve1) },
        after: { reserve0: String(l.args.reserve0), reserve1: String(l.args.reserve1) },
        swap: Object.fromEntries(["amount0In", "amount1In", "amount0Out", "amount1Out"].map((k) => [k, String(next.args[k])])),
      });
    }
    prevSync = l;
  }
}
const body = { pair: PAIR, fromBlock: Number(from), toBlock: Number(to), fetchedAt: new Date().toISOString(), cases };
const text = JSON.stringify(body, null, 2) + "\n";
mkdirSync("evidence/historical", { recursive: true });
writeFileSync("evidence/historical/weth-usdc-swaps.json", text);
console.log(cases.length, "swaps from", logs.length, "logs; sha256", createHash("sha256").update(text).digest("hex"));
