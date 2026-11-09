/** Side panel with details of the selected production line. */
import { $, ctx, groupOf } from '../app/context';
import { recompute } from '../app/controller';
import { suppliers, type Group } from '../calc/model';
import { isAvailable } from '../calc/optimize';
import { recipeSummary } from '../calc/recipes';
import { isFluid, itemName } from '../data/items';
import { RECIPES } from '../data/recipes';
import { t } from '../i18n';
import { renderMap } from '../render/map';
import { saveState, state } from '../state/store';
import type { DistMode } from '../state/types';
import { beltFor, col, duration, esc, fmt, fmtInt, fname, pct, unit } from '../util/format';
import { groupTitle, sourceName } from './labels';
import { renderRecBtn } from './recipesModal';
import { renderFloorTabs, renderOverview, syncSettings } from './sidebar';
import { renderTable } from './table';

const dot = (c: string) => `<span class="dot" style="background:${c}"></span>`;
const li = (l: string, r: string) => `<li><span>${l}</span><span class="num">${r}</span></li>`;
const h2 = (k: Parameters<typeof t>[0]) => `<h2 class="h2 mt-2.5">${t(k)}</h2>`;

function floorRow(f: number): string {
  const F = state.floors || 1;
  if (F < 2) return '';
  return `<div class="mt-2.5 flex items-center gap-1.5 text-[13px]">${t('floor')}:
    <button class="btn btn-sm" data-act="fdown" ${f <= 0 ? 'disabled' : ''}>▼ ${t('down')}</button>
    <b class="min-w-11 text-center font-mono">${fname(f)}</b>
    <button class="btn btn-sm" data-act="fup" ${f >= F - 1 ? 'disabled' : ''}>▲ ${t('up')}</button></div>`;
}

function blockSettings(g: Group): string {
  const o = state.blockOpt[g.key] ?? {};
  const L = ctx.local[g.key];
  const name = (side?: string) => t(side === 'center' ? 'sideCenter' : side === 'right' ? 'sideRight' : 'sideLeft');
  const sel = (act: string, cur: string | undefined, auto: string | undefined) =>
    `<select data-act="${act}"><option value=""${!cur ? ' selected' : ''}>${esc(t('sideAutoIs', name(auto)))}</option>${(['left', 'center', 'right'] as const)
      .map((v) => `<option value="${v}"${v === cur ? ' selected' : ''}>${name(v)}</option>`)
      .join('')}</select>`;
  return `${h2('blockH')}
    <div class="field"><label>${t('inSide')}</label>${sel('side', o.side, L?.inSide)}</div>
    ${g.outputs.length ? `<div class="field"><label>${t('outSide')}</label>${sel('outSide', o.outSide, L?.outSide)}</div>` : ''}
    <div class="field"><label>${t('perRow')}</label><input type="number" min="0" step="1" data-act="perRow" value="${o.perRow ?? 0}" title="0 = ${esc(t('sideAuto'))}"></div>
    <div class="field"><label>${t(state.align ? 'spacingF' : 'spacingM')}</label><input type="number" min="0" step="1" data-act="spacing" value="${o.spacing ?? 0}"></div>`;
}

function logistics(g: Group): string {
  const L = ctx.local[g.key];
  if (!L || L.src) return '';
  const c = L.counts;
  const parts = [
    L.rows > 1 ? `${L.rows} ${t('rowsWord')}` : '',
    c.splitters ? `${c.splitters}× Splitter` : '',
    c.mergers ? `${c.mergers}× Merger` : '',
    c.junctions ? `${c.junctions}× Junction` : '',
    c.poles ? `${c.poles}× Power Pole Mk${state.pole}` : '',
  ].filter(Boolean);
  if (!parts.length) return '';
  return `${h2('logisticsLine')}<div class="chips">${parts.map((p) => `<span class="chip">${p}</span>`).join('')}</div>`;
}

export function renderInfo(): void {
  const el = $('#info');
  const g = groupOf(ctx.sel);
  if (!g) {
    el.hidden = true;
    return;
  }
  el.hidden = false;
  const p = state.pos[g.key];
  const w = ctx.world[g.key];
  const size = `${w.W / 8} × ${w.H / 8} foundations`;
  const acts = `<div class="mt-3 flex flex-wrap gap-1.5"><button class="btn btn-sm" data-act="rot">${t('rotate')}</button>${p.manual ? `<button class="btn btn-sm" data-act="auto">${t('backAuto')}</button>` : ''}<button class="btn btn-sm" data-act="close">${t('close')}</button></div>`;
  const head = (title: string, meta: string) =>
    `<h3 class="m-0 font-head text-[21px] font-bold tracking-wide">${esc(title)}</h3><div class="mb-2.5 mt-0.5 text-[12.5px] text-muted">${meta}</div>`;

  if (g.kind === 'source') {
    el.innerHTML = `${head(itemName(g.id), `${t('rawBlock')} · ${size}`)}
      <div class="chips"><span class="chip">${fmt(g.rate)}${unit(g.id)}</span>${Number.isFinite(g.ex!.per) ? `<span class="chip">${g.count}× ${esc(sourceName(g))}</span>` : ''}<span class="chip">${fmt(g.power)} MW</span><span class="chip">${beltFor(g.rate, g.id)}</span></div>
      <p class="note">${t('rawNote')}</p>${floorRow(p.f)}${acts}`;
    return;
  }

  if (g.kind === 'sink' || g.kind === 'storage') {
    const extra =
      g.kind === 'sink'
        ? `<span class="chip">${fmtInt(g.sinkPoints ?? 0)} ${t('pointsMin')}</span><span class="chip">${fmt(g.power)} MW</span>`
        : g.fillMin != null
          ? `<span class="chip">${t('fillTime', duration(g.fillMin))}</span>`
          : '';
    el.innerHTML = `${head(groupTitle(g), `${g.kind === 'sink' ? t('sinkBlock') : t('storageBlock')} · ${g.count}× ${esc(g.bld!.n)} · ${size}`)}
      <div class="chips"><span class="chip">${fmt(g.rate)}${g.id ? unit(g.id) : '/min'}</span>${extra}</div>
      ${g.fallback ? `<p class="note">${t('fallbackNote')}</p>` : ''}
      ${h2('inputs')}<ul class="list">${g.inputs.map((i) => li(`${dot(col(i.item))}${esc(itemName(i.item))}`, `${fmt(i.rate)}${unit(i.item)}`)).join('')}</ul>
      ${blockSettings(g)}${logistics(g)}${floorRow(p.f)}${acts}`;
    return;
  }

  if (g.kind === 'generator') {
    el.innerHTML = `${head(groupTitle(g), `${g.count}× ${esc(g.bld!.n)} (${g.bld!.w}×${g.bld!.l} m) · ${size}`)}
      ${blockSettings(g)}
      <div class="chips"><span class="chip">${fmtInt(g.gen ?? 0)} MW</span><span class="chip">${g.count}× ${pct(g.clocks[0])}</span></div>
      ${h2('inputs')}<ul class="list">${g.inputs.map((i) => li(`${dot(col(i.item))}${esc(itemName(i.item))}`, `${fmt(i.rate)}${unit(i.item)} <span class="sub">${beltFor(i.rate, i.item)}</span>`)).join('')}</ul>
      ${g.outputs.length ? `${h2('surplus')}<ul class="list">${g.outputs.map((o) => li(`${dot(col(o.item))}${esc(itemName(o.item))}`, `${fmt(o.rate)}${unit(o.item)}`)).join('')}</ul>` : ''}
      ${logistics(g)}${floorRow(p.f)}${acts}`;
    return;
  }

  const b = g.bld!;
  const list = RECIPES[g.id];
  const users: { name: string; r: number }[] = [];
  for (const u of ctx.model.groups)
    for (const i of u.inputs) {
      if (i.item !== g.id) continue;
      const sp = suppliers(ctx.model, g.id).find((s) => s.g === g);
      if (sp) users.push({ name: groupTitle(u), r: i.rate * sp.share });
    }
  const target = ctx.model.targets[g.id];
  const manual = state.rc[g.id];
  const autoName = ctx.auto[g.id] ?? (list.find((r) => !r.alt) ?? list[0]).name;
  const recSel =
    list.length > 1
      ? `${h2('recipe')}<select data-act="recipe" class="mb-1"><option value=""${!manual ? ' selected' : ''}>${esc(t('autoRecipe', autoName))}</option>${list
          .map(
            (r) =>
              `<option value="${esc(r.name)}"${r.name === manual ? ' selected' : ''}>${r.alt ? 'ALT · ' : ''}${esc(r.name)}${isAvailable(r, state.unlocked) ? '' : ` (${t('locked')})`}</option>`,
          )
          .join('')}</select><p class="note mt-0.5">${esc(recipeSummary(g.rec!, fmt))}</p>`
      : '';
  const hasSolid = g.inputs.some((i) => !isFluid(i.item));
  const ov = state.distOv[g.key];
  const distSel = hasSolid
    ? `${h2('distLine')}<select data-act="dist">
        <option value=""${!ov ? ' selected' : ''}>${t('distDefault', t(state.dist === 'balancer' ? 'distBalancer' : 'distManifold'))}</option>
        <option value="manifold"${ov === 'manifold' ? ' selected' : ''}>${t('distManifold')}</option>
        <option value="balancer"${ov === 'balancer' ? ' selected' : ''}>${t('distBalancer')}</option></select>`
    : '';
  const limit =
    g.maxClock < 0.999 && g.limitItem
      ? `<p class="note text-accent2">${t('limitedBy', pct(g.maxClock), itemName(g.limitItem), isFluid(g.limitItem) ? t('pipe') + state.pipe : t('belt') + state.belt)}</p>`
      : '';

  el.innerHTML = `${head(itemName(g.id), `${g.count}× ${b.n} (${b.w}×${b.l} m) · ${size}`)}
    <div class="chips"><span class="chip">${fmt(g.rate)}${unit(g.id)}</span><span class="chip">${b.v ? t('avg') + ' ' : ''}${fmt(Math.round(g.power * 10) / 10)} MW</span><span class="chip">${beltFor(g.rate, g.id)}</span></div>
    ${limit}${recSel}${distSel}
    ${h2('inputs')}<ul class="list">${g.inputs.map((i) => li(`${dot(col(i.item))}${esc(itemName(i.item))}`, `${fmt(i.rate)}${unit(i.item)} <span class="sub">${beltFor(i.rate, i.item)}</span>`)).join('') || '<li>–</li>'}</ul>
    ${h2('goesTo')}<ul class="list">${users.map((x) => li(esc(x.name), `${fmt(x.r)}${unit(g.id)}`)).join('')}${target ? li(`★ ${t('endProduct')}`, `${fmt(target)}${unit(g.id)}`) : ''}${g.outputs.slice(1).map((o) => li(`+ ${esc(itemName(o.item))}`, `${fmt(o.rate)}${unit(o.item)}`)).join('')}</ul>
    ${h2('machinesH')}<div class="chips">${g.clocks.map((c, i) => `<span class="chip">#${i + 1} ${pct(c)}</span>`).join('')}</div>
    ${blockSettings(g)}${logistics(g)}${floorRow(p.f)}${acts}`;
}

export function rotateSelected(): void {
  const key = ctx.sel;
  const p = key ? state.pos[key] : undefined;
  if (!key || !p) return;
  const w = ctx.world[key];
  const cx = p.x + w.W / 2;
  const cy = p.y + w.H / 2;
  p.rot = p.rot ? 0 : 1;
  p.manual = true;
  const gsz = state.snap ? 8 : 1;
  p.x = Math.round((cx - w.H / 2) / gsz) * gsz;
  p.y = Math.round((cy - w.W / 2) / gsz) * gsz;
  renderMap();
  renderInfo();
  renderOverview();
  saveState(state);
}

export function bindInfo(): void {
  const el = $('#info');
  el.addEventListener('click', (e) => {
    const a = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
    if (!a || a.tagName === 'SELECT' || !ctx.sel) return;
    const act = a.dataset.act;
    if (act === 'rot') rotateSelected();
    else if (act === 'auto') {
      delete state.pos[ctx.sel];
      recompute();
    } else if (act === 'close') {
      ctx.sel = null;
      renderMap();
      renderInfo();
    } else if (act === 'fup' || act === 'fdown') {
      const p = state.pos[ctx.sel];
      p.f = (p.f || 0) + (act === 'fup' ? 1 : -1);
      p.manual = true;
      state.cur = p.f;
      renderMap();
      renderInfo();
      renderFloorTabs();
      renderTable();
      saveState(state);
    }
  });
  el.addEventListener('change', (e) => {
    const s = e.target as HTMLSelectElement;
    const g = groupOf(ctx.sel);
    if (!g) return;
    if (s.dataset.act === 'recipe') {
      if (s.value) state.rc[g.id] = s.value;
      else delete state.rc[g.id];
      renderRecBtn();
      recompute();
    } else if (['side', 'outSide', 'perRow', 'spacing'].includes(s.dataset.act ?? '')) {
      const o = (state.blockOpt[g.key] ??= {});
      if (s.dataset.act === 'side' || s.dataset.act === 'outSide') {
        const k = s.dataset.act as 'side' | 'outSide';
        if (s.value) o[k] = s.value as 'left' | 'center' | 'right';
        else delete o[k];
      } else {
        const v = Math.max(0, Math.round(Number(s.value) || 0));
        if (v) o[s.dataset.act as 'perRow' | 'spacing'] = v;
        else delete o[s.dataset.act as 'perRow' | 'spacing'];
      }
      if (!Object.keys(o).length) delete state.blockOpt[g.key];
      recompute();
    } else if (s.dataset.act === 'dist') {
      if (s.value) state.distOv[g.key] = s.value as DistMode;
      else delete state.distOv[g.key];
      syncSettings();
      recompute();
    }
  });
}
