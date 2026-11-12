/**
 * Power network between production lines: connects the poles of all powered groups with a
 * minimum spanning tree (shortest total wire). Power lines are at most 100 m long (wiki), so
 * longer connections get extra poles in between.
 */
import type { Pt } from './geometry';

export const MAX_WIRE = 100;
/** Height difference between floors used for wire length. */
export const FLOOR_H = 8;

export interface NetNode {
  key: string;
  f: number;
  poles: Pt[];
  /** Connections already used per pole inside the group (same order as `poles`). */
  used?: number[];
}

export interface NetEdge {
  a: Pt;
  b: Pt;
  fa: number;
  fb: number;
  len: number;
  /** Extra poles along the wire (only for same-floor edges). */
  extra: Pt[];
}

/** Extra pole next to a full pole: takes over one machine from it, so both have room again. */
export interface HelperPole {
  at: Pt;
  f: number;
  of: Pt;
}

export interface PowerNet {
  edges: NetEdge[];
  helpers: HelperPole[];
  extraPoles: number;
  /** Wire count between lines (incl. segments split by extra poles). */
  wires: number;
  length: number;
}

function closest(a: NetNode, b: NetNode, floorH: number): { pa: Pt; pb: Pt; len: number } {
  let best = { pa: a.poles[0], pb: b.poles[0], len: Infinity };
  const dz = Math.abs(a.f - b.f) * floorH;
  for (const pa of a.poles)
    for (const pb of b.poles) {
      const len = Math.hypot(pa[0] - pb[0], pa[1] - pb[1], dz);
      if (len < best.len) best = { pa, pb, len };
    }
  return best;
}

export function powerNetwork(nodes: NetNode[], cap = 7, floorH = FLOOR_H): PowerNet {
  const ns = nodes.filter((n) => n.poles.length);
  const edges: NetEdge[] = [];
  const helpers: HelperPole[] = [];
  if (ns.length < 2) return { edges, helpers, extraPoles: 0, wires: 0, length: 0 };
  // free connections per pole
  const free = new Map<Pt, number>();
  for (const n of ns) n.poles.forEach((p, i) => free.set(p, cap - (n.used?.[i] ?? 0)));
  /** Take one connection on pole p of node n; add a helper pole when it is full. */
  const take = (n: NetNode, p: Pt): Pt => {
    // prefer a pole of the same group that still has room
    if ((free.get(p) ?? 0) > 0) {
      free.set(p, free.get(p)! - 1);
      return p;
    }
    const alt = n.poles.filter((q) => (free.get(q) ?? 0) > 0).sort((a, b) => Math.hypot(a[0] - p[0], a[1] - p[1]) - Math.hypot(b[0] - p[0], b[1] - p[1]))[0];
    if (alt && Math.hypot(alt[0] - p[0], alt[1] - p[1]) < 12) {
      free.set(alt, free.get(alt)! - 1);
      return alt;
    }
    // helper: one machine moves from p to the helper, p uses that slot for the helper link
    const at: Pt = [p[0] + 1.4, p[1] - 1.4];
    helpers.push({ at, f: n.f, of: p });
    n.poles.push(at);
    free.set(at, cap - 2 - 1); // machine + link to p + this edge
    return at;
  };
  // Prim
  const inTree = new Array(ns.length).fill(false);
  const best: { len: number; from: number; pa?: Pt; pb?: Pt }[] = ns.map(() => ({ len: Infinity, from: -1 }));
  inTree[0] = true;
  const relax = (i: number) => {
    for (let j = 0; j < ns.length; j++) {
      if (inTree[j]) continue;
      const c = closest(ns[i], ns[j], floorH);
      if (c.len < best[j].len) best[j] = { len: c.len, from: i, pa: c.pa, pb: c.pb };
    }
  };
  relax(0);
  for (let k = 1; k < ns.length; k++) {
    let j = -1;
    for (let x = 0; x < ns.length; x++) if (!inTree[x] && (j < 0 || best[x].len < best[j].len)) j = x;
    inTree[j] = true;
    const e = best[j];
    const a = take(ns[e.from], e.pa!);
    const b = take(ns[j], e.pb!);
    const fa = ns[e.from].f;
    const fb = ns[j].f;
    const segs = Math.max(1, Math.ceil(e.len / MAX_WIRE - 1e-9));
    const extra: Pt[] = [];
    for (let s = 1; s < segs; s++) extra.push([a[0] + ((b[0] - a[0]) * s) / segs, a[1] + ((b[1] - a[1]) * s) / segs]);
    edges.push({ a, b, fa, fb, len: e.len, extra });
    relax(j);
  }
  return {
    edges,
    helpers,
    extraPoles: edges.reduce((s, e) => s + e.extra.length, 0) + helpers.length,
    wires: edges.reduce((s, e) => s + e.extra.length + 1, 0) + helpers.length,
    length: edges.reduce((s, e) => s + e.len, 0),
  };
}
