/** Item id, e.g. `iron-plate`. */
export type ItemId = string;
/** Building id, key of `BUILDINGS`. */
export type BuildingId =
  | 'smelter'
  | 'foundry'
  | 'constr'
  | 'assembler'
  | 'manufacturer'
  | 'refinery'
  | 'blender'
  | 'packager'
  | 'accel'
  | 'converter'
  | 'encoder';

export interface Building {
  /** Display name (English, as in the game). */
  n: string;
  /** Width in metres (side where belts connect). */
  w: number;
  /** Length in metres (input side → output side). */
  l: number;
  /** Power at 100% in MW (average for variable-power buildings). */
  mw: number;
  /** Colour on the map. */
  c: string;
  /** Variable power: `mw` is an average. */
  v?: boolean;
}

/** Item tier group in the product picker: 6 = tier 0–6, then 7, 8, 9. */
export type TierGroup = 6 | 7 | 8 | 9;

export interface Item {
  id: ItemId;
  n: string;
  raw?: boolean;
  fluid?: boolean;
  tier?: TierGroup;
}

/** Amounts per minute at 100% clock speed. */
export type Amounts = Record<ItemId, number>;

export interface Recipe {
  name: string;
  b: BuildingId;
  in: Amounts;
  /** Main product plus byproducts. */
  out: Amounts;
  alt?: boolean;
  /** Recipe-specific (average) power in MW, overrides the building. */
  mw?: number;
}
