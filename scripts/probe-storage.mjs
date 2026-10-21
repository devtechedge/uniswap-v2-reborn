// Reads the first storage slots of the mainnet pair and factory, plus their getters, to
// recover the storage layout empirically (slot -> getter value match).
import { writeFileSync } from "node:fs";
import { createPublicClient, http, parseAbi } from "viem";
import { mainnet } from "viem/chains";

const client = createPublicClient({ chain: mainnet, transport: http(process.env.RPC_URL ?? "https://ethereum-rpc.publicnode.com") });
const block = await client.getBlockNumber();
const PAIR = "0xB4e16d0168e52d35CaCD2c6185b44281Ec28C9Dc";
const FACTORY = "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f";
const pairAbi = parseAbi([
  "function totalSupply() view returns (uint256)", "function DOMAIN_SEPARATOR() view returns (bytes32)",
  "function factory() view returns (address)", "function token0() view returns (address)", "function token1() view returns (address)",
  "function getReserves() view returns (uint112,uint112,uint32)", "function price0CumulativeLast() view returns (uint256)",
  "function price1CumulativeLast() view returns (uint256)", "function kLast() view returns (uint256)",
]);
const facAbi = parseAbi(["function feeTo() view returns (address)", "function feeToSetter() view returns (address)", "function allPairsLength() view returns (uint256)"]);
const slots = async (a, n) => Promise.all([...Array(n).keys()].map((i) => client.getStorageAt({ address: a, slot: `0x${i.toString(16)}`, blockNumber: block })));
const getters = async (a, abi) => Object.fromEntries(await Promise.all(abi.map(async (f) => [f.name, String(await client.readContract({ address: a, abi, functionName: f.name, blockNumber: block }))])));
const out = {
  block: Number(block),
  pair: { address: PAIR, slots: await slots(PAIR, 13), getters: await getters(PAIR, pairAbi) },
  factory: { address: FACTORY, slots: await slots(FACTORY, 4), getters: await getters(FACTORY, facAbi) },
};
writeFileSync("evidence/storage-probe.json", JSON.stringify(out, null, 2) + "\n");
console.log(JSON.stringify(out, null, 1));
