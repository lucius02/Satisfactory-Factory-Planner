/**
 * Automatic layout.
 * - flow: one band per production depth (raw resources on top, sinks/storage at the bottom),
 *   wrapped when wider than the floor.
 * - compact: all groups in production order, packed in shelves into a near-square area.
 * Groups are sorted by barycentre to limit crossing belts, spread over floors (optionally with a
 * maximum floor size) and never placed on top of groups the user moved by hand (`manual: true`).
 */
import { suppliers, type Group, type Model } from '../calc/model';
import type { GroupPos, LayoutMode } from '../state/types';
import type { LocalGeom } from './geometry';

export interface LayoutOpts {
  floors: number;
  mode: LayoutMode;
  /** Max. floor width / length in foundations (0 = unlimited). */
  floorW: number;
  floorL: number;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
  f: number;
}

const snap8 = (x: number) => Math.round(x / 8) * 8;
const overlaps = (a: Rect, b: Rect, gap: number) =>
  a.f === b.f && a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap;

/** Returns false when the factory does not fit within the floors / floor size. */
export function autoLayout(
  model: Model,
  pos: Record<string, GroupPos>,
  o: LayoutOpts,
  geom: (g: Group) => LocalGeom,
  force = false,
): boolean {
  const gs = model.groups;
  const keys = new Set(gs.map((g) => g.key));
  const F = Math.max(1, o.floors);
  for (const k in pos) {
    const p = pos[k];
    if (force || (!keys.has(k) && !p.manual)) delete pos[k];
    else if ((p.f || 0) >= F) p.f = F - 1;
  }
  const auto = gs.filter((g) => !pos[g.key]?.manual);
  if (!auto.length) return true;
  const compact = o.mode === 'compact';
  const H_GAP = compact ? 8 : 16;
  const V_GAP = compact ? 8 : 16;

  const dims = new Map<Group, [number, number]>();
  for (const g of auto) {
    const L = geom(g);
    dims.set(g, [L.U, L.V]);
  }
  // groups placed by hand are obstacles
  const fixed: Rect[] = gs
    .filter((g) => pos[g.key]?.manual)
    .map((g) => {
      const p = pos[g.key];
      const L = geom(g);
      return { x: p.x, y: p.y, w: p.rot ? L.V : L.U, h: p.rot ? L.U : L.V, f: p.f || 0 };
    });

  // ---- order: by production depth, then barycentre of suppliers / consumers
  const maxDepth = Math.max(0, ...gs.filter((g) => g.kind === 'machine').map((g) => model.depth(g.id)));
  const tierOf = (g: Group) =>
    g.kind === 'source' ? 0 : g.kind === 'machine' ? model.depth(g.id) : g.kind === 'generator' ? maxDepth + 1 : maxDepth + 2;
  const tiers: Record<number, Group[]> = {};
  for (const g of auto) (tiers[tierOf(g)] ??= []).push(g);
  const order = Object.keys(tiers).map(Number).sort((a, b) => a - b);
  const consumers: Record<string, Group[]> = {};
  for (const g of gs) for (const i of g.inputs) (consumers[i.item] ??= []).push(g);
  const cx: Record<string, number> = {};
  const bary = (arr: Group[], fb: number) => {
    const xs = arr.map((g) => cx[g.key]).filter((v) => v != null);
    return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : fb;
  };
  for (let pass = 0; pass < 3; pass++) {
    for (const tt of order) {
      const row = tiers[tt];
      if (pass > 0) {
        const key = new Map(
          row.map((g, i) => [
            g,
            g.kind === 'source'
              ? bary(consumers[g.id] ?? [], i * 1e3)
              : bary(g.inputs.flatMap((inp) => suppliers(model, inp.item).map((s) => s.g)), i * 1e3),
          ]),
        );
        row.sort((a, b) => key.get(a)! - key.get(b)!);
      }
      const total = row.reduce((s, g) => s + dims.get(g)![0], 0) + H_GAP * (row.length - 1);
      let x = -total / 2;
      for (const g of row) {
        cx[g.key] = x + dims.get(g)![0] / 2;
        x += dims.get(g)![0] + H_GAP;
      }
    }
  }

  // ---- wrap into lines
  const totalArea = auto.reduce((s, g) => s + (dims.get(g)![0] + H_GAP) * (dims.get(g)![1] + V_GAP), 0);
  const widest = Math.max(...auto.map((g) => dims.get(g)![0]));
  const maxW =
    o.floorW > 0 ? o.floorW * 8 : compact ? Math.max(widest, snap8(Math.sqrt(totalArea / F) * 1.15)) : Infinity;
  const sequences = compact ? [order.flatMap((tt) => tiers[tt])] : order.map((tt) => tiers[tt]);
  const lines: Group[][] = [];
  for (const seq of sequences) {
    let line: Group[] = [];
    let w = 0;
    for (const g of seq) {
      const gw = dims.get(g)![0];
      if (line.length && w + H_GAP + gw > maxW) {
        lines.push(line);
        line = [];
        w = 0;
      }
      w += (line.length ? H_GAP : 0) + gw;
      line.push(g);
    }
    if (line.length) lines.push(line);
  }
  const lineW = (l: Group[]) => l.reduce((s, g) => s + dims.get(g)![0], 0) + H_GAP * (l.length - 1);
  const lineH = (l: Group[]) => Math.max(...l.map((g) => dims.get(g)![1]));
  const refW = Number.isFinite(maxW) ? maxW : Math.max(...lines.map(lineW));
  let fits = !(o.floorW > 0 && widest > o.floorW * 8);

  // ---- distribute lines over floors
  const maxL = o.floorL > 0 ? o.floorL * 8 : Infinity;
  const totalH = lines.reduce((s, l) => s + lineH(l) + V_GAP, 0);
  const target = totalH / F;
  const yF = Array(F).fill(0);
  let f = 0;
  let cum = 0;
  for (const l of lines) {
    const h = lineH(l);
    if (Number.isFinite(maxL)) {
      if (yF[f] > 0 && yF[f] + h > maxL && f < F - 1) f++;
      if (yF[f] + h > maxL) fits = false;
    } else f = Math.min(F - 1, Math.floor((cum + h / 2) / target));
    cum += h + V_GAP;
    let x = snap8((refW - lineW(l)) / 2);
    for (const g of l) {
      const [w, gh] = dims.get(g)!;
      const r: Rect = { x, y: yF[f], w, h: gh, f };
      // step past groups that were placed by hand
      for (let guard = 0; guard < 50; guard++) {
        const hit = fixed.find((b) => overlaps(r, b, H_GAP / 2));
        if (!hit) break;
        r.x = Math.ceil((hit.x + hit.w + H_GAP) / 8) * 8;
      }
      pos[g.key] = { x: r.x, y: r.y, rot: 0, f };
      x = r.x + w + H_GAP;
    }
    yF[f] += h + V_GAP;
  }

  // inputs on the side of the suppliers: mirror a group when its suppliers lie to the right
  const center = (g: Group) => {
    const p = pos[g.key];
    const L = geom(g);
    return p.x + (p.rot ? L.V : L.U) / 2;
  };
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  for (const g of auto) {
    const c = center(g);
    const sup = avg(g.inputs.flatMap((i) => suppliers(model, i.item).map((s) => center(s.g))));
    const con = avg(g.outputs.flatMap((o) => (consumers[o.item] ?? []).map(center)));
    const mirror = sup != null ? sup > c + 4 : con != null ? con < c - 4 : false;
    pos[g.key].mirror = mirror ? 1 : 0;
  }
  return fits;
}
