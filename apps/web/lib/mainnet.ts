/** Read-only mainnet quotes: real reserves and Router02 quotes vs the TS model. No wallet, no writes. */
import { createPublicClient, http, parseAbi, type Address } from "viem";
import { mainnet } from "viem/chains";
import { getAmountOut } from "./model";

export const RPC = "https://ethereum-rpc.publicnode.com";
const client = createPublicClient({ chain: mainnet, transport: http(RPC) });
export const MAINNET = {
  pair: "0xB4e16d0168e52d35CaCD2c6185b44281Ec28C9Dc" as Address,
  router: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D" as Address,
  usdc: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" as Address,
  weth: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2" as Address,
};
const pairAbi = parseAbi(["function getReserves() view returns (uint112,uint112,uint32)"]);
const routerAbi = parseAbi(["function getAmountsOut(uint256,address[]) view returns (uint256[])"]);

export interface MainnetQuote {
  block: bigint;
  reserveUsdc: bigint;
  reserveWeth: bigint;
  routerOut: bigint;
  modelOut: bigint;
}

export async function quoteWethToUsdc(amountIn: bigint): Promise<MainnetQuote> {
  const block = await client.getBlockNumber();
  const [[r0, r1], amounts] = await Promise.all([
    client.readContract({ address: MAINNET.pair, abi: pairAbi, functionName: "getReserves", blockNumber: block }),
    client.readContract({ address: MAINNET.router, abi: routerAbi, functionName: "getAmountsOut", args: [amountIn, [MAINNET.weth, MAINNET.usdc]], blockNumber: block }),
  ]);
  return { block, reserveUsdc: r0, reserveWeth: r1, routerOut: amounts[1]!, modelOut: getAmountOut(amountIn, r1, r0) };
}
