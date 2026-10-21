/** Runs fuzzed scenarios through original bytecode, the TS model and (optionally) our Solidity. */
import type { World } from "@v2r/model";
import { System, type Impl } from "./system.js";
import { execEvm, execModel, makeModel, modelSnapshot, type Op, type Outcome } from "./ops.js";
import { Rng, generateOp } from "./fuzz.js";

export interface Mismatch {
  seed: number;
  step: number;
  op: string;
  what: string;
  left: unknown;
  right: unknown;
}

export interface Report {
  scenarios: number;
  ops: number;
  okOps: number;
  revertedOps: number;
  byKind: Record<string, { total: number; ok: number }>;
  reasons: Record<string, number>;
  comparisons: Record<string, number>;
  mismatches: Mismatch[];
  gas: Record<string, Record<string, { n: number; total: string }>>;
}

const j = (x: unknown) => JSON.stringify(x, (_k, v) => (typeof v === "bigint" ? v.toString() : v));

function diffOutcome(a: Outcome, b: Outcome): string | null {
  if (a.ok !== b.ok) return "status";
  if (a.reason !== b.reason) return "reason";
  if (j(a.events) !== j(b.events)) return "events";
  return null;
}
function diffState(a: Record<string, string>, b: Record<string, string>): string | null {
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) if (a[k] !== b[k]) return k;
  return null;
}

export function emptyReport(): Report {
  return { scenarios: 0, ops: 0, okOps: 0, revertedOps: 0, byKind: {}, reasons: {}, comparisons: {}, mismatches: [], gas: {} };
}

export async function runScenario(seed: number, steps: number, impls: Impl[], report: Report, opts: { snapshotEvery?: number } = {}) {
  const every = opts.snapshotEvery ?? 1;
  const targets: { impl: Impl; sys: System; model: World }[] = [];
  for (const impl of impls) {
    const sys = await System.create(impl);
    targets.push({ impl, sys, model: makeModel(sys) });
  }
  const rng = new Rng(seed);
  const bump = (k: string) => (report.comparisons[k] = (report.comparisons[k] ?? 0) + 1);
  report.scenarios++;
  for (let step = 0; step < steps; step++) {
    const lead = targets[0]!;
    const op: Op = generateOp(rng, lead.sys, lead.model);
    const results: { impl: Impl; evm: Outcome; model: Outcome }[] = [];
    for (const t of targets) results.push({ impl: t.impl, evm: await execEvm(t.sys, op), model: execModel(t.sys, t.model, op) });
    const fail = (what: string, left: unknown, right: unknown) => report.mismatches.push({ seed, step, op: j(op), what, left, right });

    report.ops++;
    const k = (report.byKind[op.kind] ??= { total: 0, ok: 0 });
    k.total++;
    const base = results[0]!.evm;
    if (base.ok) {
      report.okOps++;
      k.ok++;
    } else {
      report.revertedOps++;
      report.reasons[base.reason || "(empty revert)"] = (report.reasons[base.reason || "(empty revert)"] ?? 0) + 1;
    }
    for (const r of results) {
      const d = diffOutcome(r.evm, r.model);
      bump(`${r.impl}-vs-model`);
      if (d) fail(`${r.impl} vs model: ${d}`, r.evm, r.model);
      if (r.evm.ok && r.evm.gasUsed !== undefined && op.kind !== "warp") {
        const g = ((report.gas[op.kind] ??= {})[r.impl] ??= { n: 0, total: "0" });
        g.n++;
        g.total = String(BigInt(g.total) + r.evm.gasUsed);
      }
    }
    for (let i = 1; i < results.length; i++) {
      bump(`original-vs-${results[i]!.impl}`);
      const d = diffOutcome(results[0]!.evm, results[i]!.evm);
      if (d) fail(`original vs ${results[i]!.impl}: ${d}`, results[0]!.evm, results[i]!.evm);
    }
    if ((step + 1) % every === 0 || step === steps - 1) {
      const snaps = [];
      for (const t of targets) {
        const evmSnap = await t.sys.snapshot();
        const modelSnap = modelSnapshot(t.sys, t.model);
        bump(`${t.impl}-state-vs-model`);
        const d = diffState(evmSnap, modelSnap);
        if (d) fail(`${t.impl} state vs model at ${d}`, evmSnap[d], modelSnap[d]);
        snaps.push(evmSnap);
      }
      for (let i = 1; i < snaps.length; i++) {
        bump(`original-state-vs-${targets[i]!.impl}`);
        const d = diffState(snaps[0]!, snaps[i]!);
        if (d) fail(`original state vs ${targets[i]!.impl} at ${d}`, snaps[0]![d], snaps[i]![d]);
      }
    }
    if (report.mismatches.length > 20) return;
  }
}
