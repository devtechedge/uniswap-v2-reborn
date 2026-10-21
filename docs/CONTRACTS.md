# Contract by contract

## Factory (`RebornFactory`, original `0x5C69...aA6f`)

| | original | reborn |
|---|---|---|
| selectors | 8, recovered by REA, all named | same 8 plus `pairCodeHash()` |
| storage | feeTo, feeToSetter, getPair, allPairs (slots 0..3, probed) | same order |
| pair deploy | CREATE2, salt = keccak(token0, token1) | same |
| init code hash | `0x96e8ac42...845f` (embedded in Router02) | exposed as `pairCodeHash()`, read by the router at construction |

Rationale: the original hardcodes the hash in the router. A clean-room pair has a different hash, so ours is read once from the factory and stored as an immutable.

## Pair (`RebornPair`, original WETH/USDC `0xB4e1...C9Dc`)

| | original | reborn |
|---|---|---|
| selectors | 27, all named | same 27 |
| storage | slots 0..12 (see specs/PAIR.md) | same order |
| LP token | "Uniswap V2" / "UNI-V2" | "Reborn V2" / "RBN-V2" (no branding reuse) |
| arithmetic | SafeMath style, `ds-math-*` strings | `Checked` library emitting the same strings |
| division by zero | INVALID opcode, empty revert data | `require(y != 0)`, empty revert data |
| accumulators | wrapping by solc 0.5 semantics | explicit `unchecked` |

Every revert string is kept identical so integrators that match on reason strings keep working.

## Router (`RebornRouter`, original Router02 `0x7a25...488D`)

| | original | reborn |
|---|---|---|
| selectors | 24, all named | same 24 plus `pairCodeHash()` |
| storage | none (factory, WETH immutables) | none (factory, WETH, pairCodeHash immutables) |
| asserts | `assert` (INVALID, empty data) | `require(cond)` (empty data) |
| fee-on-transfer variants | present | present, not differentially fuzzed (see COMPATIBILITY.md) |
| permit variants | present | present, covered by forge tests only |
