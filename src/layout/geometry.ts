/**
 * Local geometry of one group (production line). Local coordinates: `u` runs along the row of
 * machines, `v` from the input side (0) to the output side (V). Inputs enter at the top and outputs
 * leave at the bottom, each on the left, in the middle or on the right (`inSide` / `outSide`). The result is a list of drawable parts plus logistics counts.
 */
import { balancerCount, balancerTree, type BNode } from '../calc/balancer';
import type { Group } from '../calc/model';
import { isFluid } from '../data/items';
import { LOGISTICS } from '../data/logistics';
import type { Building, ItemId } from '../data/types';
import type { BlockOpt, FluidDist, GroupPos } from '../state/types';

export type Pt = [number, number];
export type Side = 'left' | 'center' | 'right';

export type Part =
  | { t: 'belt'; pts: Pt[]; item: ItemId; w: number; n?: number }
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
  /** Split output: the consumer (group key, or '*target' for the end product) this lane goes to. */
  to?: string;
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
  /** Sides where the belts enter / leave (resolved), per input item. */
  inSides?: Record<ItemId, Side>;
  outSide?: Side;
  /** Main output split per consumer. */
  split?: boolean;
  /** Rows in facing pairs. */
  facing?: boolean;
}

export interface GeoSettings {
  gap: number;
  perRow: number;
  caps: { belt: number; pipe: number };
  /** Power pole tier (1–3). */
  pole?: number;
  /** Daisy-chaining (1.2): machines pass power on to the next one; one pole per row. */
  daisy?: boolean;
  /** Center machines on foundations (8 m grid); `gap` is then ignored. */
  align?: boolean;
  /** Too much flow for one belt: true = extra rows, false = parallel belts in the same row. */
  capRows?: boolean;
  /** Settings of this block. */
  opt?: BlockOpt;
  /** Resolved entry side per input item, and exit side (block setting or automatic). */
  inSides?: Record<ItemId, Side>;
  /** Default entry side for inputs without their own. */
  inSide?: Side;
  outSide?: Side;
  /** How pipes feed the machines (fluid inputs). */
  fluidDist?: FluidDist;
  /** Split the main output over these consumers (one output belt each) instead of merging it. */
  outSplit?: { key: string; rate: number }[];
}

export const snapUp = (x: number): number => Math.ceil(x / 8 - 1e-9) * 8;

const SPLIT = LOGISTICS.splitter.l; // 4 m
/** Max. connections of Power Pole Mk.1–3 (wiki). */
export const POLE_CONNECTIONS = [4, 7, 10];
const BAND_SOLID = SPLIT + 0.5; // one splitter / merger row
const BAND_FLUID = 3; // pipeline junction row
const LEVEL = 5; // vertical distance between balancer levels
const LEVEL_F = 3; // vertical distance between levels of a pipe tree
const LOOP_F = 2.2; // extra room for a loopback pipe
const LANE_SIDE = 2.4; // distance between trunk lanes on the side
/** Distance between parallel belts / pipes of one lane (same as the renderer's `parallel()`). */
export const PAR_STEP = 1.6;

export function geomLocal(g0: Group, s: GeoSettings): LocalGeom {
  const counts: LogiCount = { splitters: 0, mergers: 0, junctions: 0, poles: 0, wires: 0 };
  let g = g0;
  // miners / extractors are drawn as real buildings (merged onto one belt / pipe like a production line);
  // external supply and the nuclear plant's waste stay a small marker block
  const ex = g0.ex;
  if (g0.kind === 'source' && ex?.w && ex.l && Number.isFinite(ex.per)) {
    const clock = g0.rate / (g0.count * ex.per);
    g = { ...g0, bld: { n: ex.name, w: ex.w, l: ex.l, mw: ex.mw, c: ex.c ?? '#888' }, clocks: Array(g0.count).fill(clock), inputs: [] };
  } else if (g.kind === 'source') {
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
    // exit on the left / middle / right, or one belt per consumer when split
    const split = s.outSplit && s.outSplit.length > 1 ? s.outSplit : null;
    const outSide = s.outSide ?? 'center';
    const outLanes: Lane[] = split
      ? split.map((c, i) => ({
          item: g.id, pu: (16 * (i + 1)) / (split.length + 1), fluid: isFluid(g.id),
          belts: lanesFor(c.rate, g.id, s), to: c.key,
        }))
      : [{ item: g.id, pu: outSide === 'left' ? 3 : outSide === 'right' ? 13 : 8, fluid: isFluid(g.id), belts: lanesFor(g.rate, g.id, s) }];
    return { U: 16, V: 8, src: true, machines: [], inLanes: [], parts, counts, rows: 0, outLanes, outSide, split: !!split };
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
  const limitsRow = (f: { item: ItemId }) => s.capRows || (balanced && !isFluid(f.item) && g.inputs.includes(f as never));
  if (s.capRows || balanced)
    for (const f of [...g.inputs, ...g.outputs].filter(limitsRow)) {
      const pm = perMachine(f.rate);
      // a balancer row can take two belts: one balancer for the left half and one for the right half
      const belts = balanced && !s.capRows ? 2 : 1;
      if (pm > 1e-9) perRowCap = Math.min(perRowCap, Math.max(1, belts * Math.floor(capOf(f.item) / pm + 1e-9)));
    }
  let pr = Math.max(1, Math.min(userPerRow, perRowCap, n));
  const nRows = Math.ceil(n / pr);
  pr = Math.ceil(n / nRows);
  /** Parallel belts needed for a flow over `cnt` machines. */
  const beltsFor = (f: { item: ItemId; rate: number }, cnt: number) =>
    Math.max(1, Math.ceil((perMachine(f.rate) * cnt) / capOf(f.item) - 1e-6));

  // where the belts enter / leave: left, middle or right (a balancer is always fed from the side)
  // a balancer is fed from straight above the middle of its row (otherwise the belts cross);
  // with several rows its trunk runs on the left or right
  const fluidMode = s.fluidDist ?? 'manifold';
  const fluidTree = fluidMode === 'tree' && pr > 1;
  const inSideOf = (k: number): Side => {
    const sd = s.inSides?.[g.inputs[k].item] ?? s.inSide ?? 'left';
    if (balanced && pr > 1 && !isFluid(g.inputs[k].item)) return nRows === 1 ? 'center' : sd === 'center' ? 'left' : sd;
    if (fluidTree && isFluid(g.inputs[k].item) && nRows === 1) return 'center';
    return sd;
  };
  const outSide: Side = s.outSide ?? 'right';
  const hL = Math.ceil(pr / 2);
  /** Machines fed by one belt group: the half when fed from the middle, else the whole row. */
  const groupCnt = (side: Side) => (side === 'center' && pr > 1 ? hL : pr);
  const inBeltsK = (k: number) => beltsFor(g.inputs[k], groupCnt(inSideOf(k)));
  const outBelts = (f: { item: ItemId; rate: number }) => beltsFor(f, groupCnt(outSide));
  // one row with one belt per flow: the belts enter right above the machines and leave right under
  // them, so the block needs no side strips (only the machines' own foundations)
  const needsTrunk = nRows > 1 || g.inputs.some((_, k) => inBeltsK(k) > 1) || g.outputs.some((f) => outBelts(f) > 1);
  // split output: one belt per consumer (one row only); machines divided by the consumers' demand
  // (only when every consumer's share fits on one belt; otherwise the normal merged output is used)
  const split =
    s.outSplit &&
    s.outSplit.length > 1 &&
    nRows === 1 &&
    pr >= s.outSplit.length &&
    g.outputs.length > 0 &&
    allocate(pr, s.outSplit.map((x) => x.rate)).every((c) => (g.outputs[0].rate * c) / pr <= capOf(g.outputs[0].item) + 1e-6)
      ? s.outSplit
      : null;
  const splitCnt = split ? allocate(pr, split.map((x) => x.rate)) : [];

  const powered = g.kind === 'machine' || g.kind === 'generator' || g.kind === 'sink' || (g.kind === 'source' && (g.ex?.mw ?? 0) > 0);
  // two belts into one balancer row: each half gets its own (smaller) balancer tree
  // tree depth per balanced input: an input with two belts gets a balancer per half (smaller tree)
  const balLevelsOf = (f: { item: ItemId; rate: number }) =>
    balancerCount(beltsFor(f, pr) > 1 ? Math.ceil(pr / 2) : pr).levels;
  const LANE_STEP = 3; // distance between parallel belts / pipes in one band
  const treeLevels = Math.ceil(Math.log2(Math.max(2, pr)));
  const inBand = g.inputs.map((f, k) =>
    isFluid(f.item)
      ? fluidTree && nRows === 1
        ? treeLevels * LEVEL_F + 1
        : BAND_FLUID + (inBeltsK(k) - 1) * LANE_STEP + (fluidMode === 'loopback' ? LOOP_F : 0)
      : balanced
        ? Math.max(1, balLevelsOf(f)) * LEVEL + 1
        : BAND_SOLID + (inBeltsK(k) - 1) * LANE_STEP,
  );
  const outBand = g.outputs.map(
    (f, j) => (isFluid(f.item) ? BAND_FLUID : BAND_SOLID) + (split && j === 0 ? LANE_STEP : (outBelts(f) - 1) * LANE_STEP),
  );
  const sumIn = inBand.reduce((a, x) => a + x, 0);
  const sumOut = outBand.reduce((a, x) => a + x, 0);

  const nIn = g.inputs.length;
  const nOut = g.outputs.length;
  const align = s.align !== false;
  const extra = Math.max(0, o.spacing ?? 0);
  // with alignment every machine gets whole foundations and sits in the middle of them
  // centred on whole foundations only when that adds no more room than the chosen gap between machines
  // (a 10 m building would otherwise take 16 m); otherwise the machines sit `gap` apart
  const cells = Math.ceil(b.w / 8 - 1e-9) * 8;
  const onCells = align && cells - b.w <= s.gap + 1e-9;
  const cellW = onCells ? cells : b.w;
  const pitch = onCells ? cellW + extra * 8 : b.w + s.gap + extra * (align ? 8 : 1);
  const mOffU = (cellW - b.w) / 2;
  // several rows fed from the middle: a corridor of one foundation in the middle carries the trunk
  const anyCenter = g.inputs.some((_, k) => inSideOf(k) === 'center') || outSide === 'center';
  const corridor = nRows > 1 && pr > 1 && anyCenter ? (align ? 8 : 4) : 0;
  const innerU = (pr - 1) * pitch + cellW + corridor;
  // side strips for trunk belts; the same on both sides so the width does not depend on the chosen sides
  // trunk lanes in the side strip: each lane takes room for its parallel belts (drawn 1.6 m apart)
  const laneWidth = (f: { item: ItemId; rate: number }) => LANE_SIDE + (lanesFor(f.rate, f.item, s) - 1) * PAR_STEP;
  const sideOff = (fs: { item: ItemId; rate: number }[]) => {
    const offs: number[] = [];
    let acc = 0;
    for (const f of fs) {
      offs.push(acc + (laneWidth(f) - LANE_SIDE) / 2);
      acc += laneWidth(f);
    }
    return { offs, total: acc };
  };
  const sideIn = sideOff(g.inputs);
  const sideOut = sideOff(g.outputs);
  const strip = needsTrunk ? 2 + Math.max(sideIn.total, sideOut.total) : 0;
  const u0 = align ? Math.ceil(strip / 8 - 1e-9) * 8 : strip;
  const U = snapUp(u0 + innerU + strip);
  const uEnd = u0 + innerU;
  /** Left edge of machine slot i (slots right of the middle shift by the corridor). */
  const slotU = (i: number) => u0 + i * pitch + (corridor && i >= hL ? corridor : 0);
  const slotC = (i: number) => slotU(i) + mOffU + b.w / 2;
  // odd number of machines in one row: the middle point is the middle machine itself, so one 3-way
  // splitter / merger there serves the left half, the right half and that machine
  const midMachine = !corridor && pr > 1 && pr % 2 === 1;
  const uMid = pr <= 1 ? slotC(0) : midMachine ? slotC((pr - 1) / 2) : (slotC(hL - 1) + slotC(hL)) / 2;
  const sIn = Math.min(1.6, (b.w - 1) / Math.max(1, nIn));
  const sOut = Math.min(1.6, (b.w - 1) / Math.max(1, nOut));
  // input belts sit side by side over a machine; order them by their chosen side (left … right)
  const sideRank: Record<Side, number> = { left: 0, center: 1, right: 2 };
  const inOrder = g.inputs.map((_, k) => k).sort((a, b) => sideRank[inSideOf(a)] - sideRank[inSideOf(b)] || a - b);
  const inSlot = g.inputs.map((_, k) => inOrder.indexOf(k));
  // a single machine without trunk: the side decides where over the machine the belt enters
  // (left / middle / right part); several belts on the same side stay next to each other
  const single = nRows === 1 && pr === 1 && !needsTrunk;
  const inOff = (k: number) => {
    if (!single) return (inSlot[k] - (nIn - 1) / 2) * sIn;
    const sd = inSideOf(k);
    const same = inOrder.filter((j) => inSideOf(j) === sd);
    const base = sd === 'left' ? -b.w / 4 : sd === 'right' ? b.w / 4 : 0;
    return base + (same.indexOf(k) - (same.length - 1) / 2) * sIn;
  };
  const outOff = (j: number) => (j - (nOut - 1) / 2) * sOut;
  /** Position of the trunk / entry belt for a side. */
  const portU = (side: Side, k: number, off: number, isIn: boolean) =>
    side === 'center'
      ? uMid + off
      : needsTrunk
        ? side === 'left'
          ? u0 - 2 - (isIn ? sideIn : sideOut).offs[k]
          : uEnd + 2 + (isIn ? sideIn : sideOut).offs[k]
        : (side === 'left' ? slotC(0) : slotC(pr - 1)) + off + (isIn ? 0 : 0);

  const inLanes: Lane[] = g.inputs.map((f, k) => ({
    item: f.item, pu: portU(inSideOf(k), k, inOff(k), true), fluid: isFluid(f.item), belts: lanesFor(f.rate, f.item, s),
  }));
  /** Lane indices per output (a split main output has one lane per consumer). */
  const laneOf: number[][] = [];
  const outLanes: Lane[] = [];
  g.outputs.forEach((f, j) => {
    if (split && j === 0) {
      let start = 0;
      laneOf.push(
        split.map((c, ri) => {
          const last = start + splitCnt[ri] - 1;
          start += splitCnt[ri];
          outLanes.push({ item: f.item, pu: slotC(last) + outOff(0), fluid: isFluid(f.item), belts: 1, to: c.key });
          return outLanes.length - 1;
        }),
      );
    } else {
      outLanes.push({ item: f.item, pu: portU(outSide, j, outOff(j), false), fluid: isFluid(f.item), belts: lanesFor(f.rate, f.item, s) });
      laneOf.push([outLanes.length - 1]);
    }
  });

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
  /** Machine positions grouped per belt group, each ordered from the port outwards. */
  const groupsFrom = (side: Side, xs: number[]): number[][] => {
    if (side === 'center' && xs.length > 1) {
      if (midMachine && xs.length === pr) {
        const mid = (pr - 1) / 2;
        return [xs.slice(0, mid).reverse(), xs.slice(mid + 1), [xs[mid]]].filter((h) => h.length);
      }
      return [xs.slice(0, Math.min(hL, xs.length)).reverse(), xs.slice(hL)].filter((h) => h.length);
    }
    return [side === 'right' ? [...xs].reverse() : xs];
  };

  /** Per trunk: v → number of belts that branch off there. */
  const tapsIn: Map<number, number>[] = g.inputs.map(() => new Map());
  const tapsOut: Map<number, number>[] = outLanes.map(() => new Map());
  // taps are collected per row first: a flipped row moves them along with its parts
  let rowTaps: { m: Map<number, number>; v: number }[] = [];
  const tap = (m: Map<number, number>, v: number) => rowTaps.push({ m, v });
  const commitTaps = (flip: (v: number) => number) => {
    for (const { m, v } of rowTaps) {
      const fv = Math.round(flip(v) * 1000) / 1000;
      m.set(fv, (m.get(fv) ?? 0) + 1);
    }
    rowTaps = [];
  };
  const facing = !!o.facing && nRows > 1;
  const rowGap = 3;
  const rowH = sumIn + 0.5 + b.l + 0.5 + sumOut;
  const gaps = facing ? Math.ceil(nRows / 2) - 1 : nRows - 1;
  const content = nRows * rowH + gaps * rowGap;
  const V = snapUp(content);
  let top = (V - content) / 2;
  for (let r = 0; r < nRows; r++) {
    const partStart = parts.length;
    const machineStart = machines.length;
    const rowTop = top;
    const cnt = Math.min(pr, n - r * pr);
    const mV = top + sumIn + 0.5;
    const centers: number[] = [];
    for (let i = 0; i < cnt; i++) {
      const m: Machine = { u: slotU(i) + mOffU, v: mV, w: b.w, l: b.l, clock: g.clocks[r * pr + i] ?? 1 };
      machines.push(m);
      centers.push(m.u + m.w / 2);
    }
    // power poles: each pole uses one connection to the previous and one to the next pole
    if (powered && s.daisy) {
      // one pole per row feeds the first machine, each machine passes the power on to the next
      const pv = mV - 0.5;
      parts.push({ t: 'pole', u: centers[0], v: pv, used: 1 });
      parts.push({ t: 'wire', a: [centers[0], pv], b: [centers[0], mV + Math.min(2, b.l / 4)] });
      for (let i = 1; i < cnt; i++)
        parts.push({ t: 'wire', a: [centers[i - 1], mV + Math.min(2, b.l / 4)], b: [centers[i], mV + Math.min(2, b.l / 4)] });
      counts.poles++;
    } else if (powered) {
      const per = POLE_CONNECTIONS[(s.pole ?? 2) - 1] - 2;
      for (let k = 0; k * per < cnt; k++) {
        const first = k * per;
        const last = Math.min(cnt, first + per) - 1;
        const pu = (centers[first] + centers[last]) / 2;
        const pv = mV - 0.5;
        parts.push({ t: 'pole', u: pu, v: pv, used: last - first + 1 });
        for (let i = first; i <= last; i++) parts.push({ t: 'wire', a: [pu, pv], b: [centers[i], mV + Math.min(2, b.l / 4)] });
        counts.poles++;
      }
    }
    // ---- inputs (bands directly above the machines): splitters along each belt, from the port outwards
    let bandTop = top;
    g.inputs.forEach((f, k) => {
      const lane = inLanes[k];
      const w = lane.fluid ? 0.6 : 0.55;
      const xs = centers.map((c) => c + inOff(k));
      if (balanced && !lane.fluid && cnt > 1) {
        const rootV = bandTop + LEVEL / 2;
        tap(tapsIn[k], rootV);
        if (beltsFor(f, cnt) > 1) {
          // two belts arrive in the middle: one goes left, one goes right, each into its own balancer
          const h = Math.ceil(cnt / 2);
          for (const half of [xs.slice(0, h), xs.slice(h)]) {
            if (half.length > 1) drawBalancer(balancerTree(half.length), half, rootV, mV, uEnd + 0.8 + k * 0.6, lane, belt, node, parts);
            else if (half.length === 1) belt([[lane.pu, rootV], [half[0], rootV], [half[0], mV]], f.item, 0.4);
          }
        } else drawBalancer(balancerTree(cnt), xs, rootV, mV, uEnd + 0.8 + k * 0.6, lane, belt, node, parts);
      } else if (lane.fluid && fluidTree && nRows === 1 && cnt > 1) {
        // symmetric pipe tree: every machine has an equally long way from the entry
        const rootV = bandTop + LEVEL_F / 2;
        tap(tapsIn[k], rootV);
        drawBalancer(pipeTree(cnt), xs, rootV, mV, uEnd, lane, belt, node, parts, LEVEL_F);
      } else {
        for (const grp of groupsFrom(inSideOf(k), xs))
          chunks(grp, beltsFor(f, grp.length)).forEach((cx, j) => {
            const loop = lane.fluid && fluidMode === 'loopback' && cx.length > 1;
            const v = bandTop + (loop ? LOOP_F : 0) + (lane.fluid ? BAND_FLUID : BAND_SOLID) / 2 + j * LANE_STEP;
            tap(tapsIn[k], v);
            belt([[lane.pu, v], [cx[cx.length - 1], v]], f.item, w);
            if (loop) {
              // loopback (wiki): a second pipe from the entry joins the far end of the manifold, against sloshing
              const far = cx[cx.length - 1];
              const lv = v - LOOP_F;
              belt([[lane.pu, v], [lane.pu, lv], [far, lv], [far, v]], f.item, 0.4);
              node('merge', far, v, f.item);
            }
            cx.forEach((x, i) => {
              if (i < cx.length - 1) node('split', x, v, f.item);
              belt([[x, v], [x, mV]], f.item, 0.32);
            });
          });
      }
      bandTop += inBand[k];
    });
    // ---- outputs (merger manifold towards the port)
    let ob = mV + b.l + 0.5;
    g.outputs.forEach((f, j) => {
      const lane = outLanes[laneOf[j][0]];
      const w = lane.fluid ? 0.6 : 0.55;
      const xs = centers.map((c) => c + outOff(j));
      if (split && j === 0) {
        // one merger line per consumer; what one line has too much goes to another via splitter -> merger
        const v = ob + (lane.fluid ? BAND_FLUID : BAND_SOLID) / 2;
        const vT = v + LANE_STEP;
        let start = 0;
        const surplus = split.map((c, ri) => {
          const cx = xs.slice(start, start + splitCnt[ri]);
          start += splitCnt[ri];
          tap(tapsOut[laneOf[0][ri]], v);
          cx.forEach((x, i) => {
            belt([[x, mV + b.l], [x, v]], f.item, 0.32);
            if (i < cx.length - 1) node('merge', x, v, f.item);
          });
          if (cx.length > 1) belt([[cx[0], v], [cx[cx.length - 1], v]], f.item, w);
          return (f.rate * splitCnt[ri]) / pr - c.rate;
        });
        const give = surplus.map((x, i) => ({ i, x })).filter((e) => e.x > 1e-6);
        const need = surplus.map((x, i) => ({ i, x: -x })).filter((e) => e.x > 1e-6);
        for (const gv of give)
          for (const nd of need) {
            const amt = Math.min(gv.x, nd.x);
            if (amt <= 1e-6) continue;
            gv.x -= amt;
            nd.x -= amt;
            const a = outLanes[laneOf[0][gv.i]].pu;
            const c = outLanes[laneOf[0][nd.i]].pu;
            node('split', a, vT, f.item);
            node('merge', c, vT, f.item);
            belt([[a, vT], [c, vT]], f.item, 0.4);
          }
        ob += outBand[j];
        return;
      }
      for (const grp of groupsFrom(outSide, xs))
        chunks(grp, beltsFor(f, grp.length)).forEach((cx, q) => {
          const v = ob + (lane.fluid ? BAND_FLUID : BAND_SOLID) / 2 + q * LANE_STEP;
          tap(tapsOut[laneOf[j][0]], v);
          cx.forEach((x, i) => {
            belt([[x, mV + b.l], [x, v]], f.item, 0.32);
            if (i < cx.length - 1) node('merge', x, v, f.item);
          });
          belt([[cx[cx.length - 1], v], [lane.pu, v]], f.item, w);
        });
      ob += outBand[j];
    });
    // rows facing each other: flip the upper row of each pair, so its inputs sit at the bottom next to
    // the inputs of the row below (all feeding runs through the middle, outputs on the outside)
    if (facing && r % 2 === 0 && r + 1 < nRows) {
      const fl = (v: number) => rowTop + ob - v;
      for (let i = partStart; i < parts.length; i++) {
        const p = parts[i];
        if (p.t === 'belt' || p.t === 'loop') p.pts = p.pts.map(([u, v]) => [u, fl(v)] as Pt);
        else if (p.t === 'wire') (p.a = [p.a[0], fl(p.a[1])]), (p.b = [p.b[0], fl(p.b[1])]);
        else p.v = fl(p.v);
      }
      for (let i = machineStart; i < machines.length; i++) machines[i].v = fl(machines[i].v + machines[i].l);
      commitTaps(fl);
    } else commitTaps((v) => v);
    // the two rows of a pair touch in the middle (their input bands meet)
    top = ob + (facing && r % 2 === 0 && r + 1 < nRows ? 0 : rowGap);
  }

  // ---- trunks: a splitter / merger wherever two or more belts meet on the trunk.
  // Several parallel belts / pipes on a trunk: each serves its own consecutive set of taps, so every
  // branch clearly starts at one belt and does not cross the others (the inner one ends first on
  // the way in, the outer one starts first on the way out).
  const trunk = (lane: Lane, taps: Map<number, number>, isIn: boolean) => {
    const vs = [...taps.keys()].sort((a, c) => a - c);
    if (!vs.length) return;
    const n = Math.max(1, Math.min(lane.belts, vs.length));
    const nodeAt = (u: number, v: number, i: number, list: number[]) => {
      if (taps.get(v)! + (isIn ? (i < list.length - 1 ? 1 : 0) : i > 0 ? 1 : 0) >= 2) node(isIn ? 'split' : 'merge', u, v, lane.item);
    };
    if (lane.fluid && lane.belts > 1 && vs.length < lane.belts) {
      // fewer taps than belts: every belt runs to every tap, joined there by a cross pipe / belt with a
      // junction on each belt, so it is clear that all of them connect
      const m = lane.belts;
      const us = Array.from({ length: m }, (_, i) => lane.pu + (i - (m - 1) / 2) * PAR_STEP);
      for (const u of us) parts.push({ t: 'belt', pts: isIn ? [[u, 0], [u, vs[vs.length - 1]]] : [[u, vs[0]], [u, V]], item: lane.item, w: 0.55 });
      for (const v of vs) {
        parts.push({ t: 'belt', pts: [[us[0], v], [us[m - 1], v]], item: lane.item, w: 0.45 });
        for (const u of us) node(isIn ? 'split' : 'merge', u, v, lane.item);
      }
      return;
    }
    if (n === 1) {
      parts.push({ t: 'belt', pts: isIn ? [[lane.pu, 0], [lane.pu, vs[vs.length - 1]]] : [[lane.pu, vs[0]], [lane.pu, V]], item: lane.item, w: 0.55, n: lane.belts });
      vs.forEach((v, i) => nodeAt(lane.pu, v, i, vs));
      return;
    }
    // machines lie on the side of the block centre; "inner" = the belt closest to them
    const inward = lane.pu < U / 2 ? 1 : -1;
    const offs = Array.from({ length: n }, (_, i) => (i - (n - 1) / 2) * PAR_STEP);
    // order of the belts from inner to outer
    const order = [...offs].sort((a, c) => (c - a) * inward);
    const grp = chunks(vs, n);
    grp.forEach((list, gi) => {
      // way in: the first taps go to the inner belt; way out: the first taps to the outer belt
      const d = isIn ? order[gi] : order[n - 1 - gi];
      const u = lane.pu + d;
      parts.push({ t: 'belt', pts: isIn ? [[u, 0], [u, list[list.length - 1]]] : [[u, list[0]], [u, V]], item: lane.item, w: 0.55 });
      // move the branches of these taps onto this belt
      for (const p of parts) {
        if (p.t !== 'belt' || p.item !== lane.item || p.n) continue;
        const ends = [p.pts[0], p.pts[p.pts.length - 1]];
        if (!ends.some(([pu, pv]) => Math.abs(pu - lane.pu) < 1e-6 && list.some((v) => Math.abs(v - pv) < 1e-3))) continue;
        p.pts = p.pts.map(([pu, pv]) => (Math.abs(pu - lane.pu) < 1e-6 ? [u, pv] : [pu, pv]) as Pt);
      }
      list.forEach((v, i) => nodeAt(u, v, i, list));
    });
  };
  inLanes.forEach((lane, k) => trunk(lane, tapsIn[k], true));
  outLanes.forEach((lane, j) => trunk(lane, tapsOut[j], false));
  // a balanced split over several rows needs a small balancer instead of a manifold on the trunk
  if (balanced && nRows > 1) {
    const solidIn = inLanes.filter((l) => !l.fluid).length;
    counts.splitters += solidIn * (balancerCount(nRows).splitters - (nRows - 1));
    counts.mergers += solidIn * balancerCount(nRows).mergers;
  }

  if (counts.poles) counts.wires = machines.length + counts.poles - 1;
  chainPoles(parts);
  const inSides: Record<ItemId, Side> = {};
  g.inputs.forEach((f, k) => (inSides[f.item] = inSideOf(k)));
  return { U, V, src: false, bld: b, machines, inLanes, outLanes, parts, counts, rows: nRows, inSides, outSide, split: !!split, facing };
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
  LEVEL = 5,
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

/** Divide `n` machines over consumers by demand (largest remainder, at least one each). */
export function allocate(n: number, rates: number[]): number[] {
  const tot = rates.reduce((a, b) => a + b, 0) || 1;
  const raw = rates.map((r) => (r / tot) * n);
  const out = raw.map((x) => Math.max(1, Math.floor(x)));
  while (out.reduce((a, b) => a + b, 0) > n) out[out.indexOf(Math.max(...out))]--;
  while (out.reduce((a, b) => a + b, 0) < n) {
    let best = 0;
    for (let i = 1; i < out.length; i++) if (raw[i] - out[i] > raw[best] - out[best]) best = i;
    out[best]++;
  }
  return out;
}

/** Symmetric binary tree of T-junctions for `n` machines (pipes need no loopback). */
export function pipeTree(n: number): BNode {
  if (n <= 1) return { t: 'leaf' };
  return { t: 'split', children: [pipeTree(Math.ceil(n / 2)), pipeTree(Math.floor(n / 2))] };
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
  /** Exit point for an item (to a given consumer when the output is split). */
  outFor: (item: ItemId, to?: string) => Pt;
  ins: Pt[];
}

/** Place local geometry in the world (position + optional 90° rotation). */
export function worldGeom(L: LocalGeom, p: GroupPos): WorldGeom {
  const rot = !!p.rot;
  const T = (u: number, v: number): Pt => (rot ? [p.x + v, p.y + u] : [p.x + u, p.y + v]);
  const outIdx: Record<ItemId, number> = {};
  L.outLanes.forEach((l, j) => (outIdx[l.item] ??= j));
  const outs = L.outLanes.map((l) => T(l.pu, L.V));
  const outFor = (item: ItemId, to?: string): Pt => {
    const j = L.outLanes.findIndex((l) => l.item === item && l.to === to);
    return outs[j >= 0 ? j : outIdx[item]];
  };
  return {
    L, p, rot, T, x: p.x, y: p.y, f: p.f || 0,
    W: rot ? L.V : L.U,
    H: rot ? L.U : L.V,
    dir: rot ? [1, 0] : [0, 1],
    outs,
    outIdx,
    outFor,
    ins: L.inLanes.map((l) => T(l.pu, 0)),
  };
}
