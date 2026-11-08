/**
 * Local geometry of one group (production line). Local coordinates: `u` runs along the row of
 * machines, `v` from the input side (0) to the output side (V). Inputs enter at the top left (or in
 * the middle), outputs leave at the bottom right; `GroupPos.mirror` flips left and right. The result is a list of drawable parts plus logistics counts.
 */
import { balancerCount, balancerTree, type BNode } from '../calc/balancer';
import type { Group } from '../calc/model';
import { isFluid } from '../data/items';
import { LOGISTICS } from '../data/logistics';
import type { Building, ItemId } from '../data/types';
import type { BlockOpt, GroupPos } from '../state/types';

export type Pt = [number, number];

export type Part =
  | { t: 'belt'; pts: Pt[]; item: ItemId; w: number }
  | { t: 'split' | 'merge' | 'junc'; u: number; v: number; item: ItemId }
  | { t: 'loop'; pts: Pt[]; item: ItemId }
  /** `used` = connections already taken inside the group (machines + links to neighbour poles). */
  | { t: 'pole'; u: number; v: number; used?: number }
  /** Power line (pole → machine, pole → pole). */
  | { t: 'wire'; a: Pt; b: Pt };

export interface Machine {
  u: number;
  v: number;
  w: number;
  l: number;
  clock: number;
}

export interface Lane {
  item: ItemId;
  pu: number;
  fluid: boolean;
  /** Parallel belts / pipes needed for the total flow. */
  belts: number;
}

export interface LogiCount {
  splitters: number;
  mergers: number;
  junctions: number;
  /** Power poles of the chosen tier. */
  poles: number;
  /** Power lines: machine connections + links between the poles of this group. */
  wires: number;
}

export interface LocalGeom {
  U: number;
  V: number;
  src: boolean;
  bld?: Building;
  machines: Machine[];
  inLanes: Lane[];
  outLanes: Lane[];
  parts: Part[];
  counts: LogiCount;
  rows: number;
  /** Inputs/outputs in the middle (block setting honoured). */
  center?: boolean;
}

export interface GeoSettings {
  gap: number;
  perRow: number;
  caps: { belt: number; pipe: number };
  /** Power pole tier (1–3). */
  pole?: number;
  /** Center machines on foundations (8 m grid); `gap` is then ignored. */
  align?: boolean;
  /** Too much flow for one belt: true = extra rows, false = parallel belts in the same row. */
  capRows?: boolean;
  /** Settings of this block. */
  opt?: BlockOpt;
}

export const snapUp = (x: number): number => Math.ceil(x / 8 - 1e-9) * 8;

const SPLIT = LOGISTICS.splitter.l; // 4 m
/** Max. connections of Power Pole Mk.1–3 (wiki). */
export const POLE_CONNECTIONS = [4, 7, 10];
const BAND_SOLID = SPLIT + 0.5; // one splitter / merger row
const BAND_FLUID = 3; // pipeline junction row
const LEVEL = 5; // vertical distance between balancer levels
const LANE_SIDE = 1.6; // distance between trunk lanes on the side

export function geomLocal(g: Group, s: GeoSettings): LocalGeom {
  const counts: LogiCount = { splitters: 0, mergers: 0, junctions: 0, poles: 0, wires: 0 };
  if (g.kind === 'source') {
    // extractors need power too (miners, water/oil extractors); external supply does not
    const parts: Part[] = [];
    if ((g.ex?.mw ?? 0) > 0) {
      const per = POLE_CONNECTIONS[(s.pole ?? 2) - 1] - 2;
      const n = Math.ceil(g.count / per);
      for (let k = 0; k < n; k++) parts.push({ t: 'pole', u: 16 - 1.2 - k * 1.4, v: 1.6, used: Math.min(per, g.count - k * per) });
      chainPoles(parts);
      counts.poles = n;
      counts.wires = g.count + n - 1;
    }
    return {
      U: 16, V: 8, src: true, machines: [], inLanes: [], parts, counts, rows: 0,
      outLanes: [{ item: g.id, pu: 8, fluid: isFluid(g.id), belts: lanesFor(g.rate, g.id, s) }],
    };
  }
  const b = g.bld!;
  const n = g.count;
  const o = s.opt ?? {};
  const sumClock = g.clocks.reduce((a, c) => a + c, 0) || 1;
  const maxClock = Math.max(...g.clocks, 1e-9);
  const capOf = (id: ItemId) => (isFluid(id) ? s.caps.pipe : s.caps.belt);
  const perMachine = (rate: number) => (rate * maxClock) / sumClock;
  const balanced = g.dist === 'balancer';

  // machines per row: block setting, else global setting. Only when the belt capacity is handled
  // with extra rows (or for a balancer) does capacity limit the row length; otherwise a row gets parallel belts.
  const userPerRow = o.perRow && o.perRow > 0 ? o.perRow : s.perRow > 0 ? s.perRow : n;
  let perRowCap = n;
  if (s.capRows || balanced)
    for (const f of [...g.inputs, ...g.outputs]) {
      const pm = perMachine(f.rate);
      if (pm > 1e-9) perRowCap = Math.min(perRowCap, Math.max(1, Math.floor(capOf(f.item) / pm + 1e-9)));
    }
  let pr = Math.max(1, Math.min(userPerRow, perRowCap, n));
  const nRows = Math.ceil(n / pr);
  pr = Math.ceil(n / nRows);
  /** Parallel belts needed in one row for a flow. */
  const rowBelts = (f: { item: ItemId; rate: number }, cnt: number) =>
    Math.max(1, Math.ceil((perMachine(f.rate) * cnt) / capOf(f.item) - 1e-6));
  const center =
    o.side === 'center' && nRows === 1 && !balanced && [...g.inputs, ...g.outputs].every((f) => rowBelts(f, pr) === 1);

  const powered = g.kind === 'machine' || g.kind === 'generator' || g.kind === 'sink';
  const balLevels = balanced ? balancerCount(pr).levels : 0;
  const LANE_STEP = 2.2;
  const inBand = g.inputs.map((f) =>
    isFluid(f.item)
      ? BAND_FLUID + (rowBelts(f, pr) - 1) * LANE_STEP
      : balanced
        ? Math.max(1, balLevels) * LEVEL + 1
        : BAND_SOLID + (rowBelts(f, pr) - 1) * LANE_STEP,
  );
  const outBand = g.outputs.map((f) => (isFluid(f.item) ? BAND_FLUID : BAND_SOLID) + (rowBelts(f, pr) - 1) * LANE_STEP);
  const sumIn = inBand.reduce((a, x) => a + x, 0);

  const nIn = g.inputs.length;
  const nOut = g.outputs.length;
  const align = s.align !== false;
  const extra = Math.max(0, o.spacing ?? 0);
  // with alignment every machine gets whole foundations and sits in the middle of them
  const cellW = align ? Math.ceil(b.w / 8 - 1e-9) * 8 : b.w;
  const pitch = align ? cellW + extra * 8 : b.w + s.gap + extra;
  const mOffU = (cellW - b.w) / 2;
  const innerU = (pr - 1) * pitch + cellW;
  // one row with one belt per flow: the belts enter right above the first machine and leave under the
  // last one, so the block needs no extra side strips (only the machines' own foundations)
  const direct = !center && nRows === 1 && !balanced && [...g.inputs, ...g.outputs].every((f) => rowBelts(f, pr) === 1);
  const sideL = center || direct ? 0 : 2 + nIn * LANE_SIDE;
  const sideR = center || direct ? 0 : 2 + nOut * LANE_SIDE;
  const rowGap = 3;
  const u0 = align ? Math.ceil(sideL / 8 - 1e-9) * 8 : sideL;
  const U = snapUp(u0 + innerU + sideR);
  const uEnd = u0 + innerU;
  const uMid = u0 + innerU / 2;
  const sIn = Math.min(1.6, (b.w - 1) / Math.max(1, nIn));
  const sOut = Math.min(1.6, (b.w - 1) / Math.max(1, nOut));
  const inOff = (k: number) => (k - (nIn - 1) / 2) * sIn;
  const outOff = (j: number) => (j - (nOut - 1) / 2) * sOut;

  const inLanes: Lane[] = g.inputs.map((f, k) => ({
    item: f.item,
    pu: center ? uMid + inOff(k) : direct ? u0 + mOffU + b.w / 2 + inOff(k) : u0 - 2 - k * LANE_SIDE,
    fluid: isFluid(f.item),
    belts: lanesFor(f.rate, f.item, s),
  }));
  const outLanes: Lane[] = g.outputs.map((f, j) => ({
    item: f.item,
    pu: center ? uMid + outOff(j) : direct ? u0 + (pr - 1) * pitch + mOffU + b.w / 2 + outOff(j) : uEnd + 2 + j * LANE_SIDE,
    fluid: isFluid(f.item),
    belts: lanesFor(f.rate, f.item, s),
  }));

  const parts: Part[] = [];
  const machines: Machine[] = [];
  const belt = (pts: Pt[], item: ItemId, w = 0.55) => parts.push({ t: 'belt', pts, item, w });
  const node = (t: 'split' | 'merge', u: number, v: number, item: ItemId) => {
    if (isFluid(item)) {
      parts.push({ t: 'junc', u, v, item });
      counts.junctions++;
    } else {
      parts.push({ t, u, v, item });
      if (t === 'split') counts.splitters++;
      else counts.mergers++;
    }
  };
  /** Split `xs` in `k` consecutive chunks (one belt each). */
  const chunks = (xs: number[], k: number): number[][] => {
    const out: number[][] = [];
    for (let j = 0; j < k; j++) out.push(xs.slice(Math.round((j * xs.length) / k), Math.round(((j + 1) * xs.length) / k)));
    return out.filter((c) => c.length);
  };

  const tapsIn: number[][] = g.inputs.map(() => []);
  const tapsOut: number[][] = g.outputs.map(() => []);
  const sumOut = outBand.reduce((a, x) => a + x, 0);
  const rowH = sumIn + 0.5 + b.l + 0.5 + sumOut;
  const content = nRows * rowH + (nRows - 1) * rowGap;
  const V = snapUp(content);
  let top = (V - content) / 2;
  for (let r = 0; r < nRows; r++) {
    const cnt = Math.min(pr, n - r * pr);
    const mStart = top + sumIn + 0.5;
    const mV = mStart;
    const centers: number[] = [];
    for (let i = 0; i < cnt; i++) {
      const idx = r * pr + i;
      const m: Machine = { u: u0 + i * pitch + mOffU, v: mV, w: b.w, l: b.l, clock: g.clocks[idx] ?? 1 };
      machines.push(m);
      centers.push(m.u + m.w / 2);
    }
    // power poles: each pole uses one connection to the previous and one to the next pole
    if (powered) {
      const per = POLE_CONNECTIONS[(s.pole ?? 2) - 1] - 2;
      for (let k = 0; k * per < cnt; k++) {
        const first = k * per;
        const last = Math.min(cnt, first + per) - 1;
        const pu = (centers[first] + centers[last]) / 2;
        const pv = mStart - 0.5;
        parts.push({ t: 'pole', u: pu, v: pv, used: last - first + 1 });
        for (let i = first; i <= last; i++) parts.push({ t: 'wire', a: [pu, pv], b: [centers[i], mV + Math.min(2, b.l / 4)] });
        counts.poles++;
      }
    }
    // ---- inputs (bands directly above the machines)
    let bandTop = top;
    g.inputs.forEach((f, k) => {
      const lane = inLanes[k];
      const w = lane.fluid ? 0.6 : 0.55;
      const xs = centers.map((c) => c + inOff(k));
      if (balanced && !lane.fluid && cnt > 1) {
        const rootV = bandTop + LEVEL / 2;
        tapsIn[k].push(rootV);
        drawBalancer(balancerTree(cnt), xs, rootV, mV, uEnd + 0.8 + k * 0.6, lane, belt, node, parts);
      } else if (center) {
        // fed from the middle: a splitter under the entry sends the items both ways
        const v = bandTop + inBand[k] / 2;
        belt([[lane.pu, 0], [lane.pu, v]], f.item, w);
        belt([[xs[0], v], [xs[xs.length - 1], v]], f.item, w);
        if (xs.length > 1) node('split', lane.pu, v, f.item);
        xs.forEach((x, i) => {
          if (i > 0 && i < xs.length - 1 && Math.abs(x - lane.pu) > 1e-6) node('split', x, v, f.item);
          belt([[x, v], [x, mV]], f.item, 0.32);
        });
      } else {
        chunks(xs, rowBelts(f, cnt)).forEach((cx, j) => {
          const v = bandTop + (lane.fluid ? BAND_FLUID : BAND_SOLID) / 2 + j * LANE_STEP;
          tapsIn[k].push(v);
          belt([[lane.pu, v], [cx[cx.length - 1], v]], f.item, w);
          cx.forEach((x, i) => {
            if (i < cx.length - 1) node('split', x, v, f.item);
            belt([[x, v], [x, mV]], f.item, 0.32);
          });
        });
      }
      bandTop += inBand[k];
    });
    // ---- outputs (merger manifold)
    let ob = mStart + b.l + 0.5;
    g.outputs.forEach((f, j) => {
      const lane = outLanes[j];
      const w = lane.fluid ? 0.6 : 0.55;
      const xs = centers.map((c) => c + outOff(j));
      if (center) {
        const v = ob + outBand[j] / 2;
        xs.forEach((x, i) => {
          belt([[x, mV + b.l], [x, v]], f.item, 0.32);
          if (i > 0 && i < xs.length - 1 && Math.abs(x - lane.pu) > 1e-6) node('merge', x, v, f.item);
        });
        belt([[xs[0], v], [xs[xs.length - 1], v]], f.item, w);
        if (xs.length > 1) node('merge', lane.pu, v, f.item);
        tapsOut[j].push(v);
      } else {
        chunks(xs, rowBelts(f, cnt)).forEach((cx, q) => {
          const v = ob + (lane.fluid ? BAND_FLUID : BAND_SOLID) / 2 + q * LANE_STEP;
          tapsOut[j].push(v);
          cx.forEach((x, i) => {
            belt([[x, mV + b.l], [x, v]], f.item, 0.32);
            if (i > 0) node('merge', x, v, f.item);
          });
          belt([[cx[0], v], [lane.pu, v]], f.item, w);
        });
      }
      ob += outBand[j];
    });
    top = ob + rowGap;
  }

  // ---- trunks (feed each row / each parallel belt)
  inLanes.forEach((lane, k) => {
    if (center) return;
    const vs = tapsIn[k].sort((a, c) => a - c);
    belt([[lane.pu, 0], [lane.pu, vs[vs.length - 1]]], lane.item, 0.55 + Math.min(0.5, (lane.belts - 1) * 0.25));
    vs.slice(0, -1).forEach((v) => node('split', lane.pu, v, lane.item));
  });
  outLanes.forEach((lane, j) => {
    const vs = tapsOut[j].sort((a, c) => a - c);
    belt([[lane.pu, vs[0]], [lane.pu, V]], lane.item, 0.55 + Math.min(0.5, (lane.belts - 1) * 0.25));
    if (!center) vs.slice(1).forEach((v) => node('merge', lane.pu, v, lane.item));
  });
  // a balanced split over several rows needs a small balancer instead of a manifold on the trunk
  if (balanced && nRows > 1) {
    const solidIn = inLanes.filter((l) => !l.fluid).length;
    counts.splitters += solidIn * (balancerCount(nRows).splitters - (nRows - 1));
    counts.mergers += solidIn * balancerCount(nRows).mergers;
  }

  if (counts.poles) counts.wires = machines.length + counts.poles - 1;
  chainPoles(parts);
  return { U, V, src: false, bld: b, machines, inLanes, outLanes, parts, counts, rows: nRows, center };
}

/** The poles of a group are linked in a chain: add those links to `used`. */
function chainPoles(parts: Part[]): void {
  const poles = parts.filter((p): p is Extract<Part, { t: 'pole' }> => p.t === 'pole');
  poles.forEach((p, i) => (p.used = (p.used ?? 0) + (poles.length < 2 ? 0 : i === 0 || i === poles.length - 1 ? 1 : 2)));
  for (let i = 1; i < poles.length; i++) parts.push({ t: 'wire', a: [poles[i - 1].u, poles[i - 1].v], b: [poles[i].u, poles[i].v] });
}

/** Draw a 1:N balancer tree whose leaves end at the machines at `xs`. */
function drawBalancer(
  tree: BNode,
  xs: number[],
  rootV: number,
  mV: number,
  loopU: number,
  lane: Lane,
  belt: (pts: Pt[], item: ItemId, w?: number) => void,
  node: (t: 'split' | 'merge', u: number, v: number, item: ItemId) => void,
  parts: Part[],
): void {
  const item = lane.item;
  let next = 0;
  // assign machine indices to leaves (in order) and compute x per node
  interface Placed { n: BNode; x: number; kids: Placed[]; leafIdx?: number }
  const place = (n: BNode): Placed => {
    if (n.t === 'leaf') {
      const i = next++;
      return { n, x: xs[i], kids: [], leafIdx: i };
    }
    if (n.t === 'loop') return { n, x: NaN, kids: [] };
    const kids = n.children.map(place);
    const real = kids.filter((k) => !Number.isNaN(k.x));
    const x = real.length ? real.reduce((a, k) => a + k.x, 0) / real.length : NaN;
    return { n, x, kids };
  };
  const root = place(tree);
  let loopIdx = 0;
  const draw = (p: Placed, v: number, px: number | null, pv: number, mergerV: number | null, mergerX: number) => {
    if (p.n.t === 'leaf') {
      belt(px == null ? [[p.x, v], [p.x, mV]] : [[px, pv], [p.x, pv], [p.x, mV]], item, 0.32);
      return;
    }
    if (p.n.t === 'loop') {
      // unused output goes back to the merger in front of the (sub)balancer
      const lu = loopU + loopIdx++ * 0.5;
      parts.push({ t: 'loop', pts: [[px!, pv], [lu, pv], [lu, mergerV!], [mergerX, mergerV!]], item });
      return;
    }
    let sv = v;
    let mv = mergerV;
    let mx = mergerX;
    if (px != null) belt([[px, pv], [p.x, pv], [p.x, v]], item, 0.4);
    if (p.n.loopRoot) {
      node('merge', p.x, v, item);
      mv = v;
      mx = p.x;
      sv = v + LEVEL;
      belt([[p.x, v], [p.x, sv]], item, 0.4);
      // extra mergers to combine several unused outputs into one loopback belt
      for (let i = 1; i < (p.n.loops ?? 1); i++) node('merge', loopU + 0.25 + (i - 1) * 0.5, v, item);
    }
    node('split', p.x, sv, item);
    for (const k of p.kids) draw(k, sv + LEVEL, p.x, sv, mv, mx);
  };
  belt([[lane.pu, rootV], [root.x, rootV]], item, 0.55);
  draw(root, rootV, null, rootV, null, root.x);
}

function lanesFor(rate: number, item: ItemId, s: GeoSettings): number {
  const cap = isFluid(item) ? s.caps.pipe : s.caps.belt;
  return Math.max(1, Math.ceil(rate / cap - 1e-6));
}

export interface WorldGeom {
  L: LocalGeom;
  p: GroupPos;
  rot: boolean;
  T: (u: number, v: number) => Pt;
  x: number;
  y: number;
  f: number;
  W: number;
  H: number;
  dir: Pt;
  outs: Pt[];
  outIdx: Record<ItemId, number>;
  ins: Pt[];
}

/** Place local geometry in the world (position + optional 90° rotation). */
export function worldGeom(L: LocalGeom, p: GroupPos): WorldGeom {
  const rot = !!p.rot;
  const mir = !!p.mirror;
  const T = (u0: number, v: number): Pt => {
    const u = mir ? L.U - u0 : u0;
    return rot ? [p.x + v, p.y + u] : [p.x + u, p.y + v];
  };
  const outIdx: Record<ItemId, number> = {};
  L.outLanes.forEach((l, j) => (outIdx[l.item] = j));
  return {
    L, p, rot, T, x: p.x, y: p.y, f: p.f || 0,
    W: rot ? L.V : L.U,
    H: rot ? L.U : L.V,
    dir: rot ? [1, 0] : [0, 1],
    outs: L.outLanes.map((l) => T(l.pu, L.V)),
    outIdx,
    ins: L.inLanes.map((l) => T(l.pu, 0)),
  };
}
