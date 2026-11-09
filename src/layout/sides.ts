/**
 * Automatic entry / exit side of each block: the input comes in on the side where its suppliers
 * lie (straight above = middle), the output leaves on the side of its consumers.
 */
import { suppliers, type Group, type Model } from '../calc/model';
import type { GroupPos } from '../state/types';
import type { LocalGeom, Side } from './geometry';

export interface Sides {
  in: Side;
  out: Side;
}

export function autoSides(model: Model, pos: Record<string, GroupPos>, local: Record<string, LocalGeom>): Record<string, Sides> {
  // position along the row of machines (x, or y for a rotated block)
  const span = (g: Group) => {
    const p = pos[g.key];
    const L = local[g.key];
    return p.rot ? { a: p.y, len: L.U } : { a: p.x, len: L.U };
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
    if (!pos[g.key] || g.kind === 'source') continue;
    const sup = avg(g.inputs.flatMap((i) => suppliers(model, i.item).map((s) => centerOf(s.g))));
    const con = avg(g.outputs.flatMap((o) => (consumers[o.item] ?? []).map(centerOf)));
    out[g.key] = { in: sideOf(g, sup, 'left'), out: sideOf(g, con, 'right') };
  }
  return out;
}
