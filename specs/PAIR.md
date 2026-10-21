# SPEC: Pair (constant-product pool)

Sources: REA `inspect-evm-interface` on mainnet pair `0xB4e16d0168e52d35CaCD2c6185b44281Ec28C9Dc` (`evidence/summary/UniswapV2Pair_WETH_USDC.json`), the storage probe (`evidence/storage-probe.json`), revert strings scanned from bytecode, the public Uniswap v2 whitepaper and reference docs. Compiler metadata in the bytecode: solc 0.5.16, bzzr1.

## Interface (27 selectors, all named, 0 unknown)

ERC-20 LP token: `name()` = "Uniswap V2", `symbol()` = "UNI-V2", `decimals()` = 18, `totalSupply`, `balanceOf`, `allowance`, `approve`, `transfer`, `transferFrom`. EIP-2612: `DOMAIN_SEPARATOR`, `PERMIT_TYPEHASH`, `nonces`, `permit`.
Pool: `MINIMUM_LIQUIDITY` (1000), `factory`, `token0`, `token1`, `getReserves`, `price0CumulativeLast`, `price1CumulativeLast`, `kLast`, `mint`, `burn`, `swap`, `skim`, `sync`, `initialize`.

Events: `Transfer`, `Approval`, `Mint(sender, amount0, amount1)`, `Burn(sender, amount0, amount1, to)`, `Swap(sender, amount0In, amount1In, amount0Out, amount1Out, to)`, `Sync(reserve0, reserve1)`.

## Storage layout (verified against mainnet getters)

| slot | content |
|---|---|
| 0 | totalSupply |
| 1 | balanceOf mapping |
| 2 | allowance mapping |
| 3 | DOMAIN_SEPARATOR (set in constructor) |
| 4 | nonces mapping |
| 5 | factory (the deployer, msg.sender of the constructor) |
| 6 | token0 |
| 7 | token1 |
| 8 | packed: reserve0 (bits 0..111), reserve1 (112..223), blockTimestampLast uint32 (224..255) |
| 9 | price0CumulativeLast |
| 10 | price1CumulativeLast |
| 11 | kLast |
| 12 | unlocked (reentrancy lock, 1 = open) |

## Behaviour

- `initialize(t0, t1)`: only `factory`, else `UniswapV2: FORBIDDEN`. Called once by the factory.
- Lock: `mint`, `burn`, `swap`, `skim`, `sync` are guarded; reentry reverts `UniswapV2: LOCKED`.
- `_update(balance0, balance1, r0, r1)`: requires both balances <= 2^112-1 else `UniswapV2: OVERFLOW`. `timestamp = block.timestamp mod 2^32`; `elapsed = timestamp - last` wrapping in uint32. If `elapsed > 0` and both reserves nonzero, add `(r1 << 112) / r0 * elapsed` to price0Cumulative and the mirror to price1Cumulative, wrapping mod 2^256 (overflow is intended). Store reserves and timestamp, emit `Sync`.
- `_mintFee(r0, r1)`: `feeOn = factory.feeTo() != 0`. If on and `kLast != 0`: `rootK = sqrt(r0*r1)`, `rootKLast = sqrt(kLast)`; if `rootK > rootKLast`, `liquidity = totalSupply*(rootK-rootKLast) / (rootK*5 + rootKLast)`, minted to feeTo if > 0 (one sixth of growth). If off and `kLast != 0`, set `kLast = 0`. Returns feeOn.
- `mint(to)`: amounts are `balance - reserve`. Mint fee first. If totalSupply is 0: `liquidity = sqrt(a0*a1) - 1000` and 1000 is minted to `address(0)` (permanent lock; emits Transfer from 0 to 0). Else `min(a0*ts/r0, a1*ts/r1)`. `liquidity > 0` else `UniswapV2: INSUFFICIENT_LIQUIDITY_MINTED`. Update, then `kLast = r0*r1` (new reserves) if feeOn. Emit `Mint(msg.sender, a0, a1)`.
- `burn(to)`: liquidity is the pair's own LP balance. Fee first, then `amount_i = liquidity * balance_i / totalSupply` (totalSupply read after fee mint). Both > 0 else `UniswapV2: INSUFFICIENT_LIQUIDITY_BURNED`. Burn LP, transfer tokens out, update, kLast, emit `Burn`.
- `swap(out0, out1, to, data)`: one out > 0 else `UniswapV2: INSUFFICIENT_OUTPUT_AMOUNT`; `out0 < r0 && out1 < r1` else `UniswapV2: INSUFFICIENT_LIQUIDITY`; `to` not a token else `UniswapV2: INVALID_TO`. Optimistically transfer outs, then if `data.length > 0` call `to.uniswapV2Call(msg.sender, out0, out1, data)` (flash swap). Ins are `balance - (reserve - out)` when positive. At least one in > 0 else `UniswapV2: INSUFFICIENT_INPUT_AMOUNT`. Invariant `(b0*1000 - in0*3) * (b1*1000 - in1*3) >= r0*r1*1000^2` else `UniswapV2: K`. Update and emit `Swap`.
- `skim(to)`: send `balance - reserve` of each token to `to`. `sync()`: `_update` with current balances.
- Token transfers use low-level `call(transfer)` and accept empty return data or `true`; anything else reverts `UniswapV2: TRANSFER_FAILED`.
- Arithmetic is checked with the ds-math pattern: `ds-math-add-overflow`, `ds-math-sub-underflow`, `ds-math-mul-overflow`.
- `permit`: deadline `>= block.timestamp` else `UniswapV2: EXPIRED`; ecrecover must equal owner and be nonzero else `UniswapV2: INVALID_SIGNATURE`.
- LP `transferFrom` skips the allowance decrease when allowance is `uint256.max`.

## Quirks

- `Transfer(0, 0, 1000)` on first mint.
- `chainId` is read in the constructor, so DOMAIN_SEPARATOR is fixed at deploy time.
- Cumulative prices wrap; consumers must take differences mod 2^256.
- `sqrt` is the Babylonian method; `sqrt(0) = 0`, `sqrt(1..3) = 1`.

## Unknowns

- Exact gas per path differs from any clean-room build; we measure it, we do not match it.
- Behaviour with tokens that return non-boolean data is covered only by the TRANSFER_FAILED rule above; not fuzzed.
