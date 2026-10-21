#!/usr/bin/env bash
# Starts anvil (if not running) and deploys the reborn contracts with a seeded ALPHA/BETA pool.
# Uses anvil's unlocked default account; no private key is read or written.
set -euo pipefail
cd "$(dirname "$0")/../contracts"
RPC=${RPC:-http://127.0.0.1:8545}
if ! cast chain-id --rpc-url "$RPC" >/dev/null 2>&1; then
  anvil --silent >/dev/null 2>&1 & echo "started anvil (pid $!)"; sleep 2
fi
SENDER=$(cast rpc eth_accounts --rpc-url "$RPC" | tr -d '[]" ' | cut -d, -f1)
forge script script/DeployLocal.s.sol --rpc-url "$RPC" --broadcast --unlocked --sender "$SENDER"
