// Turns raw REA inspect-evm-interface outputs into a compact, reviewable summary.
// Selector names are resolved by hashing candidate signatures taken from the public
// Uniswap v2 documentation (docs.uniswap.org), never from source code. A selector that no
// candidate matches stays "unknown". Event topics and revert strings are scanned from the
// bytecode itself (PUSH32 operands and ASCII runs in data).
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { toFunctionSelector, toEventSelector } from "viem";

const candidates = JSON.parse(readFileSync("evidence/signatures.json", "utf8"));
const fnBySel = new Map(candidates.functions.map((s) => [toFunctionSelector(s).slice(2), s]));
const evByTopic = new Map(candidates.events.map((s) => [toEventSelector(s).slice(2), s]));

function push32s(hex) {
  const b = Buffer.from(hex, "hex");
  const out = [];
  for (let i = 0; i < b.length; i++) {
    const op = b[i];
    if (op >= 0x60 && op <= 0x7f) {
      const n = op - 0x5f;
      if (op === 0x7f) out.push(b.subarray(i + 1, i + 1 + n).toString("hex"));
      i += n;
    }
  }
  return out;
}
function asciiRuns(hex) {
  const s = Buffer.from(hex, "hex").toString("latin1");
  return [...new Set(s.match(/[A-Za-z0-9_:\- ]{8,}/g) ?? [])].filter((x) => /[A-Z]/.test(x) && / |:/.test(x));
}

const hashes = {};
for (const f of readdirSync("evidence/rea").filter((f) => f.endsWith(".interface.json"))) {
  const raw = readFileSync(`evidence/rea/${f}`);
  hashes[`evidence/rea/${f}`] = createHash("sha256").update(raw).digest("hex");
  const d = JSON.parse(raw).data;
  const hex = d.normalized_result.bytecode.hex;
  const name = f.replace(".interface.json", "");
  const topics = push32s(hex).filter((t) => evByTopic.has(t));
  const summary = {
    contract: name,
    reaEvidenceId: d.evidence_id,
    provider: d.provider,
    bytecodeSha256: d.normalized_result.bytecode.sha256,
    bytes: d.normalized_result.bytecode.bytes,
    compilerMetadata: d.raw_result.metadata,
    functions: d.raw_result.functions.map((fn) => ({
      selector: "0x" + fn.selector,
      signature: fnBySel.get(fn.selector) ?? "unknown",
      reaArguments: fn.arguments,
      stateMutability: fn.stateMutability,
    })),
    events: [...new Set(topics)].map((t) => ({ topic0: "0x" + t, signature: evByTopic.get(t) })),
    revertStrings: asciiRuns(hex),
    limitations: d.limitations,
  };
  writeFileSync(`evidence/summary/${name}.json`, JSON.stringify(summary, null, 2) + "\n");
  console.log(name, summary.functions.length, "fns", summary.events.length, "events", summary.functions.filter((x) => x.signature === "unknown").length, "unknown");
}
for (const f of readdirSync("evidence/bytecode").filter((f) => f.endsWith(".hex"))) {
  const buf = Buffer.from(readFileSync(`evidence/bytecode/${f}`, "utf8").trim().slice(2), "hex");
  hashes[`evidence/bytecode/${f}`] = createHash("sha256").update(buf).digest("hex") + " (decoded bytes)";
}
for (const f of ["evidence/storage-probe.json", "evidence/signatures.json", ...readdirSync("evidence/summary").map((x) => `evidence/summary/${x}`)]) {
  hashes[f] = createHash("sha256").update(readFileSync(f)).digest("hex");
}
writeFileSync("evidence/SHA256SUMS.json", JSON.stringify(hashes, null, 2) + "\n");
