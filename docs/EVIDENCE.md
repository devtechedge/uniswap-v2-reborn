# Evidence format

| path | what | produced by |
|---|---|---|
| `evidence/bytecode/<Name>.hex` | runtime code, `0x` hex, one line | `scripts/fetch-bytecode.mjs` |
| `evidence/bytecode/manifest.json` | RPC, pinned block, address, byte length, SHA-256 of decoded bytes | same |
| `evidence/rea/<Name>.interface.json` | full REA envelope from `rea inspect-evm-interface <file> hex --format json --full-output` (rea-agents 6.7.0, evmole 0.9.3) | REA CLI |
| `evidence/signatures.json` | candidate signatures transcribed from public interface docs | by hand |
| `evidence/summary/<Name>.json` | selectors with resolved names, event topics, revert strings, REA evidence id and limitations | `scripts/summarize-evidence.mjs` |
| `evidence/storage-probe.json` | first 13 pair slots and 4 factory slots next to getter values at one block | `scripts/probe-storage.mjs` |
| `evidence/historical/weth-usdc-swaps.json` | 426 real swaps with pre and post reserves | `scripts/fetch-historical-swaps.mjs` |
| `evidence/SHA256SUMS.json` | SHA-256 of every evidence file | `scripts/summarize-evidence.mjs` |

REA's `evidence-export` only accepts agent-session bundles, so single CLI results are stored raw and hashed here. Each REA envelope also carries its own `evidence_id` and subject digest.

To verify:

```bash
node -e 'const c=require("crypto"),f=require("fs");for(const[p,h]of Object.entries(require("./evidence/SHA256SUMS.json"))){let b=f.readFileSync(p);if(p.endsWith(".hex"))b=Buffer.from(b.toString().trim().slice(2),"hex");console.log(c.createHash("sha256").update(b).digest("hex")===h.split(" ")[0]?"ok  ":"FAIL",p)}'
```

Runtime code of these contracts is immutable, so any block gives the same bytes; the manifest records the block used.
