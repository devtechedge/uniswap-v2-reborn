import { encodePacked, getAddress, getCreate2Address, keccak256, type Address, type Hex } from "viem";
import { require } from "./errors.js";

export const ZERO_ADDRESS: Address = "0x0000000000000000000000000000000000000000";
/** Init code hash of the mainnet pair, read from the Router02 bytecode (PUSH32). */
export const MAINNET_PAIR_INIT_CODE_HASH: Hex = "0x96e8ac4277198ff8b6f785478aa9a39f403cb768dd02cbee326c3e7da348845f";
export const MAINNET_FACTORY: Address = "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f";

export function sortTokens(a: Address, b: Address, prefix = "UniswapV2Library: "): [Address, Address] {
  require(a.toLowerCase() !== b.toLowerCase(), prefix + "IDENTICAL_ADDRESSES");
  const [t0, t1] = BigInt(a) < BigInt(b) ? [a, b] : [b, a];
  require(BigInt(t0) !== 0n, prefix + "ZERO_ADDRESS");
  return [getAddress(t0), getAddress(t1)];
}

/** CREATE2 pair address, salt = keccak256(token0 ++ token1). */
export function pairFor(factory: Address, a: Address, b: Address, initCodeHash: Hex): Address {
  const [t0, t1] = sortTokens(a, b);
  return getCreate2Address({
    from: factory,
    salt: keccak256(encodePacked(["address", "address"], [t0, t1])),
    bytecodeHash: initCodeHash,
  });
}
