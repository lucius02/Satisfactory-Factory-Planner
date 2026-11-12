/** Legend in the bottom right corner of the floor plan: what the symbols on the map mean. */
import { $ } from '../app/context';
import { t, type TextKey } from '../i18n';

const KEY = 'sf-legend-open';
const BELT = '#a3c86a';
const PIPE = '#5aa9e6';
const AMBER = '#ffb85c';

/** Small 34 × 18 SVG sample per entry, drawn like on the map. */
const SAMPLES: [TextKey, string][] = [
  ['lgBelt', `<path d="M2 9H32" stroke="#12151a" stroke-width="5"/><path d="M2 9H32" stroke="${BELT}" stroke-width="2.4"/>`],
  ['lgPipe', `<path d="M2 9H32" stroke="#12151a" stroke-width="5"/><path d="M2 9H32" stroke="${PIPE}" stroke-width="2.4" stroke-dasharray="5 2.5"/>`],
  ['lgParallel', `<path d="M2 5H32M2 13H32" stroke="${PIPE}" stroke-width="2" stroke-dasharray="5 2.5"/>`],
  ['lgSplitter', `<path d="M2 9H32" stroke="${BELT}" stroke-width="2"/><rect x="10" y="2" width="14" height="14" rx="2" fill="#1a1f25" stroke="${BELT}" stroke-width="1.2"/><text x="17" y="13" font-size="9" text-anchor="middle" fill="${BELT}" font-family="JetBrains Mono,monospace">S</text>`],
  ['lgMerger', `<path d="M2 9H32" stroke="${BELT}" stroke-width="2"/><rect x="10" y="2" width="14" height="14" rx="5" fill="#1a1f25" stroke="${BELT}" stroke-width="1.2"/><text x="17" y="13" font-size="9" text-anchor="middle" fill="${BELT}" font-family="JetBrains Mono,monospace">M</text>`],
  ['lgJunction', `<path d="M2 9H32" stroke="${PIPE}" stroke-width="2" stroke-dasharray="5 2.5"/><path d="M17 3L23 9L17 15L11 9z" fill="${PIPE}" stroke="#0d0f12" stroke-width=".8"/><path d="M14 9H20M17 6V12" stroke="#0d0f12" stroke-width="1.1"/>`],
  ['lgLoop', `<path d="M3 13H31" stroke="${PIPE}" stroke-width="2" stroke-dasharray="5 2.5"/><path d="M3 13V4H31V13" fill="none" stroke="${PIPE}" stroke-width="1.2" stroke-dasharray="3 2"/>`],
  ['lgArrow', `<path d="M2 9H26" stroke="${BELT}" stroke-width="2"/><path d="M24 4L32 9L24 14z" fill="${BELT}"/>`],
  ['lgHandle', `<path d="M2 9H32" stroke="${BELT}" stroke-width="2"/><circle cx="17" cy="9" r="4.5" fill="#0d0f12" stroke="${BELT}" stroke-width="1.4"/>`],
  ['lgPole', `<path d="M8 9L28 4M8 9L28 14" stroke="#ffd34d" stroke-width=".9"/><rect x="5" y="6" width="6" height="6" fill="#ffd34d" stroke="#0d0f12"/>`],
  ['lgPowerLine', `<path d="M3 9H31" stroke="#ffd34d" stroke-width="1.2" stroke-dasharray="4 2.5"/><rect x="14" y="6" width="6" height="6" fill="#fff1b3" stroke="#0d0f12"/>`],
  ['lgPump', `<path d="M2 9H32" stroke="${PIPE}" stroke-width="2" stroke-dasharray="5 2.5"/><circle cx="17" cy="9" r="6" fill="#14202a" stroke="${PIPE}" stroke-width="1.3"/><text x="17" y="12.5" font-size="9" text-anchor="middle" fill="${PIPE}" font-weight="700">P</text>`],
  ['lgLift', `<rect x="9" y="1" width="16" height="16" rx="2" fill="#2a2214" stroke="${AMBER}" stroke-width="1.2"/><text x="17" y="13.5" font-size="11" text-anchor="middle" fill="${AMBER}" font-weight="700">↑</text>`],
  ['lgEnd', `<path d="M17 1V11" stroke="${AMBER}" stroke-width="2.2"/><path d="M12 10L17 17L22 10z" fill="${AMBER}"/>`],
  ['lgSurplus', `<path d="M17 1V11" stroke="#9aa3ad" stroke-width="2.2"/><path d="M12 10L17 17L22 10z" fill="#9aa3ad"/>`],
  ['lgBlock', `<rect x="2" y="2" width="30" height="14" rx="1.5" fill="#1f252d" stroke="#55606d" stroke-dasharray="3 2"/><text x="30" y="13.5" font-size="6" text-anchor="end" fill="#8e939b" font-family="JetBrains Mono,monospace">2×1</text>`],
  ['lgOverlap', `<rect x="2" y="2" width="30" height="14" rx="1.5" fill="#2b1d1f" stroke="#e5534b" stroke-width="1.4"/>`],
  ['lgFloor', `<rect x="2" y="2" width="30" height="14" fill="none" stroke="#f29b30" stroke-dasharray="6 3"/>`],
  ['lgWarn', `<path d="M2 9H32" stroke="${PIPE}" stroke-width="2" stroke-dasharray="5 2.5"/><text x="17" y="14" font-size="12" text-anchor="middle" fill="${AMBER}">⚠</text>`],
];

function isOpen(): boolean {
  try {
    return localStorage.getItem(KEY) !== '0';
  } catch {
    return true;
  }
}

export function renderLegend(): void {
  const el = $('#legend');
  const open = isOpen();
  el.innerHTML = `<button class="flex w-full cursor-pointer items-center justify-between gap-3 border-0 bg-transparent p-0 font-head text-sm font-semibold uppercase tracking-wider text-muted" data-legend-toggle aria-expanded="${open}">
      <span>${t('legendH')}</span><span class="text-xs">${open ? '▾' : '▸'}</span></button>
    ${
      open
        ? `<ul class="m-0 mt-2 grid list-none grid-cols-1 gap-1 p-0 sm:grid-cols-2">${SAMPLES.map(
            ([k, svg]) =>
              `<li class="flex items-center gap-2 text-[12px] leading-tight"><svg viewBox="0 0 34 18" width="34" height="18" class="flex-none" fill="none" aria-hidden="true">${svg}</svg><span>${t(k)}</span></li>`,
          ).join('')}</ul>`
        : ''
    }`;
}

export function bindLegend(): void {
  $('#legend').addEventListener('click', (e) => {
    if (!(e.target as HTMLElement).closest('[data-legend-toggle]')) return;
    try {
      localStorage.setItem(KEY, isOpen() ? '0' : '1');
    } catch {
      /* ignore */
    }
    renderLegend();
  });
  renderLegend();
}
