"use client";

import { useState } from "react";
import { quoteWethToUsdc, MAINNET, type MainnetQuote as Q } from "../lib/mainnet";
import { fmt, parse } from "../lib/format";

export function MainnetQuote() {
  const [amount, setAmount] = useState("1");
  const [q, setQ] = useState<Q | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function run() {
    const v = parse(amount);
    if (!v) return;
    setBusy(true);
    setErr(null);
    try {
      setQ(await quoteWethToUsdc(v));
    } catch (e) {
      setErr((e as Error).message.split("\n")[0] ?? "request failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card">
      <h3>Live mainnet check (read-only)</h3>
      <p className="muted">Reads the real WETH/USDC pair <span className="mono">{MAINNET.pair.slice(0, 10)}...</span> and asks the deployed Router02 for a quote, then computes the same quote with the TypeScript model from the same reserves at the same block. No wallet, no transactions.</p>
      <div className="row">
        <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" aria-label="WETH amount" />
        <span>WETH to USDC</span>
        <button onClick={run} disabled={busy}>{busy ? "Reading..." : "Compare"}</button>
      </div>
      {err && <p className="err">{err}</p>}
      {q && (
        <table>
          <tbody>
            <tr><td>Block</td><td>{q.block.toString()}</td></tr>
            <tr><td>Reserves</td><td>{fmt(q.reserveUsdc, 6, 2)} USDC / {fmt(q.reserveWeth, 18, 4)} WETH</td></tr>
            <tr><td>Router02 on mainnet</td><td>{fmt(q.routerOut, 6, 6)} USDC</td></tr>
            <tr><td>TypeScript model</td><td>{fmt(q.modelOut, 6, 6)} USDC</td></tr>
            <tr><td>Match</td><td className={q.routerOut === q.modelOut ? "ok" : "err"}>{q.routerOut === q.modelOut ? "identical to the wei" : "MISMATCH"}</td></tr>
          </tbody>
        </table>
      )}
    </section>
  );
}
