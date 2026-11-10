import type { Group, Model } from '../calc/model';
import type { LocalGeom, WorldGeom } from '../layout/geometry';
import type { PowerNet } from '../layout/powerNet';
import type { Sides } from '../layout/sides';

/** Runtime (non-persisted) state of the app. */
export const ctx = {
  model: null as unknown as Model,
  /** Selected group key. */
  sel: null as string | null,
  /** Automatically chosen recipe per item. */
  auto: {} as Record<string, string>,
  /** Layout fits within the floors / floor size. */
  fits: true,
  /** Computed rates of the "max" targets (and what limits them). */
  maxInfo: null as Record<string, { rate: number; limit?: string }> | null,
  /** Automatic entry / exit side per block. */
  sides: {} as Record<string, Sides>,
  /** Belt connections on screen: what runs over them. */
  conns: {} as Record<string, { item: string; rate: number }>,
  /** Midpoint between the two ends of each belt (reference for its drag offset). */
  beltMid: {} as Record<string, [number, number]>,
  /** Power network between the production lines (filled by the map renderer). */
  net: { edges: [], helpers: [], extraPoles: 0, wires: 0, length: 0 } as PowerNet,
  view: { k: 5, tx: 60, ty: 60 },
  /** Local geometry per group key, recomputed with the model. */
  local: {} as Record<string, LocalGeom>,
  /** World geometry per group key, recomputed on every render. */
  world: {} as Record<string, WorldGeom>,
};

export const $ = <T extends Element = HTMLElement>(sel: string): T => {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error(`Element not found: ${sel}`);
  return el;
};

export const groupOf = (key: string | null): Group | undefined => (key ? ctx.model.byKey[key] : undefined);
