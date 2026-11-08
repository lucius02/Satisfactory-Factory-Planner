import type { BeltTier, PipeTier } from '../data/logistics';
import type { ItemId } from '../data/types';

export type Lang = 'nl' | 'en';
/** even = all machines at the same clock; fill = full machines + one remainder; full = all at 100% (overproduction). */
export type ClockMode = 'even' | 'fill' | 'full';
/** How a production line distributes its input belt over the machines. */
export type DistMode = 'manifold' | 'balancer';
/** What happens with surplus (byproducts that are not used, overproduction). */
export type SurplusMode = 'output' | 'sink' | 'storage';

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
  /** Chosen recipe name per item. */
  rc: Record<ItemId, string>;
  /** Per production line override of `dist`. */
  distOv: Record<string, DistMode>;
  pos: Record<string, GroupPos>;
}

/** Settings that are part of the share code / settings panel. */
export const SETTING_KEYS = [
  'miner', 'purity', 'clockMode', 'gap', 'perRow', 'floors', 'belt', 'pipe', 'dist', 'balSmooth', 'surplus', 'reuse', 'snap',
] as const;
export type SettingKey = (typeof SETTING_KEYS)[number];
