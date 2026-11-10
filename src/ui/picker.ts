/**
 * Item pickers in the sidebar: "What do you want to make?" (targets) and "External supply".
 * Selected items with their rate on top, below a search field and an alphabetical checkbox list.
 */
import { $ } from '../app/context';
import { planChanged } from '../app/controller';
import { ITEMS } from '../data/items';
import { RECIPES } from '../data/recipes';
import type { ItemId } from '../data/types';
import { t } from '../i18n';
import { state } from '../state/store';
import type { Target } from '../state/types';
import { col, esc, unit } from '../util/format';

type Kind = 'targets' | 'external';

const listOf = (k: Kind): Target[] => state[k];
const itemsFor = (k: Kind): ItemId[] =>
  (k === 'targets' ? Object.keys(RECIPES) : Object.keys(ITEMS)).sort((a, b) => ITEMS[a].n.localeCompare(ITEMS[b].n));
const DEFAULT_RATE: Record<Kind, number> = { targets: 10, external: 60 };

function renderSelected(k: Kind): void {
  const list = listOf(k);
  $(`#${k} [data-sel]`).innerHTML = list.length
    ? list
        .map(
          (tg, i) => `<div class="trow" data-row="${i}">
        <span class="truncate text-[13px]" title="${esc(ITEMS[tg.item].n)}"><span class="dot" style="background:${col(tg.item)}"></span>${esc(ITEMS[tg.item].n)}</span>
        <input type="number" data-f="rate" min="0" step="any" value="${tg.rate}" aria-label="${t('perMin')}" title="${unit(tg.item).trim()}">
        <button class="x-btn" data-f="del" aria-label="✕">✕</button></div>`,
        )
        .join('')
    : `<p class="note mt-0 mb-2">${t(k === 'targets' ? 'nothing' : 'noExternal')}</p>`;
}

function renderOptions(k: Kind): void {
  const q = $<HTMLInputElement>(`#${k} [data-search]`).value.trim().toLowerCase();
  const sel = new Set(listOf(k).map((x) => x.item));
  const ids = itemsFor(k).filter((id) => !q || ITEMS[id].n.toLowerCase().includes(q));
  $(`#${k} [data-opts]`).innerHTML =
    ids
      .map(
        (id) =>
          `<label class="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-[13px] hover:bg-panel2"><input type="checkbox" class="size-4 accent-accent" data-item="${id}"${sel.has(id) ? ' checked' : ''}><span class="dot" style="background:${col(id)}"></span>${esc(ITEMS[id].n)}</label>`,
      )
      .join('') || `<p class="note p-2">${t('noMatch')}</p>`;
}

/** Re-render both pickers (keeps the search text). */
export function renderTargets(): void {
  for (const k of ['targets', 'external'] as Kind[]) {
    $(`#${k} [data-search]`).setAttribute('placeholder', t('searchItem'));
    renderSelected(k);
    renderOptions(k);
  }
}

export function bindPickers(): void {
  for (const k of ['targets', 'external'] as Kind[]) {
    const root = $(`#${k}`);
    root.innerHTML = `<div data-sel></div>
      <input type="search" data-search class="input mt-1 w-full">
      <div data-opts class="mt-1.5 max-h-56 overflow-auto rounded-md border border-line p-1"></div>`;
    root.querySelector('[data-search]')!.addEventListener('input', () => renderOptions(k));
    root.addEventListener('input', (e) => {
      const el = e.target as HTMLInputElement;
      if (el.dataset.f !== 'rate') return;
      const row = el.closest<HTMLElement>('.trow')!;
      listOf(k)[+row.dataset.row!].rate = Math.max(0, parseFloat(String(el.value).replace(',', '.')) || 0);
      planChanged();
    });
    root.addEventListener('click', (e) => {
      const el = e.target as HTMLElement;
      if (el.dataset.f !== 'del') return;
      listOf(k).splice(+el.closest<HTMLElement>('.trow')!.dataset.row!, 1);
      renderSelected(k);
      renderOptions(k);
      planChanged({ fit: true });
    });
    root.addEventListener('change', (e) => {
      const el = e.target as HTMLInputElement;
      const id = el.dataset.item;
      if (!id) return;
      const list = listOf(k);
      if (el.checked) list.push({ item: id, rate: DEFAULT_RATE[k] });
      else list.splice(list.findIndex((x) => x.item === id), 1);
      renderSelected(k);
      planChanged({ fit: true });
    });
  }
}
