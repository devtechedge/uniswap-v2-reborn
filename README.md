# uniswap-v2-reborn

A clean-room rebuild of the Uniswap v2 constant-product AMM (factory, pair, router) recovered from Ethereum mainnet runtime bytecode with [REA](https://github.com/morluto/rea), then proven equivalent with differential tests against the original bytecode.

Work in progress. See the milestones below.

- `evidence/` REA outputs and pinned bytecode, each with a SHA-256 hash
- `specs/` behaviour specs written from the evidence
- `packages/model` pure TypeScript reference model
- `packages/differential` harness that runs the original bytecode, our Solidity, and the model side by side
- `contracts/` clean-room Foundry reimplementation
- `apps/web` swap UI

## Licensing

Our code is MIT. Uniswap v2 core and periphery are GPL-3.0; none of their Solidity source is vendored here. Only public mainnet bytecode (as test fixtures) and public documentation were used. This project is for education and interoperability research.
