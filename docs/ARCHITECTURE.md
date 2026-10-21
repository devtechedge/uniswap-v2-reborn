# Architecture

```
evidence/            pinned mainnet bytecode, REA outputs, storage probe, historical swaps, SHA256SUMS.json
specs/               behaviour specs written only from evidence and public docs
packages/model       @v2r/model: pure TypeScript reference model (bigint, no chain)
packages/differential  @v2r/differential: in-process EVM harness, fuzzer, replay, CLI
contracts/           Foundry project: clean-room Reborn* contracts, helpers, tests, anvil script
apps/web             Next.js static export: simulator, live mainnet check, results
reports/             machine-readable output of the last full differential and replay runs
scripts/             fetch, probe, summarize, mutation check, local deploy
```

## Flow

1. **Recover.** `scripts/fetch-bytecode.mjs` pins runtime code with `eth_getCode`. `rea inspect-evm-interface` recovers selectors, mutability and compiler metadata. `scripts/summarize-evidence.mjs` names selectors by hashing candidate signatures from the public interface docs, and scans PUSH32 operands for event topics and the data section for revert strings. `scripts/probe-storage.mjs` matches raw storage slots against getter values to recover the layout.
2. **Specify.** `specs/PAIR.md`, `specs/FACTORY.md`, `specs/ROUTER02.md` describe behaviour, quirks and unknowns.
3. **Model.** `@v2r/model` implements the spec as a `World`: test tokens, WETH9, factory, pairs and Router02, with atomic transactions (`tx`) that roll back on revert and return events.
4. **Rebuild.** `contracts/src/Reborn*.sol` implement the same spec in Solidity 0.8.28.
5. **Prove.** `@v2r/differential` boots one chain per implementation in `@ethereumjs/evm`:
   - *original*: mainnet runtime bytecode placed at its mainnet addresses (factory, Router02, WETH9) with constructor storage seeded from the storage probe. Pairs are created by the original factory, so they run the original pair init code.
   - *reborn*: our factory and router deployed from creation code.
   Shared fixtures (test tokens, flash receiver, users) sit at identical addresses. Each fuzzed op runs on both chains and on a model instance per chain. Addresses are mapped to roles (`PAIR(TA,TB)`, `ROUTER`, `U0`) so CREATE2 differences do not matter.
6. **Show.** The web app runs the proven model in the browser and cross-checks it against live mainnet Router02 quotes.

## Why an in-process EVM

No archive node or fork is needed, the run is deterministic, block time is controllable (including uint32 wrap), and CI needs nothing beyond Node and Foundry.
