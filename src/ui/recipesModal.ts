import { $, ctx } from '../app/context';
import { recompute } from '../app/controller';
import { altCount, chosenRecipe, recipeSummary } from '../calc/recipes';
import { ITEMS } from '../data/items';
import { RECIPES } from '../data/recipes';
import { t } from '../i18n';
import { state } from '../state/store';
import { col, esc, fmt } from '../util/format';

export const isRecModalOpen = (): boolean => !$('#recModal').hidden;

export function renderRecBtn(): void {
  const n = altCount(state.rc);
  $('#btnRec').innerHTML = esc(t('recipesBtn')) + (n ? ` <span class="badge">${n} ALT</span>` : '');
}

export function renderRecList(): void {
  const q = $<HTMLInputElement>('#recSearch').value.trim().toLowerCase();
  const only = $<HTMLInputElement>('#recUsed').checked;
  const inUse = new Set(ctx.model.groups.filter((g) => g.kind === 'machine').map((g) => g.id));
  const ids = Object.keys(RECIPES)
    .filter((id) => RECIPES[id].length > 1)
    .filter((id) => !only || inUse.has(id) || chosenRecipe(id, state.rc)!.alt)
    .filter((id) => !q || ITEMS[id].n.toLowerCase().includes(q) || RECIPES[id].some((r) => r.name.toLowerCase().includes(q)))
    .sort((a, b) => ITEMS[a].n.localeCompare(ITEMS[b].n));
  const box = $('#recList');
  const st = box.scrollTop;
  box.innerHTML =
    ids
      .map((id) => {
        const cur = chosenRecipe(id, state.rc)!;
        return (
          `<div class="border-b border-line px-3 py-2.5 last:border-b-0"><h4 class="mb-1.5 flex items-center gap-2 font-head text-base tracking-wide"><span class="dot" style="background:${col(id)}"></span>${esc(ITEMS[id].n)}${cur.alt ? '<span class="badge">ALT</span>' : ''}</h4>` +
          RECIPES[id]
            .map(
              (r) =>
                `<label class="ropt"><input type="radio" name="r-${id}" data-id="${id}" value="${esc(r.name)}"${r === cur ? ' checked' : ''}><span><b class="font-semibold">${esc(r.name)}</b>${r.alt ? '<span class="badge">ALT</span>' : ` <span class="text-xs text-muted">· ${t('standard')}</span>`}</span><small>${esc(recipeSummary(r, fmt))}</small></label>`,
            )
            .join('') +
          '</div>'
        );
      })
      .join('') || `<p class="note p-3">${t('noMatch')}</p>`;
  box.scrollTop = st;
}

export function bindRecipesModal(): void {
  const modal = $('#recModal');
  const search = $<HTMLInputElement>('#recSearch');
  $('#btnRec').onclick = () => {
    search.placeholder = t('recSearch');
    renderRecList();
    modal.hidden = false;
    search.focus();
  };
  search.addEventListener('input', renderRecList);
  $('#recUsed').onchange = renderRecList;
  $('#recList').addEventListener('change', (e) => {
    const el = e.target as HTMLInputElement;
    const id = el.dataset.id;
    if (!id) return;
    const r = RECIPES[id].find((x) => x.name === el.value);
    if (r && !r.alt && RECIPES[id].indexOf(r) === 0) delete state.rc[id];
    else state.rc[id] = el.value;
    recompute();
    renderRecBtn();
    renderRecList();
  });
  $('#recStd').onclick = () => {
    state.rc = {};
    recompute();
    renderRecBtn();
    renderRecList();
  };
  $('#recDone').onclick = () => (modal.hidden = true);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.hidden = true;
  });
}
