/** "My recipes": tick which alternates are unlocked; the planner picks the best one automatically. */
import { $, ctx } from '../app/context';
import { effectiveRc, recompute } from '../app/controller';
import { isAvailable } from '../calc/optimize';
import { chosenRecipe, recipeSummary } from '../calc/recipes';
import { ITEMS } from '../data/items';
import { RECIPES } from '../data/recipes';
import { t } from '../i18n';
import { state } from '../state/store';
import { col, esc, fmt } from '../util/format';

export const isRecModalOpen = (): boolean => !$('#recModal').hidden;

const allAlternates = () => Object.values(RECIPES).flat().filter((r) => r.alt);

export function renderRecBtn(): void {
  const alts = allAlternates();
  const n = alts.filter((r) => state.unlocked[r.name]).length;
  $('#btnRec').innerHTML = esc(t('recipesBtn')) + ` <span class="badge">${n}/${alts.length} ALT</span>`;
}

export function renderRecList(): void {
  const q = $<HTMLInputElement>('#recSearch').value.trim().toLowerCase();
  const only = $<HTMLInputElement>('#recUsed').checked;
  const inUse = new Set(ctx.model.groups.filter((g) => g.kind === 'machine').map((g) => g.id));
  const rc = effectiveRc();
  const ids = Object.keys(RECIPES)
    .filter((id) => RECIPES[id].some((r) => r.alt))
    .filter((id) => !only || inUse.has(id))
    .filter((id) => !q || ITEMS[id].n.toLowerCase().includes(q) || RECIPES[id].some((r) => r.name.toLowerCase().includes(q)))
    .sort((a, b) => ITEMS[a].n.localeCompare(ITEMS[b].n));
  const box = $('#recList');
  const st = box.scrollTop;
  box.innerHTML =
    ids
      .map((id) => {
        const cur = inUse.has(id) ? chosenRecipe(id, rc) : null;
        const manual = !!state.rc[id];
        const head = `<h4 class="mb-1.5 flex flex-wrap items-center gap-2 font-head text-base tracking-wide"><span class="dot" style="background:${col(id)}"></span>${esc(ITEMS[id].n)}${
          cur ? `<span class="font-sans text-xs font-normal text-muted">· ${t('inUse')}: ${esc(cur.name)} (${t(manual ? 'manualTag' : 'autoTag')})</span>` : ''
        }${manual ? `<button class="btn btn-sm ml-auto font-sans" data-reset="${id}">${t('backToAuto')}</button>` : ''}</h4>`;
        const rows = RECIPES[id]
          .map((r) => {
            const on = isAvailable(r, state.unlocked);
            const used = cur === r ? ` <span class="text-xs text-accent2">● ${t('inUse')}</span>` : '';
            return `<label class="ropt"><input type="checkbox" data-name="${esc(r.name)}"${on ? ' checked' : ''}${r.alt ? '' : ' disabled'}><span><b class="font-semibold">${esc(r.name)}</b>${r.alt ? '<span class="badge">ALT</span>' : ` <span class="text-xs text-muted">· ${t('standard')}</span>`}${used}</span><small>${esc(recipeSummary(r, fmt))}</small></label>`;
          })
          .join('');
        return `<div class="border-b border-line px-3 py-2.5 last:border-b-0">${head}${rows}</div>`;
      })
      .join('') || `<p class="note p-3">${t('noMatch')}</p>`;
  box.scrollTop = st;
}

function changed(): void {
  recompute();
  renderRecBtn();
  renderRecList();
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
    const name = el.dataset.name;
    if (!name) return;
    if (el.checked) state.unlocked[name] = true;
    else delete state.unlocked[name];
    changed();
  });
  $('#recList').addEventListener('click', (e) => {
    const id = (e.target as HTMLElement).dataset.reset;
    if (!id) return;
    e.preventDefault();
    delete state.rc[id];
    changed();
  });
  $('#recAllOn').onclick = () => {
    for (const r of allAlternates()) state.unlocked[r.name] = true;
    changed();
  };
  $('#recAllOff').onclick = () => {
    state.unlocked = {};
    changed();
  };
  $('#recStd').onclick = () => {
    state.rc = {};
    changed();
  };
  $('#recDone').onclick = () => (modal.hidden = true);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.hidden = true;
  });
}
