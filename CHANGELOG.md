# Changelog

## v0.1.0 (2026-10-22)

First release.

- Evidence: pinned mainnet bytecode for factory, WETH/USDC pair, Router02 and WETH9; REA interface analysis; storage probe; 426 historical swaps; SHA-256 manifest.
- Specs for pair, factory and Router02 written from evidence.
- `@v2r/model`: TypeScript reference model of tokens, WETH9, factory, pairs (mint, burn, swap, flash, skim, sync, protocol fee, TWAP) and Router02.
- Clean-room Solidity 0.8.28 contracts: `RebornFactory`, `RebornPair`, `RebornERC20`, `RebornRouter` with libraries.
- Differential harness on `@ethereumjs/evm`: 4,800 fuzzed ops with 0 mismatches across original, reborn and model; 426/426 historical swaps exact; mutation check 7/7.
- Web app: in-browser simulator (swap, multi-hop, add and remove liquidity, pool stats, TWAP chart, time warp, fee toggle) and live read-only mainnet quote check, deployed on Vercel.
- Local anvil deploy script with an unlocked account.
- Tests: 29 Vitest, 15 Forge.
