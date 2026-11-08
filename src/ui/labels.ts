import type { Group } from '../calc/model';
import { itemName } from '../data/items';
import { t } from '../i18n';

/** Display name of a group (production line, source, sink, storage). */
export function groupTitle(g: Group): string {
  if (g.kind === 'sink') return 'AWESOME Sink';
  return itemName(g.id);
}

export function sourceName(g: Group): string {
  const ex = g.ex!;
  return ex.nameKey ? t(ex.nameKey) : ex.name;
}
