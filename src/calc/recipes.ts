import { BUILDINGS } from '../data/buildings';
import { ITEMS } from '../data/items';
import { RECIPES } from '../data/recipes';
import type { ItemId, Recipe } from '../data/types';

export type RecipeChoice = Record<ItemId, string>;

/** Recipe in use for an item: the chosen one, else the first standard recipe. */
export function chosenRecipe(id: ItemId, rc: RecipeChoice): Recipe | null {
  const list = RECIPES[id];
  if (!list) return null;
  const want = rc[id];
  return list.find((r) => r.name === want) ?? list.find((r) => !r.alt) ?? list[0];
}

/** Number of items that use an alternate recipe while a standard one exists. */
export function altCount(rc: RecipeChoice): number {
  let n = 0;
  for (const id in RECIPES) {
    const r = chosenRecipe(id, rc);
    if (r?.alt && RECIPES[id].some((x) => !x.alt)) n++;
  }
  return n;
}

/** Production depth: raw = 0, otherwise 1 + deepest input. Loops are cut. */
export function makeDepth(rc: RecipeChoice): (id: ItemId) => number {
  const memo: Record<ItemId, number> = {};
  const depth = (id: ItemId): number => {
    if (memo[id] != null) return memo[id];
    memo[id] = 0;
    const r = chosenRecipe(id, rc);
    if (!r) return 0;
    const ks = Object.keys(r.in);
    return (memo[id] = 1 + (ks.length ? Math.max(...ks.map(depth)) : 0));
  };
  return depth;
}

export function recipeSummary(r: Recipe, fmt: (x: number) => string): string {
  const part = (o: Record<ItemId, number>) =>
    Object.entries(o)
      .map(([k, v]) => `${fmt(v)} ${ITEMS[k]?.n ?? k}`)
      .join(' + ');
  return `${part(r.in) || '—'} → ${part(r.out)} · ${BUILDINGS[r.b].n}`;
}
