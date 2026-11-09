/**
 * Automatic entry / exit sides of each block: every input item comes in on the side where its own
 * suppliers lie (straight above = middle), the output leaves on the side of its consumers.
 */
import { suppliers, type Group, type Model } from '../calc/model';
import type { ItemId } from '../data/types';
import type { GroupPos } from '../state/types';
import type { LocalGeom, Side } from './geometry';

export interface Sides {
  in: Record<ItemId, Side>;
  out: Side;
}

export function autoSides(model: Model, pos: Record<string, GroupPos>, local: Record<string, LocalGeom>): Record<string, Sides> {
  // position along the row of machines (x, or y for a rotated block)
  const span = (g: Group) => {
    const p = pos[g.key];
    return { a: p.rot ? p.y : p.x, len: local[g.key].U };
  };
  const centerOf = (g: Group) => {
    const s = span(g);
    return s.a + s.len / 2;
  };
  const consumers: Record<string, Group[]> = {};
  for (const g of model.groups) for (const i of g.inputs) (consumers[i.item] ??= []).push(g);
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const sideOf = (g: Group, x: number | null, fallback: Side): Side => {
    if (x == null) return fallback;
    const { a, len } = span(g);
    if (x < a + len * 0.3) return 'left';
    if (x > a + len * 0.7) return 'right';
    return 'center';
  };
  const out: Record<string, Sides> = {};
  for (const g of model.groups) {
    if (!pos[g.key]) continue;
    const ins: Record<ItemId, Side> = {};
    for (const i of g.inputs) ins[i.item] = sideOf(g, avg(suppliers(model, i.item).map((s) => centerOf(s.g))), 'left');
    const con = avg(g.outputs.flatMap((o) => (consumers[o.item] ?? []).map(centerOf)));
    out[g.key] = { in: ins, out: sideOf(g, con, 'right') };
  }
  return out;
}

/** Consumers of a group's main output with the amount each one takes (for a split output). */
export function consumersOf(model: Model, g: Group): { key: string; rate: number }[] {
  const main = g.outputs[0]?.item;
  if (!main) return [];
  const out: { key: string; rate: number }[] = [];
  const share = suppliers(model, main).find((s) => s.g === g)?.share ?? 0;
  for (const u of model.groups)
    for (const i of u.inputs) if (i.item === main && share > 0) out.push({ key: u.key, rate: i.rate * share });
  const target = g.kind === 'machine' ? model.targets[main] : 0;
  if (target) out.push({ key: '*target', rate: target * share });
  return out;
}
