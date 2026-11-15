/** Who takes the output of a block: belts to other blocks and the end product. */
import { ctx } from '../app/context';
import { suppliers } from '../calc/model';
import { itemName } from '../data/items';
import { t } from '../i18n';
import { groupTitle } from './labels';

/** Everything one block delivers of an item: belts to other blocks and the end product. */
export function takersOf(from: string, item: string): { key: string; name: string; rate: number }[] {
  const out: { key: string; name: string; rate: number }[] = [];
  for (const [k, c] of Object.entries(ctx.conns)) {
    if (!k.startsWith(`${from}>`) || !k.endsWith(`|${item}`)) continue;
    const g = ctx.model.byKey[k.split('>')[1].split('|')[0]];
    out.push({ key: k, name: g ? (g.kind === 'machine' ? itemName(g.id) : groupTitle(g)) : k, rate: c.rate });
  }
  const target = ctx.model.targets[item] ?? 0;
  if (target > 1e-6) {
    const share = suppliers(ctx.model, item).find((s) => s.g.key === from)?.share ?? 0;
    if (share * target > 1e-6) out.push({ key: '*target', name: `★ ${t('endProduct')}`, rate: share * target });
  }
  return out;
}

