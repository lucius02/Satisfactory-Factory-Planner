import { BUILDINGS, POWER_EXP } from '../data/buildings';
import { GENERATORS, genFuel, type GenSpec } from '../data/generators';
import { isFluid, ITEMS } from '../data/items';
import { beltCap, LOGISTICS, pipeCap } from '../data/logistics';
import { canSink, SINK_POINTS } from '../data/sinkPoints';
import type { Building, ItemId, Recipe } from '../data/types';
import type { State } from '../state/types';
import { smoothUp } from './balancer';
import { extractorFor } from './extractors';
import type { Group, Model, Supply } from './model';
import { chosenRecipe, makeDepth } from './recipes';

export type PlanInput = { gens?: GenSpec[] } & Pick<
  State,
  'targets' | 'external' | 'rc' | 'miner' | 'purity' | 'clockMode' | 'belt' | 'pipe' | 'reuse' | 'surplus' | 'dist' | 'distOv' | 'balSmooth'
>;

const EPS = 1e-9;

export const SINK_BLD: Building = { n: LOGISTICS.sink.n, w: LOGISTICS.sink.w, l: LOGISTICS.sink.l, mw: LOGISTICS.sink.mw, c: '#e0b23a' };
export const STORAGE_BLD: Building = { n: LOGISTICS.storage.n, w: LOGISTICS.storage.w, l: LOGISTICS.storage.l, mw: 0, c: '#8a96a3' };
export const BUFFER_BLD: Building = { n: LOGISTICS.fluidBuffer.n, w: LOGISTICS.fluidBuffer.w, l: LOGISTICS.fluidBuffer.l, mw: 0, c: '#4aa8e0' };

/**
 * Production solver. Works back from the targets to the raw resources (fixed-point iteration),
 * reuses byproducts when allowed and also handles loops (Recycled Plastic ↔ Recycled Rubber).
 * Belt and pipe tiers limit the clock speed of machines whose input or output does not fit on one belt.
 */
export function compute(p: PlanInput): Model {
  const caps = { belt: beltCap(p.belt), pipe: pipeCap(p.pipe) };
  const capOf = (id: ItemId) => (isFluid(id) ? caps.pipe : caps.belt);
  const R = (id: ItemId) => chosenRecipe(id, p.rc);
  const depth = makeDepth(p.rc);

  const T: Record<ItemId, number> = {};
  for (const tg of p.targets) {
    if (!R(tg.item) || !(tg.rate > 0)) continue;
    T[tg.item] = (T[tg.item] ?? 0) + tg.rate;
  }

  const EXT: Record<ItemId, number> = {};
  for (const e of p.external ?? []) if (e.rate > 0) EXT[e.item] = (EXT[e.item] ?? 0) + e.rate;

  // generators: fixed demand for fuel and water
  const GD: Record<ItemId, number> = {};
  const genGroups: Group[] = [];
  (p.gens ?? []).forEach((spec, i) => {
    const G = GENERATORS[spec.gen];
    if (!G || !(spec.value > 0)) return;
    const f = genFuel(spec.gen, spec.fuel);
    const exact = spec.mode === 'mw' ? spec.value / G.mw : spec.value;
    const count = Math.max(1, Math.ceil(exact - 1e-6));
    const inputs = [{ item: f.item, rate: f.rate * exact }];
    if (G.water) inputs.push({ item: 'water', rate: G.water * exact });
    for (const x of inputs) GD[x.item] = (GD[x.item] ?? 0) + x.rate;
    genGroups.push({
      key: `g:${i}`, id: f.item, kind: 'generator', bld: { n: G.n, w: G.w, l: G.l, mw: 0, c: G.c }, rate: G.mw * exact,
      exact, count, clocks: Array(count).fill(exact / count), maxClock: 1, power: 0, gen: G.mw * exact, inputs,
      outputs: Object.entries(f.waste ?? {}).map(([item, r]) => ({ item, rate: r * exact })),
      dist: isFluid(f.item) ? 'manifold' : p.distOv[`g:${i}`] ?? p.dist,
    });
  });

  const maxClockOf = (r: Recipe): { mc: number; limit?: ItemId } => {
    let mc = 1;
    let limit: ItemId | undefined;
    for (const [k, v] of [...Object.entries(r.in), ...Object.entries(r.out)]) {
      const c = capOf(k) / v;
      if (c < mc - EPS) {
        mc = c;
        limit = k;
      }
    }
    return { mc, limit };
  };
  const hasSolidInput = (r: Recipe) => Object.keys(r.in).some((k) => !isFluid(k));
  const distOf = (id: ItemId) => p.distOv['m:' + id] ?? p.dist;
  const machineCount = (id: ItemId, exact: number): number => {
    const r = R(id)!;
    const { mc } = maxClockOf(r);
    let c = Math.max(1, Math.ceil(exact / mc - 1e-6));
    if (p.balSmooth && distOf(id) === 'balancer' && hasSolidInput(r)) c = smoothUp(c);
    return c;
  };

  const flows = (x: Record<ItemId, number>) => {
    const demand: Record<ItemId, number> = { ...T };
    for (const k in GD) demand[k] = (demand[k] ?? 0) + GD[k];
    const byp: Record<ItemId, number> = {};
    for (const id in x) {
      const r = R(id)!;
      const m = x[id];
      for (const [k, v] of Object.entries(r.in)) demand[k] = (demand[k] ?? 0) + v * m;
      for (const [k, v] of Object.entries(r.out)) if (k !== id) byp[k] = (byp[k] ?? 0) + v * m;
    }
    return { demand, byp };
  };
  /** Demand covered by external supply and (optionally) byproducts. */
  const covered = (id: ItemId, d: number, b: number | undefined) => Math.min(d, (EXT[id] ?? 0) + (p.reuse ? b ?? 0 : 0));

  const iterate = (x: Record<ItemId, number>, round: boolean) => {
    for (let it = 0; it < 600; it++) {
      const { demand, byp } = flows(x);
      const nx: Record<ItemId, number> = {};
      for (const id in demand) {
        const r = R(id);
        const net = demand[id] - covered(id, demand[id], byp[id]);
        if (!r || net <= EPS) continue;
        let v = net / r.out[id];
        if (round) v = Math.max(x[id] ?? 0, machineCount(id, v) * maxClockOf(r).mc);
        nx[id] = v;
      }
      let diff = 0;
      for (const k of new Set([...Object.keys(x), ...Object.keys(nx)])) diff += Math.abs((nx[k] ?? 0) - (x[k] ?? 0));
      x = nx;
      if (diff < EPS) return { x, converged: true };
      if (diff > 1e9) break;
    }
    return { x, converged: false };
  };

  let { x, converged } = iterate({}, false);
  if (p.clockMode === 'full' && converged) ({ x, converged } = iterate(x, true));

  const { demand, byp } = flows(x);
  const groups: Group[] = [];
  const supply: Record<ItemId, Supply[]> = {};
  const addSupply = (item: ItemId, key: string, rate: number) => {
    if (rate > EPS) (supply[item] ??= []).push({ key, rate });
  };

  for (const id in EXT) {
    const key = 'x:' + id;
    groups.push({
      key, id, kind: 'source', rate: EXT[id], exact: 1, count: 1, clocks: [], maxClock: 1, power: 0, inputs: [],
      outputs: [{ item: id, rate: EXT[id] }], dist: 'manifold', external: true,
      ex: { name: 'External supply', nameKey: 'external', per: Infinity, mw: 0 },
    });
    addSupply(id, key, EXT[id]);
  }

  const ids = Object.keys(demand).sort((a, b) => depth(b) - depth(a));
  for (const id of ids) {
    const r = R(id);
    if (!r) {
      const rate = demand[id] - covered(id, demand[id], byp[id]);
      if (rate <= EPS) continue;
      const ex = extractorFor(id, { miner: p.miner, purity: p.purity, beltCap: caps.belt, pipeCap: caps.pipe });
      const count = Number.isFinite(ex.per) ? Math.max(1, Math.ceil(rate / ex.per - 1e-6)) : 1;
      const key = 's:' + id;
      groups.push({
        key, id, kind: 'source', rate, exact: rate / ex.per, count, clocks: [], maxClock: 1, power: count * ex.mw,
        inputs: [], outputs: [{ item: id, rate }], dist: 'manifold', ex,
      });
      addSupply(id, key, rate);
      continue;
    }
    const exact = x[id];
    if (!(exact > EPS)) continue;
    const { mc, limit } = maxClockOf(r);
    const count = machineCount(id, exact);
    const clocks = clocksFor(p.clockMode, exact, count, mc);
    const bld = BUILDINGS[r.b];
    const bmw = r.mw ?? bld.mw;
    const key = 'm:' + id;
    const outputs = Object.entries(r.out).map(([k, v]) => ({ item: k, rate: v * exact }));
    groups.push({
      key, id, kind: 'machine', b: r.b, bld, rec: r, rate: r.out[id] * exact, exact, count, clocks,
      maxClock: mc, limitItem: limit,
      power: clocks.reduce((s, c) => s + bmw * Math.pow(c, POWER_EXP), 0),
      inputs: Object.entries(r.in).map(([k, v]) => ({ item: k, rate: v * exact })),
      outputs, dist: hasSolidInput(r) ? distOf(id) : 'manifold',
    });
    for (const o of outputs) addSupply(o.item, key, o.rate);
  }

  for (const g of genGroups) {
    groups.push(g);
    for (const o of g.outputs) addSupply(o.item, g.key, o.rate);
  }

  const left: Record<ItemId, number> = {};
  for (const item in supply) {
    const tot = supply[item].reduce((s, x) => s + x.rate, 0);
    const l = tot - (demand[item] ?? 0);
    if (l > 1e-6) left[item] = l;
  }

  if (p.surplus !== 'output') groups.push(...surplusGroups(p.surplus, left, caps));

  const byKey: Record<string, Group> = {};
  for (const g of groups) byKey[g.key] = g;
  return { groups, byKey, demand, supply, left, targets: T, converged, caps, depth };
}

/** Clock speed per machine. */
export function clocksFor(mode: PlanInput['clockMode'], exact: number, count: number, mc: number): number[] {
  if (mode === 'even') return Array(count).fill(exact / count);
  const a: number[] = [];
  let r = exact;
  for (let i = 0; i < count; i++) {
    const c = Math.max(0, Math.min(mc, r));
    a.push(c);
    r -= c;
  }
  return a;
}

function surplusGroups(mode: 'sink' | 'storage', left: Record<ItemId, number>, caps: { belt: number; pipe: number }): Group[] {
  const out: Group[] = [];
  const sinkItems: ItemId[] = [];
  const store: { id: ItemId; fallback: boolean }[] = [];
  for (const id of Object.keys(left).sort((a, b) => (ITEMS[a]?.n ?? a).localeCompare(ITEMS[b]?.n ?? b))) {
    if (mode === 'sink' && canSink(id) && !isFluid(id)) sinkItems.push(id);
    else store.push({ id, fallback: mode === 'sink' });
  }
  if (sinkItems.length) {
    const total = sinkItems.reduce((s, id) => s + left[id], 0);
    const count = Math.max(1, Math.ceil(total / caps.belt - 1e-6));
    out.push({
      key: 'k:sink', id: '', kind: 'sink', bld: SINK_BLD, rate: total, exact: total / caps.belt, count,
      clocks: Array(count).fill(1), maxClock: 1, power: count * LOGISTICS.sink.mw,
      inputs: sinkItems.map((id) => ({ item: id, rate: left[id] })), outputs: [], dist: 'manifold',
      sinkPoints: sinkItems.reduce((s, id) => s + left[id] * SINK_POINTS[id], 0),
    });
  }
  for (const { id, fallback } of store) {
    const rate = left[id];
    const fluid = isFluid(id);
    // Industrial Storage Container has 2 belt inputs; a fluid buffer one pipe input
    const count = Math.max(1, Math.ceil(rate / (fluid ? caps.pipe : 2 * caps.belt) - 1e-6));
    out.push({
      key: 'st:' + id, id, kind: 'storage', bld: fluid ? BUFFER_BLD : STORAGE_BLD, rate, exact: count, count,
      clocks: Array(count).fill(1), maxClock: 1, power: 0, inputs: [{ item: id, rate }], outputs: [], dist: 'manifold',
      fillMin: fluid ? (count * LOGISTICS.fluidBuffer.m3) / rate : undefined, fallback,
    });
  }
  return out;
}
