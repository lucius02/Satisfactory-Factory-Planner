/**
 * Automatic recipe choice: from the recipes the player has unlocked, pick per product the recipe
 * that makes the whole factory cheapest (coordinate descent over the products in the chain).
 * Manual choices (`rc`) are kept fixed.
 */
import { ITEMS } from '../data/items';
import { RECIPES } from '../data/recipes';
import type { ItemId, Recipe } from '../data/types';
import type { OptimizeGoal } from '../state/types';
import type { Model } from './model';
import { compute, type PlanInput } from './solver';

/** Standard recipes are always available; alternates only when unlocked. */
export const isAvailable = (r: Recipe, unlocked: Record<string, boolean>): boolean => !r.alt || !!unlocked[r.name];

/** Raw resources that are practically free / unlimited weigh less. */
const RAW_WEIGHT: Record<ItemId, number> = { water: 0, 'uranium-waste': 0 };

export function planCost(m: Model, goal: OptimizeGoal): number {
  if (!m.converged) return Infinity;
  let raw = 0;
  let power = 0;
  let machines = 0;
  for (const g of m.groups) {
    power += g.power;
    if (g.kind === 'source') raw += g.rate * (RAW_WEIGHT[g.id] ?? (ITEMS[g.id]?.raw ? 1 : 5));
    else if (g.kind === 'machine') machines += g.count;
  }
  if (goal === 'power') return power + raw * 1e-3;
  if (goal === 'machines') return machines + raw * 1e-4 + power * 1e-5;
  return raw + power * 1e-3;
}

export interface OptimizeInput extends PlanInput {
  unlocked: Record<string, boolean>;
  goal: OptimizeGoal;
}

/** Returns the automatically chosen recipe name per item (only items with more than one available recipe). */
export function chooseRecipes(p: OptimizeInput): Record<ItemId, string> {
  const auto: Record<ItemId, string> = {};
  const run = (rc: Record<ItemId, string>) => compute({ ...p, rc: { ...rc, ...p.rc } });
  let best = run(auto);
  let bestCost = planCost(best, p.goal);
  for (let pass = 0; pass < 4; pass++) {
    let changed = false;
    const ids = best.groups.filter((g) => g.kind === 'machine').map((g) => g.id);
    // also items that are now covered by a byproduct or not produced at all may matter: chain items only
    for (const id of ids) {
      if (p.rc[id]) continue; // manual choice
      const options = (RECIPES[id] ?? []).filter((r) => isAvailable(r, p.unlocked));
      if (options.length < 2) continue;
      for (const r of options) {
        if ((auto[id] ?? defaultName(id)) === r.name) continue;
        const trial = { ...auto, [id]: r.name };
        const m = run(trial);
        const c = planCost(m, p.goal);
        if (c < bestCost - 1e-6) {
          bestCost = c;
          best = m;
          auto[id] = r.name;
          changed = true;
        }
      }
    }
    if (!changed) break;
  }
  return auto;
}

function defaultName(id: ItemId): string | undefined {
  const l = RECIPES[id];
  return (l?.find((r) => !r.alt) ?? l?.[0])?.name;
}
