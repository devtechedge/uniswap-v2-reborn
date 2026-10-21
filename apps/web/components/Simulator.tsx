"use client";

import { useMemo, useRef, useState } from "react";
import { createSim, observe, symbolOf, twapSeries, SIM, TOKENS, type HistoryPoint } from "../lib/sim";
import { fmt, parse } from "../lib/format";
import { ZERO_ADDRESS, type Address, type ModelEvent } from "../lib/model";
import { LineChart } from "./Chart";

const D = 2n ** 64n;
const [ALPHA, BETA, WETH] = TOKENS.map((t) => t.address) as [Address, Address, Address];
const PATHS: Record<string, Address[]> = {
  "ALPHA>BETA": [ALPHA, BETA], "BETA>ALPHA": [BETA, ALPHA], "ALPHA>WETH": [ALPHA, WETH],
  "WETH>ALPHA": [WETH, ALPHA], "BETA>WETH": [BETA, ALPHA, WETH], "WETH>BETA": [WETH, ALPHA, BETA],
};

export function Simulator() {
  const world = useRef(createSim());
  const w = world.current;
  const pairs = w.allPairs;
  const [, setTick] = useState(0);
  const [pairIdx, setPairIdx] = useState(0);
  const [route, setRoute] = useState("ALPHA>BETA");
  const [amount, setAmount] = useState("100");
  const [addA, setAddA] = useState("1000");
  const [removePct, setRemovePct] = useState(25);
  const [log, setLog] = useState<{ title: string; ok: boolean; detail: string; events: ModelEvent[] }[]>([]);
  const history = useRef<Record<string, HistoryPoint[]>>(Object.fromEntries(pairs.map((p) => [p, [observe(w, p)]])));
  const pair = w.pair(pairs[pairIdx]!);
  const path = PATHS[route]!;
  const amountIn = parse(amount);

  const quote = useMemo(() => {
    if (!amountIn) return null;
    try {
      return w.getAmountsOut(amountIn, path);
    } catch (e) {
      return (e as Error).message;
    }
  }, [amountIn, route, log.length]); // eslint-disable-line react-hooks/exhaustive-deps

  function record(title: string, fn: () => unknown) {
    const r = w.tx(fn);
    for (const p of pairs) history.current[p]!.push(observe(w, p));
    setLog((l) => [{ title, ok: r.ok, detail: r.ok ? "ok" : r.reason || "(empty revert)", events: r.ok ? r.events : [] }, ...l].slice(0, 30));
    setTick((t) => t + 1);
  }

  function swap() {
    if (!amountIn) return;
    if (path[0] === WETH) record(`swap ${amount} WETH via ${route}`, () => w.swapExactETHForTokens(SIM.user, amountIn, 0n, path, SIM.user, D));
    else if (path[path.length - 1] === WETH) record(`swap ${amount} ${symbolOf(path[0]!)} for ETH`, () => w.swapExactTokensForETH(SIM.user, amountIn, 0n, path, SIM.user, D));
    else record(`swap ${amount} ${symbolOf(path[0]!)} via ${route}`, () => w.swapExactTokensForTokens(SIM.user, amountIn, 0n, path, SIM.user, D));
  }
  function add() {
    const a = parse(addA);
    if (!a) return;
    const [t0, t1] = [pair.token0, pair.token1];
    const b = pair.reserve0 === 0n ? a : (a * pair.reserve1) / pair.reserve0 + 1n;
    if (t1 === WETH) record(`add ${addA} ${symbolOf(t0)} + ETH`, () => w.addLiquidityETH(SIM.user, b, t0, a, 0n, 0n, SIM.user, D));
    else record(`add ${addA} ${symbolOf(t0)} + ${symbolOf(t1)}`, () => w.addLiquidity(SIM.user, t0, t1, a, b, 0n, 0n, SIM.user, D));
  }
  function remove() {
    const lp = (w.balanceOf(pair.address, SIM.user) * BigInt(removePct)) / 100n;
    w.tokenApprove(pair.address, SIM.user, SIM.router, lp);
    if (pair.token1 === WETH) record(`remove ${removePct}% LP`, () => w.removeLiquidityETH(SIM.user, pair.token0, lp, 0n, 0n, SIM.user, D));
    else record(`remove ${removePct}% LP`, () => w.removeLiquidity(SIM.user, pair.token0, pair.token1, lp, 0n, 0n, SIM.user, D));
  }
  function warp(seconds: number) {
    w.timestamp += BigInt(seconds);
    for (const p of pairs) history.current[p]!.push(observe(w, p));
    setTick((t) => t + 1);
  }
  function toggleFee() {
    const on = w.feeTo === ZERO_ADDRESS;
    record(on ? "protocol fee on" : "protocol fee off", () => w.setFeeTo(SIM.admin, on ? SIM.feeTo : ZERO_ADDRESS));
  }

  const h = history.current[pair.address]!;
  const tw = twapSeries(h);
  const out = Array.isArray(quote) ? quote[quote.length - 1]! : null;

  return (
    <section className="grid">
      <div className="card">
        <h3>Swap</h3>
        <label>Route
          <select value={route} onChange={(e) => setRoute(e.target.value)}>
            {Object.keys(PATHS).map((k) => <option key={k} value={k}>{k.replace(">", " to ")}{PATHS[k]!.length > 2 ? " (multi-hop)" : ""}</option>)}
          </select>
        </label>
        <label>Amount in <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" /></label>
        <p className="quote">{out !== null ? <>Quote: <b>{fmt(out)}</b> {symbolOf(path[path.length - 1]!)}</> : <span className="err">{typeof quote === "string" ? quote : "enter an amount"}</span>}</p>
        <button onClick={swap} disabled={out === null}>Swap</button>
        <h3>Liquidity ({symbolOf(pair.token0)}/{symbolOf(pair.token1)})</h3>
        <label>Add {symbolOf(pair.token0)} <input value={addA} onChange={(e) => setAddA(e.target.value)} inputMode="decimal" /></label>
        <button onClick={add}>Add at pool ratio</button>
        <label>Remove {removePct}% of your LP <input type="range" min={1} max={100} value={removePct} onChange={(e) => setRemovePct(Number(e.target.value))} /></label>
        <button onClick={remove}>Remove</button>
        <h3>Chain controls</h3>
        <div className="row">
          <button onClick={() => warp(3600)}>+1 hour</button>
          <button onClick={() => warp(86400)}>+1 day</button>
          <button onClick={toggleFee}>{w.feeTo === ZERO_ADDRESS ? "Turn protocol fee on" : "Turn protocol fee off"}</button>
        </div>
      </div>

      <div className="card">
        <h3>Pool stats</h3>
        <select value={pairIdx} onChange={(e) => setPairIdx(Number(e.target.value))}>
          {pairs.map((p, i) => <option key={p} value={i}>{symbolOf(w.pair(p).token0)}/{symbolOf(w.pair(p).token1)}</option>)}
        </select>
        <table>
          <tbody>
            <tr><td>Pair (CREATE2)</td><td className="mono">{pair.address}</td></tr>
            <tr><td>Reserve {symbolOf(pair.token0)}</td><td>{fmt(pair.reserve0)}</td></tr>
            <tr><td>Reserve {symbolOf(pair.token1)}</td><td>{fmt(pair.reserve1)}</td></tr>
            <tr><td>Spot price</td><td>{h[h.length - 1]!.spot.toPrecision(6)} {symbolOf(pair.token1)} per {symbolOf(pair.token0)}</td></tr>
            <tr><td>LP total supply</td><td>{fmt(pair.totalSupply)}</td></tr>
            <tr><td>Your LP</td><td>{fmt(w.balanceOf(pair.address, SIM.user))}</td></tr>
            <tr><td>Locked at address(0)</td><td>{fmt(w.balanceOf(pair.address, ZERO_ADDRESS), 18, 18)}</td></tr>
            <tr><td>Protocol fee LP</td><td>{fmt(w.balanceOf(pair.address, SIM.feeTo))}</td></tr>
            <tr><td>kLast</td><td className="mono">{pair.kLast.toString()}</td></tr>
            <tr><td>price0CumulativeLast</td><td className="mono">{pair.price0CumulativeLast.toString()}</td></tr>
            <tr><td>Block time</td><td>{new Date(Number(w.timestamp) * 1000).toISOString().replace(".000Z", "Z")}</td></tr>
          </tbody>
        </table>
        <h3>Spot vs TWAP (UQ112x112 accumulator)</h3>
        <LineChart series={[
          { label: "spot", color: "#7dd3fc", points: h.map((p) => ({ x: p.t, y: p.spot })) },
          { label: "TWAP since start", color: "#f0abfc", points: tw.map((p) => ({ x: p.t, y: p.twap })) },
        ]} />
      </div>

      <div className="card wide">
        <h3>Transaction log (events exactly as the contracts emit them)</h3>
        {log.length === 0 && <p className="muted">No transactions yet.</p>}
        {log.map((l, i) => (
          <details key={log.length - i}>
            <summary className={l.ok ? "" : "err"}>{l.title}: {l.detail}</summary>
            <ul className="mono small">
              {l.events.map((e, j) => <li key={j}>{symbolOf(e.address)}.{e.name}({e.args.map((a) => (typeof a === "string" ? symbolOf(a) : a.toString())).join(", ")})</li>)}
            </ul>
          </details>
        ))}
      </div>
    </section>
  );
}
