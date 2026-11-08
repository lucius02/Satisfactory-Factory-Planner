import { ITEMS } from '../data/items';
import type { ItemId } from '../data/types';
import type { TextKey } from '../i18n/texts';

export interface Extractor {
  /** Building name (English) or a text key for generic sources. */
  name: string;
  nameKey?: TextKey;
  /** Output per extractor per minute (after the belt/pipe limit). */
  per: number;
  mw: number;
  noteKey?: TextKey;
  /** True when the output was limited by the belt/pipe tier. */
  capped?: boolean;
}

export interface ExtractorSettings {
  miner: 1 | 2 | 3;
  purity: 0 | 1 | 2;
  beltCap: number;
  pipeCap: number;
}

const PURITY = [0.5, 1, 2];
const MINER_RATE = [60, 120, 240];
const MINER_MW = [5, 15, 45];

/** Extractor for a raw resource (values from satisfactory.wiki.gg, 100% clock). */
export function extractorFor(id: ItemId, s: ExtractorSettings): Extractor {
  const pur = PURITY[s.purity];
  let ex: Extractor;
  if (id === 'water') ex = { name: 'Water Extractor', per: 120, mw: 20 };
  else if (id === 'crude-oil') ex = { name: 'Oil Extractor', per: 120 * pur, mw: 40 };
  else if (id === 'nitrogen-gas') ex = { name: 'Resource Well Extractor', per: 60 * pur, mw: 0, noteKey: 'wellNote' };
  else if (id === 'uranium-waste') ex = { name: 'Nuclear Power Plant', nameKey: 'plant', per: 10, mw: 0 };
  else if (!ITEMS[id]?.raw) return { name: 'External supply', nameKey: 'external', per: Infinity, mw: 0 };
  else ex = { name: `Miner Mk${s.miner}`, per: MINER_RATE[s.miner - 1] * pur, mw: MINER_MW[s.miner - 1] };
  const cap = ITEMS[id]?.fluid ? s.pipeCap : s.beltCap;
  if (ex.per > cap) {
    ex.per = cap;
    ex.capped = true;
  }
  return ex;
}
