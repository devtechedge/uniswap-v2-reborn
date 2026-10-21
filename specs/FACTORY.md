# SPEC: Factory

Sources: REA interface output for `0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f` (8 selectors, 0 unknown), storage probe, bytecode strings, public docs.

## Interface

`feeTo`, `feeToSetter`, `getPair(a,b)`, `allPairs(i)`, `allPairsLength`, `createPair(a,b)`, `setFeeTo`, `setFeeToSetter`. Event `PairCreated(token0 indexed, token1 indexed, pair, allPairsLength)`.

## Storage

slot 0 feeTo, slot 1 feeToSetter, slot 2 getPair mapping (address => address => address), slot 3 allPairs array. Constructor sets feeToSetter.

## Behaviour

- `createPair(a, b)`: `a != b` else `UniswapV2: IDENTICAL_ADDRESSES`; sort so token0 < token1; `token0 != 0` else `UniswapV2: ZERO_ADDRESS`; not existing else `UniswapV2: PAIR_EXISTS`. Deploy pair with CREATE2, `salt = keccak256(abi.encodePacked(token0, token1))`, init code = pair creation code (embedded in the factory bytecode; the factory runtime contains the pair runtime, which is why the factory also carries every pair event topic and revert string). Call `initialize`, store both mapping directions, push to allPairs, emit event.
- Pair address: `keccak256(0xff ++ factory ++ salt ++ initCodeHash)[12:]`. Mainnet init code hash `0x96e8ac4277198ff8b6f785478aa9a39f403cb768dd02cbee326c3e7da348845f` appears as a PUSH32 in the Router02 bytecode.
- `setFeeTo`, `setFeeToSetter`: only feeToSetter else `UniswapV2: FORBIDDEN`.

## Notes

On mainnet `feeTo` is set (`0xf385...5f85` at the probe block), so the protocol fee is on. Our differential tests cover both states.
