/**
 * "Max" targets: make as much as the available input allows. The available input is the external
 * supply; raw resources that are not in it are mined as usual. The factory is linear in its targets,
 * so two solves (without and with the max targets at their weights) give the largest scale that keeps
 * every external item within its supply.
 */
import type { ItemId } from '../data/types';
import type { Model } from './model';
import { compute, type PlanInput } from './solver';

export interface MaxResult {
  /** Input with the max targets replaced by their computed rates. */
  input: PlanInput;
  /** Computed rate per max target and the item that limits it (none = not limited by the external supply). */
  info: Record<ItemId, { rate: number; limit?: ItemId }> | null;
}

/** How much of `item` the external supply has to cover: what is mined or made of it otherwise. */
const need = (m: Model, item: ItemId) => (m.byKey['s:' + item]?.rate ?? 0) + (m.byKey['m:' + item]?.rate ?? 0);

export function resolveMax(p: PlanInput): MaxResult {
  const maxT = p.targets.filter((t) => t.max);
  if (!maxT.length) return { input: p, info: null };
  const fixed = p.targets.filter((t) => !t.max);
  const weights = maxT.map((t) => ({ item: t.item, rate: t.rate > 0 ? t.rate : 1 }));
  // exact rates only: no external supply, no rounding of machine counts, no surplus blocks
  const base: PlanInput = { ...p, external: [], surplus: 'output', clockMode: 'even', balSmooth: false };
  const m0 = compute({ ...base, targets: fixed });
  const m1 = compute({ ...base, targets: [...fixed, ...weights] });

  let scale = Infinity;
  let limit: ItemId | undefined;
  for (const e of p.external) {
    const d0 = need(m0, e.item);
    const d1 = need(m1, e.item) - d0;
    if (d1 <= 1e-9) continue;
    const s = (e.rate - d0) / d1;
    if (s < scale) {
      scale = s;
      limit = e.item;
    }
  }
  // nothing limits it: use the weights as rates
  if (!Number.isFinite(scale)) scale = 1;
  scale = Math.max(0, scale);

  const info: MaxResult['info'] = {};
  const targets = [...fixed];
  for (const w of weights) {
    const rate = w.rate * scale;
    info[w.item] = { rate, limit };
    targets.push({ item: w.item, rate });
  }
  return { input: { ...p, targets }, info };
}
