/** Power page: list of generators (type, fuel, MW or count) and page switching. */
import { $, ctx } from '../app/context';
import { planChanged, refreshAll } from '../app/controller';
import { GENERATORS, genFuel, type GenId } from '../data/generators';
import { itemName } from '../data/items';
import { t } from '../i18n';
import { state, switchPage } from '../state/store';
import type { Page } from '../state/types';
import { esc, fmt, unit } from '../util/format';

export function renderGens(): void {
  $('#gens').innerHTML =
    state.gens
      .map((g, i) => {
        const G = GENERATORS[g.gen];
        const f = genFuel(g.gen, g.fuel);
        const exact = g.mode === 'mw' ? g.value / G.mw : g.value;
        return `<div class="mb-2 rounded-lg border border-line bg-panel2/50 p-2" data-gen="${i}">
          <div class="mb-1.5 grid grid-cols-[1fr_28px] gap-1.5">
            <select data-f="gen">${Object.values(GENERATORS).map((x) => `<option value="${x.id}"${x.id === g.gen ? ' selected' : ''}>${esc(x.n)} · ${fmt(x.mw)} MW</option>`).join('')}</select>
            <button class="x-btn" data-f="del" aria-label="✕">✕</button></div>
          <div class="grid grid-cols-[1fr_70px_74px] gap-1.5">
            <select data-f="fuel">${G.fuels.map((x) => `<option value="${x.item}"${x.item === f.item ? ' selected' : ''}>${esc(itemName(x.item))}</option>`).join('')}</select>
            <input type="number" data-f="value" min="0" step="any" value="${g.value}">
            <select data-f="mode"><option value="count"${g.mode === 'count' ? ' selected' : ''}>${t('genCount')}</option><option value="mw"${g.mode === 'mw' ? ' selected' : ''}>MW</option></select>
          </div>
          <p class="note mt-1.5">${fmt(exact * G.mw)} MW · ${fmt(f.rate * exact)}${unit(f.item)} ${esc(itemName(f.item))}${G.water ? ` · ${fmt(G.water * exact)} m³/min Water` : ''}</p>
        </div>`;
      })
      .join('') || `<p class="note mt-0 mb-2">${t('nothing')}</p>`;
}

export function renderPage(): void {
  document.querySelectorAll<HTMLElement>('[data-page]').forEach((el) => (el.hidden = el.dataset.page !== state.page));
  document.querySelectorAll<HTMLElement>('[data-pagebtn]').forEach((b) => b.classList.toggle('on', b.dataset.pagebtn === state.page));
}

export function bindPower(): void {
  document.querySelectorAll<HTMLElement>('[data-pagebtn]').forEach(
    (b) =>
      (b.onclick = () => {
        switchPage(b.dataset.pagebtn as Page);
        ctx.sel = null;
        refreshAll({ fit: true });
      }),
  );
  const root = $('#gens');
  const upd = (e: Event, full: boolean) => {
    const el = e.target as HTMLInputElement | HTMLSelectElement;
    const row = el.closest<HTMLElement>('[data-gen]');
    if (!row || !el.dataset.f) return;
    const g = state.gens[+row.dataset.gen!];
    if (el.dataset.f === 'gen') {
      g.gen = el.value as GenId;
      g.fuel = GENERATORS[g.gen].fuels[0].item;
    } else if (el.dataset.f === 'fuel') g.fuel = el.value;
    else if (el.dataset.f === 'mode') g.mode = el.value as 'mw' | 'count';
    else if (el.dataset.f === 'value') g.value = Math.max(0, parseFloat(String(el.value).replace(',', '.')) || 0);
    if (full) renderGens();
    planChanged({ fit: full });
  };
  root.addEventListener('change', (e) => upd(e, (e.target as HTMLElement).tagName === 'SELECT'));
  root.addEventListener('input', (e) => {
    if ((e.target as HTMLElement).dataset.f === 'value') upd(e, false);
  });
  root.addEventListener('click', (e) => {
    const el = e.target as HTMLElement;
    if (el.dataset.f !== 'del') return;
    state.gens.splice(+el.closest<HTMLElement>('[data-gen]')!.dataset.gen!, 1);
    renderGens();
    planChanged({ fit: true });
  });
  $('#addGen').onclick = () => {
    state.gens.push({ gen: 'fuel', fuel: 'fuel', mode: 'count', value: 4 });
    renderGens();
    planChanged({ fit: true });
  };
}
