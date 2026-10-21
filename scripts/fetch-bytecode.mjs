// Fetches mainnet runtime bytecode at a pinned block and writes hex fixtures plus SHA-256 hashes.
import { createHash } from "node:crypto";
import { writeFileSync, mkdirSync } from "node:fs";

const RPC = process.env.RPC_URL ?? "https://ethereum-rpc.publicnode.com";
const TARGETS = {
  UniswapV2Factory: "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f",
  UniswapV2Pair_WETH_USDC: "0xB4e16d0168e52d35CaCD2c6185b44281Ec28C9Dc",
  UniswapV2Router02: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
  WETH9: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
};

async function rpc(method, params) {
  const res = await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const json = await res.json();
  if (json.error) throw new Error(`${method}: ${json.error.message}`);
  return json.result;
}

// Runtime code of these contracts is immutable (no selfdestruct path), so any recent block
// is equivalent. Public RPCs only serve recent state without a token, so we pin "latest".
const BLOCK = Number(process.env.PIN_BLOCK ?? parseInt(await rpc("eth_blockNumber", []), 16));
const out = "evidence/bytecode";
mkdirSync(out, { recursive: true });
const manifest = { rpc: RPC, block: BLOCK, fetchedAt: new Date().toISOString(), contracts: {} };
for (const [name, address] of Object.entries(TARGETS)) {
  const code = await rpc("eth_getCode", [address, "0x" + BLOCK.toString(16)]);
  const bytes = Buffer.from(code.slice(2), "hex");
  writeFileSync(`${out}/${name}.hex`, code + "\n");
  manifest.contracts[name] = {
    address,
    bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
  console.log(name, bytes.length);
}
writeFileSync(`${out}/manifest.json`, JSON.stringify(manifest, null, 2) + "\n");
