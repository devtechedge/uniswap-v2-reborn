import { describe, expect, it } from "vitest";
import { MAINNET_FACTORY, MAINNET_PAIR_INIT_CODE_HASH, pairFor, sortTokens, Revert } from "../src/index.js";

const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
const DAI = "0x6B175474E89094C44Da98b954EedeAC495271d0F";

describe("CREATE2 pair derivation", () => {
  it("reproduces real mainnet pair addresses", () => {
    expect(pairFor(MAINNET_FACTORY, WETH, USDC, MAINNET_PAIR_INIT_CODE_HASH)).toBe("0xB4e16d0168e52d35CaCD2c6185b44281Ec28C9Dc");
    expect(pairFor(MAINNET_FACTORY, DAI, WETH, MAINNET_PAIR_INIT_CODE_HASH)).toBe("0xA478c2975Ab1Ea89e8196811F51A7B7Ade33eB11");
  });
  it("is order independent", () => {
    expect(pairFor(MAINNET_FACTORY, USDC, WETH, MAINNET_PAIR_INIT_CODE_HASH)).toBe(pairFor(MAINNET_FACTORY, WETH, USDC, MAINNET_PAIR_INIT_CODE_HASH));
  });
  it("sortTokens rejects identical and zero", () => {
    expect(() => sortTokens(USDC, USDC)).toThrow(Revert);
    expect(() => sortTokens("0x0000000000000000000000000000000000000000", USDC)).toThrowError("UniswapV2Library: ZERO_ADDRESS");
  });
});
