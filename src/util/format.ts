import { isFluid } from '../data/items';
import { BELTS, PIPES } from '../data/logistics';
import type { ItemId } from '../data/types';
import { t } from '../i18n';
import { state } from '../state/store';

let cached: { lang: string; nf: Intl.NumberFormat } | null = null;
const nf = (): Intl.NumberFormat => {
  if (cached?.lang !== state.lang)
    cached = { lang: state.lang, nf: new Intl.NumberFormat(state.lang === 'en' ? 'en-US' : 'nl-NL', { maximumFractionDigits: 2 }) };
  return cached.nf;
};

/** Locale-aware number (max. 2 decimals). */
export const fmt = (x: number): string => nf().format(Math.abs(x) < 1e-9 ? 0 : x);
export const fmtInt = (x: number): string => nf().format(Math.round(x));
export const pct = (c: number): string => nf().format(Math.round(c * 1000) / 10) + '%';
export const unit = (id: ItemId): string => (isFluid(id) ? ' m³/min' : '/min');

export const esc = (s: unknown): string =>
  String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

function hue(id: string): number {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}
export { hue };

/** Stable colour per item; fluids in blue tones. */
export function col(id: ItemId): string {
  if (isFluid(id)) return `hsl(${195 + (hue(id) % 5) * 8} 70% 62%)`;
  return `hsl(${(hue(id) * 47) % 360} 62% 62%)`;
}

/** Belt/pipe needed for a flow, limited to the highest tier the player uses. */
export function beltFor(rate: number, item: ItemId): string {
  const fluid = isFluid(item);
  const max = fluid ? state.pipe : state.belt;
  const caps = (fluid ? PIPES : BELTS).slice(0, max);
  const nm = fluid ? t('pipe') : t('belt');
  for (let i = 0; i < caps.length; i++) if (rate <= caps[i] + 1e-6) return nm + (i + 1);
  return `${Math.ceil(rate / caps[caps.length - 1] - 1e-9)}× ${nm}${caps.length}`;
}

export function duration(min: number): string {
  if (!Number.isFinite(min)) return '∞';
  return min >= 90 ? t('hours', fmt(Math.round((min / 60) * 10) / 10)) : t('minutes', fmtInt(min));
}

export const fname = (i: number): string => (i === 0 ? t('ground') : String(i));
export const flong = (i: number): string => (i === 0 ? t('groundLong') : t('floorN', i));
