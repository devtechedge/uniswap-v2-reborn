# Compatibility matrix

Legend: **D** differential fuzz vs original bytecode, **H** historical mainnet replay, **F** forge test, **M** model unit test.

| feature | model | reborn | evidence of equality |
|---|---|---|---|
| createPair, CREATE2 address, PairCreated | yes | yes | D, F, M (real mainnet pair addresses) |
| identical / zero / existing pair errors | yes | yes | D, F |
| setFeeTo / FORBIDDEN | yes | yes | D, F |
| mint incl. MINIMUM_LIQUIDITY lock to address(0) | yes | yes | D, F, M |
| first mint below 1000 liquidity (`ds-math-sub-underflow`) | yes | yes | D, M |
| burn, pro-rata amounts | yes | yes | D, F |
| protocol fee (one sixth of sqrt k growth), kLast on/off | yes | yes | D (mutation-checked), F, M |
| swap, K invariant with 0.3% fee | yes | yes | D, H, F |
| flash swaps, callback repay, cross-token repay | yes | yes | D, F |
| reentrancy lock (`UniswapV2: LOCKED`) | yes | yes | D, F |
| INVALID_TO, INSUFFICIENT_* errors | yes | yes | D |
| skim, sync, donations | yes | yes | D |
| TWAP accumulators, uint32 timestamp wrap | yes | yes | D (warps across 2^32), F, M |
| uint112 OVERFLOW | yes | yes | M only (not reached by the fuzzer) |
| LP transfer / approve / transferFrom | yes | yes | D (via router) |
| permit (EIP-2612) | no | yes | F only |
| router addLiquidity / ETH, refunds | yes | yes | D |
| router removeLiquidity / ETH | yes | yes | D |
| swapExactTokensForTokens, swapTokensForExactTokens, multi-hop | yes | yes | D |
| swapExactETHForTokens, swapExactTokensForETH | yes | yes | D |
| swapTokensForExactETH, swapETHForExactTokens | no | yes | not yet compared |
| removeLiquidity*WithPermit | no | yes | not yet compared |
| *SupportingFeeOnTransferTokens | no | yes | not yet compared (no fee-on-transfer test token) |
| quote / getAmountOut / getAmountIn / getAmountsOut / getAmountsIn | yes | yes | D (via swaps), F, live mainnet check in the web app |
| gas | n/a | within -7% to +2.4% per op | see RESULTS.md |

Known intentional differences: LP token name and symbol, `pairCodeHash()` getter on factory and router, gas.
