#!/usr/bin/env bash
# Proves the differential harness is not vacuous: plant known bugs in the reborn contracts,
# expect the fuzzer to report mismatches, then restore. Exits non-zero if a mutant survives.
set -euo pipefail
cd "$(dirname "$0")/.."
mutants=(
  "contracts/src/libraries/PoolLibrary.sol|amountIn.mul(997)|amountIn.mul(996)"
  "contracts/src/RebornPair.sol|kLast = uint256(reserve0).mul(reserve1);|kLast = uint256(reserve0).mul(reserve1) + 1;"
  "contracts/src/RebornPair.sol|rootK.mul(5)|rootK.mul(4)"
  "contracts/src/RebornPair.sol|MINIMUM_LIQUIDITY = 1000|MINIMUM_LIQUIDITY = 999"
  "contracts/src/RebornPair.sol|amount0In.mul(3)|amount0In.mul(2)"
  "contracts/src/RebornPair.sol|uint224(Q112)) / _reserve0) * timeElapsed|uint224(Q112)) / _reserve0) * (timeElapsed + 1)"
  "contracts/src/RebornRouter.sol|if (msg.value > amountETH)|if (msg.value > amountETH + 1)"
)
survivors=0
for m in "${mutants[@]}"; do
  IFS='|' read -r file from to <<<"$m"
  cp "$file" "$file.bak"
  python3 - "$file" "$from" "$to" <<'PY'
import sys
p, a, b = sys.argv[1:]
s = open(p).read()
assert a in s, f"pattern not found: {a}"
open(p, "w").write(s.replace(a, b, 1))
PY
  (cd contracts && forge build >/dev/null 2>&1)
  if (cd packages/differential && npx tsx src/cli.ts 8 40 original,reborn >/dev/null 2>&1); then
    echo "SURVIVED: $file: $from -> $to"; survivors=$((survivors + 1))
  else
    echo "killed:   $file: $from -> $to"
  fi
  mv "$file.bak" "$file"
done
(cd contracts && forge build >/dev/null 2>&1)
exit "$survivors"
