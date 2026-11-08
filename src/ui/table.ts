import { $, ctx } from '../app/context';
import type { Group } from '../calc/model';
import { itemName } from '../data/items';
import { RECIPES } from '../data/recipes';
import { t } from '../i18n';
import { state } from '../state/store';
import { beltFor, col, esc, fmt, fmtInt, fname, pct, unit } from '../util/format';
import { groupTitle, sourceName } from './labels';

export function clockText(g: Group): string {
  if (!g.clocks.length) return '–';
  const first = g.clocks[0];
  if (g.clocks.every((c) => Math.abs(c - first) < 1e-6)) return `${g.count}× ${pct(first)}`;
  const last = g.clocks[g.count - 1];
  return `${g.count - 1}× ${pct(first)} + 1× ${pct(last)}`;
}

const dot = (c: string) => `<span class="dot" style="background:${c}"></span>`;

export function renderTable(): void {
  const { model } = ctx;
  const F = state.floors || 1;
  const rank = (g: Group) => (g.kind === 'machine' ? model.depth(g.id) : g.kind === 'source' ? -1 : 999);
  const gs = model.groups.slice().sort((a, b) => rank(b) - rank(a));
  const el = $('#tableView');
  if (!gs.length) {
    el.innerHTML = `<p class="note">${t('empty')}</p>`;
    return;
  }
  const fc = (g: Group) => (F > 1 ? `<td class="n">${fname(state.pos[g.key]?.f || 0)}</td>` : '');
  let h = `<table class="data-table"><thead><tr><th>${t('thProduct')}</th><th class="n">${t('thRate')}</th><th>${t('thBuilding')}</th><th class="n">${t('thCount')}</th><th>${t('thClock')}</th><th>${t('thInput')}</th><th>${t('thBelts')}</th><th class="n">${t('thPower')}</th>${F > 1 ? `<th class="n">${t('thFloor')}</th>` : ''}</tr></thead><tbody>`;
  for (const g of gs) {
    if (g.kind === 'source') {
      h += `<tr class="text-[#c9d3dd]"><td>${dot(col(g.id))}${esc(itemName(g.id))}</td><td class="n">${fmt(g.rate)}${unit(g.id)}</td><td>${esc(sourceName(g))}</td><td class="n">${Number.isFinite(g.ex!.per) ? g.count : '–'}</td><td>–</td><td>${t('rawWord')}</td><td>${beltFor(g.rate, g.id)}</td><td class="n">${fmt(g.power)} MW</td>${fc(g)}</tr>`;
      continue;
    }
    const inputs = g.inputs.map((i) => `${fmt(i.rate)}${unit(i.item)} ${esc(itemName(i.item))}`).join('<br>') || '–';
    const belts = g.inputs.map((i) => beltFor(i.rate, i.item)).join('<br>') || '–';
    if (g.kind !== 'machine') {
      const what = g.kind === 'sink' ? `${fmtInt(g.sinkPoints ?? 0)} ${t('pointsMin')}` : t('storageBlock');
      h += `<tr class="text-muted"><td>${g.kind === 'sink' ? '' : dot(col(g.id))}${esc(groupTitle(g))}<br><span class="text-xs">${what}</span></td><td class="n">${fmt(g.rate)}${g.id ? unit(g.id) : '/min'}</td><td>${esc(g.bld!.n)}</td><td class="n">${g.count}</td><td>–</td><td>${inputs}</td><td>${belts}</td><td class="n">${fmt(g.power)} MW</td>${fc(g)}</tr>`;
      continue;
    }
    const multi = RECIPES[g.id].length > 1;
    const extra = g.outputs
      .slice(1)
      .map((o) => `<br><span class="text-muted">+ ${fmt(o.rate)}${unit(o.item)} ${esc(itemName(o.item))}</span>`)
      .join('');
    const recName = multi
      ? `<br><span class="text-xs ${g.rec!.alt ? 'text-accent2' : 'text-muted'}">${g.rec!.alt ? 'ALT · ' : ''}${esc(g.rec!.name)}</span>`
      : '';
    const dist = g.dist === 'balancer' ? ` <span class="badge">BAL</span>` : '';
    h += `<tr><td>${dot(col(g.id))}${esc(itemName(g.id))}${dist}${recName}</td><td class="n">${fmt(g.rate)}${unit(g.id)}${extra}</td><td>${g.bld!.n}</td><td class="n">${g.count} <span class="text-muted">(${fmt(g.exact)})</span></td><td>${clockText(g)}</td><td>${inputs}</td><td>${belts}</td><td class="n">${g.bld!.v ? t('avg') + ' ' : ''}${fmt(Math.round(g.power * 10) / 10)} MW</td>${fc(g)}</tr>`;
  }
  el.innerHTML = h + '</tbody></table>';
}
