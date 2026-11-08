import type { Building, BuildingId, ItemId, Recipe } from '../data/types';
import type { DistMode } from '../state/types';
import type { Extractor } from './extractors';

export interface Flow {
  item: ItemId;
  rate: number;
}

export type GroupKind = 'machine' | 'source' | 'sink' | 'storage';

/** One production line (or raw source, sink, storage block) on the map. */
export interface Group {
  key: string;
  /** Main item (empty for the sink). */
  id: ItemId;
  kind: GroupKind;
  /** Building used to draw the machines of this group. */
  bld?: Building;
  b?: BuildingId;
  rec?: Recipe;
  /** Main output per minute (for sinks/storage: input). */
  rate: number;
  /** Fractional number of machines at 100%. */
  exact: number;
  count: number;
  clocks: number[];
  /** Highest clock a machine may run at because of belt/pipe limits (≤ 1). */
  maxClock: number;
  /** Item that limits `maxClock`, if any. */
  limitItem?: ItemId;
  power: number;
  inputs: Flow[];
  outputs: Flow[];
  dist: DistMode;
  ex?: Extractor;
  /** sink: points per minute. */
  sinkPoints?: number;
  /** storage: minutes until full (fluids only). */
  fillMin?: number;
  /** storage used because the item cannot be sunk. */
  fallback?: boolean;
}

export interface Supply {
  key: string;
  rate: number;
}

export interface Model {
  groups: Group[];
  byKey: Record<string, Group>;
  /** Total demand per item (inputs of all machines + targets). */
  demand: Record<ItemId, number>;
  /** Who produces each item and how much. */
  supply: Record<ItemId, Supply[]>;
  /** Surplus per item (production − demand). */
  left: Record<ItemId, number>;
  /** End products per item. */
  targets: Record<ItemId, number>;
  converged: boolean;
  caps: { belt: number; pipe: number };
  depth: (id: ItemId) => number;
}

/** Producers of `item` with their share of the total supply. */
export function suppliers(model: Model, item: ItemId): { g: Group; share: number }[] {
  const list = model.supply[item] ?? [];
  const tot = list.reduce((s, x) => s + x.rate, 0);
  if (tot <= 1e-9) return [];
  return list.map((x) => ({ g: model.byKey[x.key], share: x.rate / tot })).filter((x) => x.g && x.share > 1e-9);
}
