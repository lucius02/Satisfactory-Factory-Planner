/**
 * Automatic layout: groups in rows by production depth (raw resources on top, sinks/storage at the
 * bottom), sorted by barycentre to limit crossing belts, rows spread over the floors.
 * Groups with `manual: true` (dragged / rotated) are left alone.
 */
import { suppliers, type Group, type Model } from '../calc/model';
import type { GroupPos } from '../state/types';
import type { LocalGeom } from './geometry';

const H_GAP = 16;
const V_GAP = 24;

export function autoLayout(
  model: Model,
  pos: Record<string, GroupPos>,
  floors: number,
  geom: (g: Group) => LocalGeom,
  force = false,
): void {
  const gs = model.groups;
  const keys = new Set(gs.map((g) => g.key));
  const F = Math.max(1, floors);
  for (const k in pos) {
    const p = pos[k];
    if (force || (!keys.has(k) && !p.manual)) delete pos[k];
    else if ((p.f || 0) >= F) p.f = F - 1;
  }
  const auto = gs.filter((g) => !pos[g.key]?.manual);
  if (!auto.length) return;

  const maxDepth = Math.max(0, ...gs.filter((g) => g.kind === 'machine').map((g) => model.depth(g.id)));
  const tierOf = (g: Group) =>
    g.kind === 'source' ? 0 : g.kind === 'machine' ? model.depth(g.id) : maxDepth + 1;
  const tiers: Record<number, Group[]> = {};
  for (const g of auto) (tiers[tierOf(g)] ??= []).push(g);
  const order = Object.keys(tiers).map(Number).sort((a, b) => a - b);

  const cx: Record<string, number> = {};
  const consumers: Record<string, Group[]> = {};
  for (const g of gs) for (const i of g.inputs) (consumers[i.item] ??= []).push(g);
  const orderIdx = new Map<Group, number>();
  const bary = (arr: Group[], fb: number) => {
    const xs = arr.map((g) => cx[g.key]).filter((v) => v != null);
    return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : fb;
  };
  const keyFn = (g: Group) => {
    const fb = (orderIdx.get(g) ?? 0) * 1e3;
    if (g.kind === 'source') return bary(consumers[g.id] ?? [], fb);
    return bary(g.inputs.flatMap((i) => suppliers(model, i.item).map((s) => s.g)), fb);
  };
  const dims = new Map<Group, [number, number]>();
  for (const g of auto) {
    const L = geom(g);
    dims.set(g, [L.U, L.V]);
  }

  const place = (sortFn: ((g: Group) => number) | null) => {
    const rowsInfo: { row: Group[]; xs: number[]; h: number }[] = [];
    for (const tt of order) {
      const row = tiers[tt];
      row.forEach((g, i) => orderIdx.set(g, i));
      if (sortFn) {
        const keyed = new Map(row.map((g) => [g, sortFn(g)]));
        row.sort((a, b) => keyed.get(a)! - keyed.get(b)!);
      }
      const d = row.map((g) => dims.get(g)!);
      const total = d.reduce((s, x) => s + x[0], 0) + H_GAP * (row.length - 1);
      let x = Math.round(-total / 2 / 8) * 8;
      const xs: number[] = [];
      row.forEach((g, i) => {
        xs.push(x);
        cx[g.key] = x + d[i][0] / 2;
        x += d[i][0] + H_GAP;
      });
      rowsInfo.push({ row, xs, h: Math.max(...d.map((x) => x[1])) });
    }
    const totalH = rowsInfo.reduce((s, r) => s + r.h + V_GAP, 0);
    const target = totalH / F;
    let cum = 0;
    const yF = Array(F).fill(0);
    for (const ri of rowsInfo) {
      const f = Math.min(F - 1, Math.floor((cum + ri.h / 2) / target));
      cum += ri.h + V_GAP;
      ri.row.forEach((g, i) => (pos[g.key] = { x: ri.xs[i], y: yF[f], rot: 0, f }));
      yF[f] += ri.h + V_GAP;
    }
  };
  place(null);
  place(keyFn);
  place(keyFn);
}
