import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { encodeAbiParameters, keccak256, type Hex } from "viem";

const root = fileURLToPath(new URL("../../../", import.meta.url));

/** Mainnet runtime bytecode pinned in evidence/bytecode. */
export function mainnetCode(name: "UniswapV2Factory" | "UniswapV2Pair_WETH_USDC" | "UniswapV2Router02" | "WETH9"): Hex {
  return readFileSync(`${root}evidence/bytecode/${name}.hex`, "utf8").trim() as Hex;
}

/** Forge artifact for one of our contracts (run `forge build` in contracts/ first). */
export function forgeArtifact(file: string, name = file.replace(/\.sol$/, "").split("/").pop()!) {
  const base = file.split("/").pop()!;
  const j = JSON.parse(readFileSync(`${root}contracts/out/${base}/${name}.json`, "utf8"));
  return { bytecode: j.bytecode.object as Hex, deployedBytecode: j.deployedBytecode.object as Hex };
}

export function withArgs(bytecode: Hex, types: { type: string }[], values: unknown[]): Hex {
  return (bytecode + encodeAbiParameters(types, values).slice(2)) as Hex;
}

export const initCodeHashOf = (bytecode: Hex): Hex => keccak256(bytecode);
