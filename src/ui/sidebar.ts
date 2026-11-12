import { $, ctx } from '../app/context';
import { planChanged, planNow, recompute, refreshAll } from '../app/controller';
import { BUILDINGS } from '../data/buildings';
import { ITEMS, itemName } from '../data/items';
import { t } from '../i18n';
import { bounds, renderMap } from '../render/map';
import { saveState, state } from '../state/store';
import type { Lang, State } from '../state/types';
import { col, esc, fmt, fmtInt, flong, fname, unit } from '../util/format';
import { suppliers } from '../calc/model';
import { pumpsFor } from '../calc/pumps';
import { isFluid } from '../data/items';
import { FLOOR_H } from '../layout/powerNet';
import { renderInfo } from './info';
import { sourceName } from './labels';

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
  $('#btnPlan').onclick = () => planNow();
  document.querySelectorAll<HTMLElement>('[data-lang]').forEach(
    (b) =>
      (b.onclick = () => {
        state.lang = b.dataset.lang as Lang;
        refreshAll();
      }),
  );

  settingEls().forEach((el) => {
    el.addEventListener('change', () => {
      const k = el.dataset.setting as keyof State;
      const s = state as unknown as Record<string, unknown>;
      if (el instanceof HTMLInputElement && el.type === 'checkbox') s[k] = el.checked;
      else s[k] = 'num' in el.dataset ? Math.max(0, Number(el.value) || 0) : el.value;
      if (k === 'snap') return saveState(state);
      syncSettings();
      // only drawing / behaviour settings apply at once; everything else waits for "Plan layout"
      if (k === 'showWires' || k === 'autoPlan') return recompute();
      planChanged({ fit: k === 'floors' });
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
  const msgs = [model.converged ? '' : t('noConv'), ctx.fits ? '' : t('noFit', state.floors, `${state.floorW || '∞'} × ${state.floorL || '∞'}`)].filter(Boolean);
  warn.hidden = !msgs.length;
  warn.textContent = msgs.join(' ');

  const power = gs.reduce((s, g) => s + g.power, 0);
  const gen = gs.reduce((s, g) => s + (g.gen ?? 0), 0);
  $('#sPower').textContent = fmtInt(power) + ' MW';
  $('#genStat').hidden = $('#netStat').hidden = !gen;
  $('#sGen').textContent = fmtInt(gen) + ' MW';
  $('#sNet').textContent = (gen - power >= 0 ? '+' : '') + fmtInt(gen - power) + ' MW';
  $('#sMachines').textContent = String(gs.filter((g) => g.kind === 'machine' || g.kind === 'generator').reduce((s, g) => s + g.count, 0));
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

  const tot = { splitters: 0, mergers: 0, junctions: 0, poles: 0, wires: 0 };
  for (const g of gs) {
    const c = ctx.local[g.key]?.counts;
    if (!c) continue;
    tot.splitters += c.splitters;
    tot.mergers += c.mergers;
    tot.junctions += c.junctions;
    tot.poles += c.poles;
    tot.wires += c.wires;
  }
  const net = ctx.net;
  // pumps: fluids going up between floors (head lift)
  let pumps1 = 0;
  let pumps2 = 0;
  for (const g of gs)
    for (const i of g.inputs) {
      if (!isFluid(i.item)) continue;
      const fTo = state.pos[g.key]?.f ?? 0;
      for (const sp of suppliers(model, i.item)) {
        const fFrom = state.pos[sp.g.key]?.f ?? 0;
        if (fTo <= fFrom) continue;
        const p = pumpsFor((fTo - fFrom) * (state.floorH || FLOOR_H), i.item);
        pumps1 += p.mk1;
        pumps2 += p.mk2;
      }
    }
  const sink = model.byKey['k:sink'];
  $('#logList').innerHTML =
    li(`${t('splitters')} <span class="sub">4×4 m</span>`, `${tot.splitters}×`) +
    li(`${t('mergers')} <span class="sub">4×4 m</span>`, `${tot.mergers}×`) +
    (tot.junctions ? li(t('junctions'), `${tot.junctions}×`) : '') +
    (pumps1 ? li(`Pipeline Pump Mk1 <span class="sub">${t('pumpsOr', pumps2)}</span>`, `${pumps1}×`) : '') +
    li(`Power Pole Mk${state.pole}${net.extraPoles ? ` <span class="sub">${t('polesExtra', net.extraPoles)}</span>` : ''}`, `${tot.poles + net.extraPoles}×`) +
    li(`${t('powerLines')} <span class="sub">${t('wireLen', fmtInt(net.length))}</span>`, `${tot.wires + net.wires}×`) +
    li(t('beltTier'), `${t('belt')}${state.belt} · ${t('pipe')}${state.pipe}`) +
    (sink ? li(t('sinkPts'), `${fmtInt(sink.sinkPoints ?? 0)} ${t('pointsMin')}`) : '');
}
