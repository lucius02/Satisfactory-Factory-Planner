/** Glue: recompute the model, geometry and layout, then redraw everything. */
import { compute } from '../calc/solver';
import { applyStaticTexts } from '../i18n';
import { autoLayout } from '../layout/autoLayout';
import { geomLocal } from '../layout/geometry';
import { fitView, renderMap } from '../render/map';
import { saveState, state } from '../state/store';
import { renderInfo } from '../ui/info';
import { isRecModalOpen, renderRecBtn, renderRecList } from '../ui/recipesModal';
import { renderFloorTabs, renderOverview, renderTargets, syncSettings } from '../ui/sidebar';
import { renderTable } from '../ui/table';
import { ctx } from './context';

export interface RecomputeOpts {
  /** Throw away all positions (also manual ones). */
  force?: boolean;
  fit?: boolean;
}

export function recompute(opts: RecomputeOpts = {}): void {
  ctx.model = compute(state);
  if (ctx.sel && !ctx.model.byKey[ctx.sel]) ctx.sel = null;
  const geo = { gap: state.gap, perRow: state.perRow, caps: ctx.model.caps };
  ctx.local = {};
  for (const g of ctx.model.groups) ctx.local[g.key] = geomLocal(g, geo);
  autoLayout(ctx.model, state.pos, state.floors, (g) => ctx.local[g.key], opts.force);
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
  recompute(opts);
  renderRecBtn();
  if (isRecModalOpen()) renderRecList();
}
