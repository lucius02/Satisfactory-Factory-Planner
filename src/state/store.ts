import { GENERATORS } from '../data/generators';
import { ITEMS } from '../data/items';
import { RECIPES } from '../data/recipes';
import { SETTING_KEYS, type State } from './types';

const KEY = 'sf-fabrieksplanner-v3';
const OLD_KEYS = ['sf-fabrieksplanner-v2'];

export const DEFAULT_STATE: State = {
  lang: 'nl',
  targets: [{ item: 'modular-frame', rate: 5 }],
  miner: 2,
  purity: 1,
  clockMode: 'even',
  gap: 2,
  perRow: 8,
  floors: 1,
  cur: 0,
  snap: true,
  belt: 3,
  pipe: 1,
  dist: 'manifold',
  balSmooth: false,
  surplus: 'output',
  reuse: true,
  rc: {},
  unlocked: {},
  goal: 'raw',
  distOv: {},
  fluidDist: 'manifold',
  pos: {},
  external: [],
  layoutMode: 'flow',
  floorW: 0,
  floorL: 0,
  beltOff: {},
  page: 'factory',
  otherLayout: { pos: {}, beltOff: {} },
  gens: [{ gen: 'coal', fuel: 'coal', mode: 'count', value: 8 }],
  produceFuel: true,
  pole: 2,
  showWires: true,
  locked: false,
  autoPlan: false,
  daisy: true,
  align: true,
  capRows: false,
  blockOpt: {},
};

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

/** Merge unknown data (localStorage or a share code) over the defaults and fix old formats. */
export function normalize(raw: unknown, base: State = DEFAULT_STATE): State {
  const s = Object.assign(clone(base), raw && typeof raw === 'object' ? raw : {}) as State;
  if (!Array.isArray(s.targets)) s.targets = clone(DEFAULT_STATE.targets);
  s.targets = s.targets
    .filter((x) => x && RECIPES[x.item])
    .map((x) => ({ item: x.item, rate: Math.max(0, Number(x.rate) || 0), ...(x.max ? { max: true } : {}) }));
  // v1 stored recipe indices instead of names
  for (const k in s.rc) {
    const v: unknown = s.rc[k];
    if (typeof v === 'number') {
      const r = RECIPES[k]?.[v];
      if (r) s.rc[k] = r.name;
      else delete s.rc[k];
    } else if (!RECIPES[k]?.some((r) => r.name === v)) delete s.rc[k];
  }
  // manually chosen alternates count as unlocked
  s.unlocked ??= {};
  for (const k in s.rc) if (RECIPES[k]?.find((r) => r.name === s.rc[k])?.alt) s.unlocked[s.rc[k]] = true;
  s.external = (Array.isArray(s.external) ? s.external : [])
    .filter((x) => x && ITEMS[x.item])
    .map((x) => ({ item: x.item, rate: Math.max(0, Number(x.rate) || 0) }));
  s.beltOff ??= {};
  s.otherLayout ??= { pos: {}, beltOff: {} };
  s.blockOpt ??= {};
  s.otherLayout.blockOpt ??= {};
  s.otherLayout.pos ??= {};
  s.otherLayout.beltOff ??= {};
  s.gens = (Array.isArray(s.gens) ? s.gens : []).filter((g) => g && GENERATORS[g.gen]);
  s.distOv ??= {};
  s.pos ??= {};
  return s;
}

export function loadState(): State | null {
  for (const key of [KEY, ...OLD_KEYS]) {
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const s = JSON.parse(raw);
        if (s && Array.isArray(s.targets)) return normalize(s);
      }
    } catch {
      /* ignore broken storage */
    }
  }
  return null;
}

export function saveState(s: State): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* private mode etc. */
  }
}

function initial(): State {
  const s = loadState();
  if (s) return s;
  const fresh = clone(DEFAULT_STATE);
  if (/^en/i.test(navigator.language || '')) fresh.lang = 'en';
  return fresh;
}

/** The single mutable app state. */
export const state: State = initial();

export function replaceState(next: State): void {
  for (const k of Object.keys(state) as (keyof State)[]) delete state[k];
  Object.assign(state, next);
}

/** Data for the share code. */
export function exportCode(): string {
  const d: Record<string, unknown> = { v: 3, targets: state.targets, rc: state.rc, unlocked: state.unlocked, external: state.external, beltOff: state.beltOff, blockOpt: state.blockOpt, page: state.page, otherLayout: state.otherLayout, gens: state.gens, distOv: state.distOv, pos: state.pos };
  for (const k of SETTING_KEYS) d[k] = state[k];
  return JSON.stringify(d);
}

export function importCode(code: string): State {
  const d = JSON.parse(code);
  if (!d || !Array.isArray(d.targets)) throw new Error('invalid');
  return normalize({ ...d, lang: state.lang, cur: 0 });
}

/** Switch between the factory and power planner; each keeps its own layout. */
export function switchPage(page: State['page']): void {
  if (state.page === page) return;
  const cur = { pos: state.pos, beltOff: state.beltOff, blockOpt: state.blockOpt };
  state.pos = state.otherLayout.pos;
  state.beltOff = state.otherLayout.beltOff;
  state.blockOpt = state.otherLayout.blockOpt ?? {};
  state.otherLayout = cur;
  state.page = page;
  state.cur = 0;
}
