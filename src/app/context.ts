import type { Group, Model } from '../calc/model';
import type { LocalGeom, WorldGeom } from '../layout/geometry';

/** Runtime (non-persisted) state of the app. */
export const ctx = {
  model: null as unknown as Model,
  /** Selected group key. */
  sel: null as string | null,
  /** Automatically chosen recipe per item. */
  auto: {} as Record<string, string>,
  /** Layout fits within the floors / floor size. */
  fits: true,
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
