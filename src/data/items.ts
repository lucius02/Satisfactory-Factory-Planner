import type { Item, ItemId } from './types';

/** All items, filled by `recipes.ts` while registering recipes. */
export const ITEMS: Record<ItemId, Item> = {};

export function defineItem(id: ItemId, n: string, extra: Partial<Item> = {}): Item {
  ITEMS[id] = Object.assign({ id, n }, ITEMS[id] ?? {}, extra);
  return ITEMS[id];
}

/** Fluids and gases (amounts in m³). */
export const FLUIDS = new Set<ItemId>([
  'crude-oil',
  'water',
  'nitrogen-gas',
  'heavy-oil-residue',
  'fuel',
  'turbofuel',
  'rocket-fuel',
  'sulfuric-acid',
  'alumina-solution',
  'nitric-acid',
  'dissolved-silica',
  'dark-matter-residue',
  'excited-photonic-matter',
]);

const RAW: [ItemId, string][] = [
  ['iron-ore', 'Iron Ore'],
  ['copper-ore', 'Copper Ore'],
  ['limestone', 'Limestone'],
  ['coal', 'Coal'],
  ['caterium-ore', 'Caterium Ore'],
  ['raw-quartz', 'Raw Quartz'],
  ['sulfur', 'Sulfur'],
  ['bauxite', 'Bauxite'],
  ['uranium', 'Uranium'],
  ['sam', 'SAM'],
  ['crude-oil', 'Crude Oil'],
  ['water', 'Water'],
  ['nitrogen-gas', 'Nitrogen Gas'],
  ['uranium-waste', 'Uranium Waste'],
];
for (const [id, n] of RAW) defineItem(id, n, { raw: true });

/** Intermediate items that only appear as byproducts or alternates. */
defineItem('polymer-resin', 'Polymer Resin', { tier: 6 });
defineItem('compacted-coal', 'Compacted Coal', { tier: 6 });
defineItem('turbofuel', 'Turbofuel', { tier: 6 });
defineItem('dissolved-silica', 'Dissolved Silica');

export function itemName(id: ItemId): string {
  return ITEMS[id]?.n ?? id;
}

export function isFluid(id: ItemId): boolean {
  return !!ITEMS[id]?.fluid;
}
