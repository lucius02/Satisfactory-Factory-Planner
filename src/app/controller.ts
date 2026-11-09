/** Glue: recompute the model, geometry and layout, then redraw everything. */
import { chooseRecipes } from '../calc/optimize';
import { compute, type PlanInput } from '../calc/solver';
import { GENERATORS, genFuel } from '../data/generators';
import { applyStaticTexts } from '../i18n';
import { autoLayout } from '../layout/autoLayout';
import { geomLocal } from '../layout/geometry';
import type { Side } from '../layout/geometry';
import { autoSides, consumersOf } from '../layout/sides';
import type { Group } from '../calc/model';
import { fitView, renderMap } from '../render/map';
import { saveState, state } from '../state/store';
import { renderInfo } from '../ui/info';
import { isRecModalOpen, renderRecBtn, renderRecList } from '../ui/recipesModal';
import { renderTargets } from '../ui/picker';
import { renderGens, renderPage } from '../ui/power';
import { renderFloorTabs, renderOverview, syncSettings } from '../ui/sidebar';
import { renderTable } from '../ui/table';
import { ctx } from './context';

export interface RecomputeOpts {
  /** Throw away all positions (also manual ones). */
  force?: boolean;
  fit?: boolean;
}

export function recompute(opts: RecomputeOpts = {}): void {
  ctx.auto = autoRecipes();
  ctx.model = compute({ ...planInput(), rc: effectiveRc() });
  if (ctx.sel && !ctx.model.byKey[ctx.sel]) ctx.sel = null;
  const geo = { gap: state.gap, perRow: state.perRow, caps: ctx.model.caps, pole: state.pole, daisy: state.daisy, align: state.align, capRows: state.capRows };
  const sidesOf = (g: Group) => {
    const o = state.blockOpt[g.key];
    const auto = ctx.sides[g.key];
    const inSides: Record<string, Side> = {};
    for (const i of g.inputs) {
      const sd = o?.inSides?.[i.item] ?? o?.side ?? auto?.in[i.item];
      if (sd) inSides[i.item] = sd;
    }
    return { inSides, outSide: o?.outSide ?? auto?.out, outSplit: o?.outSplit ? consumersOf(ctx.model, g) : undefined };
  };
  const build = (g: Group) => geomLocal(g, { ...geo, opt: state.blockOpt[g.key], ...sidesOf(g) });
  ctx.local = {};
  for (const g of ctx.model.groups) ctx.local[g.key] = build(g);
  ctx.fits = autoLayout(
    ctx.model,
    state.pos,
    { floors: state.floors, mode: state.layoutMode, floorW: state.floorW, floorL: state.floorL },
    (g) => ctx.local[g.key],
    opts.force,
  );
  // entry / exit side from the positions of suppliers and consumers (unless set in the block)
  ctx.sides = autoSides(ctx.model, state.pos, ctx.local);
  for (const g of ctx.model.groups) if (!ctx.local[g.key]?.src) ctx.local[g.key] = build(g);
  state.cur = Math.min(state.cur || 0, (state.floors || 1) - 1);
  renderAll();
  if (opts.fit) fitView();
  saveState(state);
}

export function renderAll(): void {
  renderMap();
  renderOverview();
  renderTable();
  renderInfo();
  renderFloorTabs();
}

/** Full refresh, e.g. after a language change or loading a share code. */
export function refreshAll(opts: RecomputeOpts = {}): void {
  applyStaticTexts();
  syncSettings();
  renderTargets();
  renderGens();
  renderPage();
  recompute(opts);
  renderRecBtn();
  if (isRecModalOpen()) renderRecList();
}

let autoCache: { key: string; auto: Record<string, string> } | null = null;

/** Best recipe per product among the unlocked ones (cached on the inputs that matter). */
function autoRecipes(): Record<string, string> {
  const key = JSON.stringify([
    state.page, state.gens, state.produceFuel, state.targets, state.external, state.rc, state.unlocked, state.goal, state.miner, state.purity, state.clockMode,
    state.belt, state.pipe, state.reuse, state.dist, state.distOv, state.balSmooth,
  ]);
  if (autoCache?.key !== key) autoCache = { key, auto: chooseRecipes({ ...state, ...planInput(), surplus: 'output' }) };
  return autoCache.auto;
}

/** Recipes in use: manual choice first, then the automatic one. */
export const effectiveRc = (): Record<string, string> => ({ ...ctx.auto, ...state.rc });

/** Solver input for the open page: the factory, or the power plant (generators + optional fuel chain). */
export function planInput(): PlanInput {
  if (state.page === 'factory') return { ...state, gens: [] };
  const external: { item: string; rate: number }[] = [];
  if (!state.produceFuel)
    for (const g of state.gens) {
      const G = GENERATORS[g.gen];
      if (!G || !(g.value > 0)) continue;
      const exact = g.mode === 'mw' ? g.value / G.mw : g.value;
      external.push({ item: genFuel(g.gen, g.fuel).item, rate: genFuel(g.gen, g.fuel).rate * exact });
    }
  return { ...state, targets: [], external, gens: state.gens };
}
