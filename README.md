# uniswap-v2-reborn

The Uniswap v2 constant-product AMM (factory, pair, Router02) recovered from Ethereum mainnet **runtime bytecode** with [REA](https://github.com/morluto/rea), rebuilt clean-room as a TypeScript reference model and as Solidity 0.8 contracts, and proven equal to the original by differential testing.

**Live demo:** https://uniswap-v2-reborn.vercel.app (in-browser simulator plus a live, read-only mainnet quote check)

| | |
|---|---|
| Differential fuzz | **4,800 ops** over 120 seeded scenarios, original bytecode vs reborn Solidity vs TS model, **0 mismatches** |
| Historical replay | **426 / 426** real mainnet WETH/USDC swaps reproduced exactly on original, reborn and model |
| What is compared | success or revert, exact revert string, every event in order, full state after every op |
| Harness check | 7 / 7 planted bugs caught by `scripts/mutation-check.sh` |
| Tests | 29 Vitest + 15 Forge (3 fuzz tests at 512 runs each) |
| Gas | reborn is within -7.1% to +2.4% of the original per op ([table](docs/RESULTS.md#gas)) |

## How it was built

1. **Pin the bytecode.** `eth_getCode` for the factory `0x5C69...aA6f`, the WETH/USDC pair `0xB4e1...C9Dc`, Router02 `0x7a25...488D` and WETH9, hashed into [`evidence/`](evidence).
2. **Recover the interface with REA.** `rea inspect-evm-interface` found 8 factory, 27 pair and 24 router selectors with mutability and compiler metadata (solc 0.5.16). Names were resolved by hashing candidate signatures from the public docs: 0 unknown. Event topics and every revert string were scanned from the bytecode, and the storage layout was recovered by probing slots against getters.
3. **Write specs** ([pair](specs/PAIR.md), [factory](specs/FACTORY.md), [router](specs/ROUTER02.md)) including quirks: `Transfer(0, 0, 1000)` on first mint, fee-on mint formula, uint112 overflow guard, wrapping accumulators, INVALID on division by zero.
4. **Model** the whole system in TypeScript ([`packages/model`](packages/model)).
5. **Rebuild** in Solidity from the specs ([`contracts/src`](contracts/src)).
6. **Prove** with [`packages/differential`](packages/differential): the original bytecode runs in `@ethereumjs/evm` at its mainnet addresses with seeded storage, our contracts run on a second chain, and both are compared to the model op by op.

Details: [architecture](docs/ARCHITECTURE.md), [contract by contract](docs/CONTRACTS.md), [evidence format](docs/EVIDENCE.md), [compatibility matrix](docs/COMPATIBILITY.md), [results and gas](docs/RESULTS.md), [security notes](docs/SECURITY.md).

## Gas comparison

Mean execution gas per successful op from the full differential run (in-process EVM, excludes intrinsic gas).

| op | original | reborn | delta |
|---|---|---|---|
| addLiquidity | 1,286,741 | 1,252,608 | -2.7% |
| addLiquidityETH | 1,471,685 | 1,433,139 | -2.6% |
| createPair | 2,483,214 | 2,408,989 | -3.0% |
| swapExactIn (router) | 69,558 | 71,234 | +2.4% |
| swapExactOut (router) | 70,248 | 71,919 | +2.4% |
| swapExactETHIn | 74,634 | 76,146 | +2.0% |
| swapExactInForETH | 87,947 | 87,575 | -0.4% |
| flash swap | 35,915 | 35,787 | -0.4% |
| removeLiquidity | 103,249 | 103,155 | -0.1% |
| removeLiquidityETH | 166,036 | 163,818 | -1.3% |
| skim | 14,497 | 14,045 | -3.1% |
| sync | 14,911 | 14,829 | -0.5% |
| setFeeTo | 14,350 | 13,329 | -7.1% |

addLiquidity averages include the pair deployment when the pool did not exist yet.

## Run it

Requires Node >= 22.19, pnpm 9 and Foundry.

```bash
git clone --recursive https://github.com/devtechedge/uniswap-v2-reborn && cd uniswap-v2-reborn
pnpm install
pnpm build && pnpm test                      # model, differential (small), replay, web
cd contracts && forge test && cd ..          # Solidity unit and fuzz tests
pnpm --filter @v2r/differential diff 120 40  # full differential run -> reports/differential.json
npx tsx packages/differential/src/replay-cli.ts  # all 426 historical swaps -> reports/historical.json
./scripts/mutation-check.sh                  # plant bugs, expect the fuzzer to catch them
./scripts/deploy-local.sh                    # deploy reborn to a local anvil (unlocked account, no keys)
pnpm --filter @v2r/web dev                   # web app on localhost:3000
```

Re-capture evidence (optional): `node scripts/fetch-bytecode.mjs`, `rea inspect-evm-interface evidence/bytecode/<Name>.hex hex --format json --full-output`, `node scripts/summarize-evidence.mjs`, `node scripts/probe-storage.mjs`, `node scripts/fetch-historical-swaps.mjs`.

## Licensing and scope

Our code is MIT ([LICENSE](LICENSE)). Uniswap v2 core and periphery are GPL-3.0; **none of their Solidity source is included or was used**. The rebuild was derived from public mainnet bytecode (kept as test fixtures), REA analysis and public documentation. "Uniswap" is used only to identify the system being studied; this project is not affiliated with or endorsed by Uniswap Labs. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and [DISCLAIMER.md](DISCLAIMER.md).

Educational and interoperability research only. Not audited. No mainnet deployment.
