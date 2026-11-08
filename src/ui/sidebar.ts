import { $, ctx } from '../app/context';
import { recompute, refreshAll } from '../app/controller';
import { BUILDINGS } from '../data/buildings';
import { ITEMS, itemName } from '../data/items';
import { craftableItems } from '../data/recipes';
import { t } from '../i18n';
import { bounds, renderMap } from '../render/map';
import { saveState, state } from '../state/store';
import type { Lang, State } from '../state/types';
import { col, esc, fmt, fmtInt, flong, fname, unit } from '../util/format';
import { renderInfo } from './info';
import { sourceName } from './labels';

// ---------------- targets ----------------

function itemOptions(selId: string): string {
  const groups: [number, string][] = [[6, t('tierAll')], [7, 'Tier 7'], [8, 'Tier 8'], [9, 'Tier 9']];
  const all = craftableItems();
  return groups
    .map(
      ([tier, label]) =>
        `<optgroup label="${label}">` +
        all
          .filter((id) => ITEMS[id].tier === tier)
          .map((id) => `<option value="${id}"${id === selId ? ' selected' : ''}>${esc(ITEMS[id].n)}</option>`)
          .join('') +
        '</optgroup>',
    )
    .join('');
}

export function renderTargets(): void {
  $('#targets').innerHTML =
    state.targets
      .map(
        (tg, i) => `<div class="trow" data-row="${i}">
      <select data-f="item" aria-label="${t('product')}">${itemOptions(tg.item)}</select>
      <input type="number" data-f="rate" min="0" step="any" value="${tg.rate}" aria-label="${t('perMin')}">
      <button class="x-btn" data-f="del" aria-label="✕">✕</button></div>`,
      )
      .join('') + (state.targets.length ? `<p class="note mb-2 mt-0">${t('perMinNote')}</p>` : '');
}

// ---------------- settings ----------------

const settingEls = () => document.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-setting]');

/** Put the state values into the settings controls. */
export function syncSettings(): void {
  settingEls().forEach((el) => {
    const k = el.dataset.setting as keyof State;
    if (el instanceof HTMLInputElement && el.type === 'checkbox') el.checked = !!state[k];
    else el.value = String(state[k]);
  });
  const anyBalancer = state.dist === 'balancer' || Object.values(state.distOv).includes('balancer');
  $('#balSmoothRow').hidden = !anyBalancer;
  document.querySelectorAll<HTMLElement>('[data-lang]').forEach((b) => b.classList.toggle('on', b.dataset.lang === state.lang));
}

export function bindSidebar(): void {
  document.querySelectorAll<HTMLElement>('[data-lang]').forEach(
    (b) =>
      (b.onclick = () => {
        state.lang = b.dataset.lang as Lang;
        refreshAll();
      }),
  );

  const targets = $('#targets');
  targets.addEventListener('input', (e) => {
    const el = e.target as HTMLInputElement | HTMLSelectElement;
    const row = el.closest<HTMLElement>('.trow');
    if (!row) return;
    const tg = state.targets[+row.dataset.row!];
    const f = el.dataset.f;
    if (f === 'item') tg.item = el.value;
    else if (f === 'rate') tg.rate = Math.max(0, parseFloat(String(el.value).replace(',', '.')) || 0);
    recompute({ fit: f === 'item' });
  });
  targets.addEventListener('click', (e) => {
    const el = e.target as HTMLElement;
    if (el.dataset.f !== 'del') return;
    state.targets.splice(+el.closest<HTMLElement>('.trow')!.dataset.row!, 1);
    renderTargets();
    recompute({ fit: true });
  });
  $('#addTarget').onclick = () => {
    state.targets.push({ item: 'reinforced-iron-plate', rate: 5 });
    renderTargets();
    recompute({ fit: true });
  };

  settingEls().forEach((el) => {
    el.addEventListener('change', () => {
      const k = el.dataset.setting as keyof State;
      const s = state as unknown as Record<string, unknown>;
      if (el instanceof HTMLInputElement && el.type === 'checkbox') s[k] = el.checked;
      else s[k] = 'num' in el.dataset ? Number(el.value) : el.value;
      if (k === 'snap') return saveState(state);
      syncSettings();
      recompute({ fit: k === 'floors' });
    });
  });

  $('#floorTabs').addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-fl]');
    if (!b) return;
    state.cur = +b.dataset.fl!;
    ctx.sel = null;
    renderMap();
    renderInfo();
    renderFloorTabs();
    saveState(state);
  });
}

export function renderFloorTabs(): void {
  const F = state.floors || 1;
  const el = $('#floorTabs');
  el.hidden = F < 2;
  if (F < 2) return;
  let h = `<span class="mr-0.5 text-xs text-muted">${t('floor')}</span>`;
  for (let i = F - 1; i >= 0; i--)
    h += `<button data-fl="${i}" class="floor-btn ${i === state.cur ? 'on' : ''}" title="${esc(flong(i))}">${fname(i)}</button>`;
  el.innerHTML = h;
}

// ---------------- overview ----------------

const li = (left: string, right: string) => `<li><span>${left}</span><span class="num">${right}</span></li>`;
const dot = (c: string) => `<span class="dot" style="background:${c}"></span>`;

export function renderOverview(): void {
  const { model } = ctx;
  const gs = model.groups;
  const machines = gs.filter((g) => g.kind === 'machine');
  const warn = $('#warn');
  warn.hidden = model.converged;
  warn.textContent = t('noConv');

  const power = gs.reduce((s, g) => s + g.power, 0);
  $('#sPower').textContent = fmtInt(power) + ' MW';
  $('#sMachines').textContent = String(machines.reduce((s, g) => s + g.count, 0));
  $('#sGroups').textContent = String(machines.length);
  const b = bounds(false);
  const F = state.floors || 1;
  $('#sArea').textContent = b
    ? `${Math.ceil((b.x1 - b.x0) / 8)} × ${Math.ceil((b.y1 - b.y0) / 8)}${F > 1 ? ' · ' + F + ' ' + t('floorsWord') : ''}`
    : '–';

  $('#rawList').innerHTML =
    gs
      .filter((g) => g.kind === 'source')
      .map((g) => {
        const ex = g.ex!;
        const how = Number.isFinite(ex.per)
          ? `${g.count}× ${esc(sourceName(g))} (${fmt(ex.per)}${unit(g.id)} ${t('each')}${ex.capped ? ', ' + t('cappedBy', ITEMS[g.id].fluid ? t('pipe') + state.pipe : t('belt') + state.belt) : ''})`
          : esc(sourceName(g));
        return li(`${dot(col(g.id))}${esc(itemName(g.id))}<br><span class="sub">${how} ${ex.noteKey ? t(ex.noteKey) : ''}</span>`, `${fmt(g.rate)}${unit(g.id)}`);
      })
      .join('') || `<li class="sub">${t('nothing')}</li>`;

  const left = Object.entries(model.left);
  $('#byWrap').hidden = !left.length;
  $('#byList').innerHTML = left
    .map(([k, v]) => {
      const dest = model.byKey['st:' + k]
        ? `→ ${t('storageCount')}`
        : model.byKey['k:sink']?.inputs.some((i) => i.item === k)
          ? '→ Sink'
          : '';
      return li(`${dot(col(k))}${esc(itemName(k))} <span class="sub">${dest}</span>`, `${fmt(v)}${unit(k)}`);
    })
    .join('');

  const cnt: Record<string, { n: number; c: string; size: string }> = {};
  for (const g of gs) {
    if (g.kind === 'source' || !g.bld) continue;
    const name = g.bld.n;
    cnt[name] ??= { n: 0, c: g.bld.c, size: `${g.bld.w}×${g.bld.l} m` };
    cnt[name].n += g.count;
  }
  const order = new Map(Object.values(BUILDINGS).map((b, i) => [b.n, i]));
  $('#bList').innerHTML =
    Object.entries(cnt)
      .sort((a, b) => (order.get(a[0]) ?? 99) - (order.get(b[0]) ?? 99))
      .map(([n, v]) => li(`${dot(v.c)}${esc(n)} <span class="sub">${v.size}</span>`, `${v.n}×`))
      .join('') || '<li class="sub">–</li>';

  const tot = { splitters: 0, mergers: 0, junctions: 0 };
  for (const g of gs) {
    const c = ctx.local[g.key]?.counts;
    if (!c) continue;
    tot.splitters += c.splitters;
    tot.mergers += c.mergers;
    tot.junctions += c.junctions;
  }
  const sink = model.byKey['k:sink'];
  $('#logList').innerHTML =
    li(`${t('splitters')} <span class="sub">4×4 m</span>`, `${tot.splitters}×`) +
    li(`${t('mergers')} <span class="sub">4×4 m</span>`, `${tot.mergers}×`) +
    (tot.junctions ? li(t('junctions'), `${tot.junctions}×`) : '') +
    li(t('beltTier'), `${t('belt')}${state.belt} · ${t('pipe')}${state.pipe}`) +
    (sink ? li(t('sinkPts'), `${fmtInt(sink.sinkPoints ?? 0)} ${t('pointsMin')}`) : '');
}
