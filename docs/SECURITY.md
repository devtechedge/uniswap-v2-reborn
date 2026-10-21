# Security notes

This is an educational, interoperability-focused rebuild. It is **not audited** and must not hold real funds.

- **No mainnet deployment.** The only deploy script refuses any chain other than anvil (31337) and uses anvil's unlocked account. No private key is read, stored, or committed.
- **Inherited design properties.** Everything the original allows, this allows: flash swaps, donations that skew reserves until `sync`, spot-price manipulation within a block (use the TWAP, not `getReserves`, for pricing), cumulative price wraparound (consumers must subtract mod 2^256 and mod 2^32 for time).
- **Token assumptions.** Pairs accept tokens that return nothing or `true`. Fee-on-transfer and rebasing tokens behave as in the original and are only safe through the `SupportingFeeOnTransferTokens` router paths.
- **Revert data.** Revert strings match the original exactly; empty reverts stand in for the original's INVALID opcode (division by zero, internal asserts). Tools that distinguish INVALID from REVERT will see a difference.
- **Public RPC.** The web app reads mainnet through a public RPC. It never asks for a wallet or signs anything.
- **Harness integrity.** `scripts/mutation-check.sh` plants seven known bugs and requires the differential fuzzer to catch every one.

Report issues through GitHub issues on this repository.
