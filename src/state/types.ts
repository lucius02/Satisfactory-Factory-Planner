import type { BeltTier, PipeTier } from '../data/logistics';
import type { GenSpec } from '../data/generators';
import type { ItemId } from '../data/types';

export type Lang = 'nl' | 'en';
/** even = all machines at the same clock; fill = full machines + one remainder; full = all at 100% (overproduction). */
export type ClockMode = 'even' | 'fill' | 'full';
/** How a production line distributes its input belt over the machines. */
export type DistMode = 'manifold' | 'balancer';
/** What happens with surplus (byproducts that are not used, overproduction). */
export type SurplusMode = 'output' | 'sink' | 'storage';

/** What the automatic recipe choice minimises. */
export type OptimizeGoal = 'raw' | 'power' | 'machines';

/** flow = rows per production depth; compact = packed as tight as possible. */
export type LayoutMode = 'flow' | 'compact';

export type Page = 'factory' | 'power';

/** Settings of one block (production line), set in its info panel. */
export interface BlockOpt {
  /** Where the input belts enter: left, middle or right, for all inputs (unset = automatic). */
  side?: 'left' | 'center' | 'right';
  /** Entry side per input item (overrides `side`). */
  inSides?: Record<string, 'left' | 'center' | 'right'>;
  /** Split the main output: one belt per consumer instead of one merged belt. */
  outSplit?: boolean;
  /** Where the output belts leave: left, middle or right (unset = automatic). */
  outSide?: 'left' | 'center' | 'right';
  /** Machines per row for this block (unset = global setting). */
  perRow?: number;
  /** Extra space between the machines (foundations when aligned, else metres). */
  spacing?: number;
}

/** Positions and belt waypoints of one plan (factory or power plant). */
export interface PlanLayout {
  pos: Record<string, GroupPos>;
  blockOpt?: Record<string, BlockOpt>;
  beltOff: Record<string, [number, number]>;
}

export interface Target {
  item: ItemId;
  rate: number;
}

export interface GroupPos {
  x: number;
  y: number;
  rot: 0 | 1;
  f: number;
  manual?: boolean;
}

export interface State {
  lang: Lang;
  targets: Target[];
  /** Items that already arrive from outside the factory (per minute). */
  external: Target[];
  miner: 1 | 2 | 3;
  purity: 0 | 1 | 2;
  clockMode: ClockMode;
  gap: number;
  perRow: number;
  floors: number;
  cur: number;
  snap: boolean;
  /** Highest conveyor belt tier the player has / wants to use. */
  belt: BeltTier;
  /** Highest pipeline tier the player has / wants to use. */
  pipe: PipeTier;
  /** Default distribution for all production lines. */
  dist: DistMode;
  /** Balancer: round machine counts up to 2ᵃ·3ᵇ so no loopback is needed. */
  balSmooth: boolean;
  surplus: SurplusMode;
  /** Use byproducts to cover demand elsewhere in the factory. */
  reuse: boolean;
  /** Manually chosen recipe name per item (overrides the automatic choice). */
  rc: Record<ItemId, string>;
  /** Alternate recipes the player has unlocked (by recipe name). */
  unlocked: Record<string, boolean>;
  /** What the automatic recipe choice optimises. */
  goal: OptimizeGoal;
  /** Per production line override of `dist`. */
  distOv: Record<string, DistMode>;
  pos: Record<string, GroupPos>;
  layoutMode: LayoutMode;
  /** Max. floor size in foundations (0 = unlimited). */
  floorW: number;
  floorL: number;
  /** Manually placed waypoint per belt connection (world metres). */
  beltOff: Record<string, [number, number]>;
  /** Which planner is open. `pos`/`beltOff` always belong to this page; the other page's layout is in `otherLayout`. */
  page: Page;
  otherLayout: PlanLayout;
  /** Power page: generators to build. */
  gens: GenSpec[];
  /** Power page: also build the production chain for the fuel (otherwise it comes in as external supply). */
  produceFuel: boolean;
  /** Power pole tier used to connect the machines. */
  pole: 1 | 2 | 3;
  /** Draw the power lines between production lines on the map. */
  showWires: boolean;
  /** Satisfactory 1.2: buildings pass power on to each other, so one pole per row is enough. */
  daisy: boolean;
  /** Too much flow for one belt: extra rows (true) or parallel belts in the same row (false). */
  capRows: boolean;
  /** Per block settings, by group key (per page). */
  blockOpt: Record<string, BlockOpt>;
  /** Center machines on foundations. */
  align: boolean;
}

/** Settings that are part of the share code / settings panel. */
export const SETTING_KEYS = [
  'miner', 'purity', 'clockMode', 'gap', 'perRow', 'floors', 'belt', 'pipe', 'dist', 'balSmooth', 'surplus', 'reuse', 'snap', 'goal', 'layoutMode', 'floorW', 'floorL', 'pole', 'produceFuel', 'showWires', 'daisy', 'align', 'capRows',
] as const;
export type SettingKey = (typeof SETTING_KEYS)[number];
