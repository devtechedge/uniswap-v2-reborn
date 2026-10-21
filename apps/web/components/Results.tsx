import results from "../lib/results.json";

export function Results() {
  const r = results as {
    differential: { scenarios: number; ops: number; okOps: number; revertedOps: number; comparisons: Record<string, number>; mismatches: number };
    historical: { cases: number; exact: number; fromBlock: number; toBlock: number };
    gas: { op: string; original: number; reborn: number; deltaPct: number }[];
  };
  const d = r.differential;
  return (
    <section className="card wide">
      <h3>Proof: differential results</h3>
      <div className="stats">
        <div><b>{d.ops.toLocaleString("en-US")}</b><span>fuzzed ops ({d.scenarios} scenarios)</span></div>
        <div><b>{d.mismatches}</b><span>mismatches</span></div>
        <div><b>{d.revertedOps.toLocaleString("en-US")}</b><span>reverts compared by reason string</span></div>
        <div><b>{r.historical.exact}/{r.historical.cases}</b><span>real mainnet swaps replayed exactly</span></div>
      </div>
      <p className="muted">Each op runs on the original mainnet bytecode, on our clean-room Solidity, and on the TypeScript model. Status, revert string, every event, and the full observable state must match. Historical swaps come from blocks {r.historical.fromBlock} to {r.historical.toBlock}.</p>
      <h3>Gas (mean execution gas per successful op, in-process EVM)</h3>
      <table>
        <thead><tr><th>Op</th><th>Original (solc 0.5.16 / 0.6.6)</th><th>Reborn (solc 0.8.28)</th><th>Delta</th></tr></thead>
        <tbody>
          {r.gas.map((g) => (
            <tr key={g.op}><td>{g.op}</td><td>{g.original.toLocaleString("en-US")}</td><td>{g.reborn.toLocaleString("en-US")}</td><td className={g.deltaPct <= 0 ? "ok" : "err"}>{g.deltaPct > 0 ? "+" : ""}{g.deltaPct.toFixed(1)}%</td></tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
