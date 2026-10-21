# SPEC: Router02

Sources: REA interface output for `0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D` (24 selectors, 0 unknown), bytecode strings, public docs. The router has no storage: `factory` and `WETH` are immutables embedded in the code, along with the pair init code hash.

## Library math

- `quote(a, rA, rB)`: `a > 0` else `UniswapV2Library: INSUFFICIENT_AMOUNT`; reserves > 0 else `UniswapV2Library: INSUFFICIENT_LIQUIDITY`; returns `a*rB/rA`.
- `getAmountOut(in, rIn, rOut)`: `in > 0` else `UniswapV2Library: INSUFFICIENT_INPUT_AMOUNT`; liquidity check; `inFee = in*997`; `inFee*rOut / (rIn*1000 + inFee)`.
- `getAmountIn(out, rIn, rOut)`: `out > 0` else `UniswapV2Library: INSUFFICIENT_OUTPUT_AMOUNT`; `rIn*out*1000 / ((rOut-out)*997) + 1` (sub underflow when out >= rOut reverts `ds-math-sub-underflow`).
- `getAmountsOut/In(amount, path)`: `path.length >= 2` else `UniswapV2Library: INVALID_PATH`; chain per hop, reserves fetched via `getReserves` on the CREATE2-derived pair (no factory lookup).
- `sortTokens`: `UniswapV2Library: IDENTICAL_ADDRESSES`, `UniswapV2Library: ZERO_ADDRESS`.

## Liquidity

- `addLiquidity`: modifier `deadline >= block.timestamp` else `UniswapV2Router: EXPIRED`. Creates the pair via factory if missing. With empty reserves uses desired amounts. Else `bOptimal = quote(aDesired, rA, rB)`; if `<= bDesired` require `>= bMin` (`INSUFFICIENT_B_AMOUNT`) and use it; else `aOptimal = quote(bDesired, rB, rA)`, assert `<= aDesired`, require `>= aMin` (`INSUFFICIENT_A_AMOUNT`). Transfers from sender to pair (`TransferHelper: TRANSFER_FROM_FAILED`), then `pair.mint(to)`.
- `addLiquidityETH`: same with WETH; wraps `amountETH`, refunds `msg.value - amountETH` (`TransferHelper: ETH_TRANSFER_FAILED`).
- `removeLiquidity`: transfers LP from sender to pair, `burn(to)`, orders amounts, checks mins (`INSUFFICIENT_A_AMOUNT`, `INSUFFICIENT_B_AMOUNT`). ETH and permit variants wrap this. Permit variants use `uint256.max` when `approveMax`.
- `receive()` only accepts ETH from WETH (assert).

## Swaps

- `swapExactTokensForTokens`: amounts = getAmountsOut; last >= amountOutMin else `UniswapV2Router: INSUFFICIENT_OUTPUT_AMOUNT`; transfer in to first pair; `_swap` loops hops, sending each output to the next pair (or `to` at the end), `amount0Out/amount1Out` chosen by token order, empty data.
- `swapTokensForExactTokens`: amounts = getAmountsIn; first <= amountInMax else `UniswapV2Router: EXCESSIVE_INPUT_AMOUNT`.
- ETH variants: `path[0] == WETH` or `path[last] == WETH` else `UniswapV2Router: INVALID_PATH`.
- Fee-on-transfer variants compute each hop's input from the pair balance delta, and check the recipient's balance delta against amountOutMin.

## Unknowns

- REA reports no events for the router (correct: it emits none itself).
