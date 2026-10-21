/** Human-readable ABIs, transcribed from the public interface docs and REA-recovered selectors. */
import { parseAbi } from "viem";

export const factoryAbi = parseAbi([
  "function feeTo() view returns (address)",
  "function feeToSetter() view returns (address)",
  "function getPair(address,address) view returns (address)",
  "function allPairsLength() view returns (uint256)",
  "function createPair(address,address) returns (address)",
  "function setFeeTo(address)",
  "function setFeeToSetter(address)",
]);

export const pairAbi = parseAbi([
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
  "function transfer(address,uint256) returns (bool)",
  "function getReserves() view returns (uint112,uint112,uint32)",
  "function price0CumulativeLast() view returns (uint256)",
  "function price1CumulativeLast() view returns (uint256)",
  "function kLast() view returns (uint256)",
  "function mint(address) returns (uint256)",
  "function burn(address) returns (uint256,uint256)",
  "function swap(uint256,uint256,address,bytes)",
  "function skim(address)",
  "function sync()",
]);

export const routerAbi = parseAbi([
  "function addLiquidity(address,address,uint256,uint256,uint256,uint256,address,uint256) returns (uint256,uint256,uint256)",
  "function addLiquidityETH(address,uint256,uint256,uint256,address,uint256) payable returns (uint256,uint256,uint256)",
  "function removeLiquidity(address,address,uint256,uint256,uint256,address,uint256) returns (uint256,uint256)",
  "function removeLiquidityETH(address,uint256,uint256,uint256,address,uint256) returns (uint256,uint256)",
  "function swapExactTokensForTokens(uint256,uint256,address[],address,uint256) returns (uint256[])",
  "function swapTokensForExactTokens(uint256,uint256,address[],address,uint256) returns (uint256[])",
  "function swapExactETHForTokens(uint256,address[],address,uint256) payable returns (uint256[])",
  "function swapExactTokensForETH(uint256,uint256,address[],address,uint256) returns (uint256[])",
  "function getAmountsOut(uint256,address[]) view returns (uint256[])",
  "function getAmountsIn(uint256,address[]) view returns (uint256[])",
  "function quote(uint256,uint256,uint256) pure returns (uint256)",
  "function getAmountOut(uint256,uint256,uint256) pure returns (uint256)",
  "function getAmountIn(uint256,uint256,uint256) pure returns (uint256)",
]);

export const tokenAbi = parseAbi([
  "function mint(address,uint256)",
  "function approve(address,uint256) returns (bool)",
  "function transfer(address,uint256) returns (bool)",
  "function balanceOf(address) view returns (uint256)",
]);

export const eventsAbi = parseAbi([
  "event Transfer(address indexed from, address indexed to, uint256 value)",
  "event Approval(address indexed owner, address indexed spender, uint256 value)",
  "event Sync(uint112 reserve0, uint112 reserve1)",
  "event Mint(address indexed sender, uint256 amount0, uint256 amount1)",
  "event Burn(address indexed sender, uint256 amount0, uint256 amount1, address indexed to)",
  "event Swap(address indexed sender, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out, address indexed to)",
  "event PairCreated(address indexed token0, address indexed token1, address pair, uint256)",
  "event Deposit(address indexed dst, uint256 wad)",
  "event Withdrawal(address indexed src, uint256 wad)",
]);
