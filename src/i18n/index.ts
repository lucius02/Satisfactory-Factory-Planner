import { state } from '../state/store';
import { L10N, type TextKey } from './texts';

export type { TextKey };

/** Translate a key; `{0}`, `{1}`, … are replaced by `args`. */
export function t(key: TextKey, ...args: (string | number)[]): string {
  let s: string = (L10N[state.lang] ?? L10N.nl)[key] ?? L10N.nl[key] ?? key;
  args.forEach((a, i) => (s = s.replace(`{${i}}`, String(a))));
  return s;
}

/** Fill all static elements with `data-i="key"`. */
export function applyStaticTexts(root: ParentNode = document): void {
  document.documentElement.lang = state.lang;
  root.querySelectorAll<HTMLElement>('[data-i]').forEach((el) => {
    const k = el.dataset.i as TextKey;
    if (k === 'brandA') el.innerHTML = t(k);
    else el.textContent = t(k);
  });
  document.title = 'Satisfactory Factory Planner';
}
