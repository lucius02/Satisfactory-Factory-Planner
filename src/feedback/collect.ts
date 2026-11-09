/** Collects what goes with a feedback report: recent errors, system info and a screenshot of the floor plan. */
import { ctx } from '../app/context';
import { state } from '../state/store';

const MAX_ERRORS = 50;
const errors: string[] = [];

const stamp = () => new Date().toISOString().slice(11, 19);
function remember(level: string, parts: unknown[]): void {
  const text = parts
    .map((p) => (p instanceof Error ? `${p.name}: ${p.message}${p.stack ? `\n${p.stack}` : ''}` : typeof p === 'string' ? p : safeJson(p)))
    .join(' ');
  errors.push(`[${stamp()}] ${level}: ${text}`.slice(0, 2000));
  if (errors.length > MAX_ERRORS) errors.shift();
}
function safeJson(x: unknown): string {
  try {
    return JSON.stringify(x);
  } catch {
    return String(x);
  }
}

/** Start recording console errors / warnings and uncaught errors (call once, early). */
export function startErrorLog(): void {
  for (const level of ['error', 'warn'] as const) {
    const orig = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      remember(level, args);
      orig(...args);
    };
  }
  window.addEventListener('error', (e) => remember('uncaught', [e.error ?? e.message]));
  window.addEventListener('unhandledrejection', (e) => remember('unhandled promise', [e.reason]));
}

export const recentErrors = (): string[] => [...errors];

/** App and system info. */
export function systemInfo(): Record<string, string | number | boolean> {
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  const m = ctx.model;
  return {
    version: __APP_VERSION__,
    app: '__TAURI_INTERNALS__' in window ? 'desktop (Tauri)' : 'browser',
    os: nav.userAgentData?.platform || navigator.platform || 'unknown',
    userAgent: navigator.userAgent,
    screen: `${screen.width}×${screen.height} @${devicePixelRatio}x`,
    window: `${innerWidth}×${innerHeight}`,
    language: state.lang,
    page: state.page,
    groups: m?.groups.length ?? 0,
    converged: m?.converged ?? true,
  };
}

/** Styles the SVG needs when it is drawn outside the page (classes from styles.css). */
const SVG_STYLE = `
text{font-family:Inter,Arial,sans-serif}
.grp{fill:#1f252d;fill-opacity:.82;stroke:#55606d;stroke-width:.25;stroke-dasharray:1 .6}
.gsel .grp{stroke:#f29b30;stroke-width:.45;stroke-dasharray:none}
.gbad .grp{stroke:#e5534b;stroke-width:.5;stroke-dasharray:none;fill:#2b1d1f}
.belt-handle{opacity:.55}`;

/** PNG (data URL) of the floor plan as it is on screen now; null when it fails. */
export async function screenshotMap(maxWidth = 1600): Promise<string | null> {
  const svg = document.getElementById('map') as SVGSVGElement | null;
  if (!svg) return null;
  const r = svg.getBoundingClientRect();
  if (!r.width || !r.height) return null;
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('width', String(r.width));
  clone.setAttribute('height', String(r.height));
  clone.setAttribute('viewBox', `0 0 ${r.width} ${r.height}`);
  const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
  style.textContent = SVG_STYLE;
  clone.insertBefore(style, clone.firstChild);
  const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  bg.setAttribute('width', '100%');
  bg.setAttribute('height', '100%');
  bg.setAttribute('fill', '#121417');
  clone.insertBefore(bg, style.nextSibling);
  const xml = new XMLSerializer().serializeToString(clone);
  const url = URL.createObjectURL(new Blob([xml], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    await new Promise<void>((ok, fail) => {
      img.onload = () => ok();
      img.onerror = () => fail(new Error('svg load'));
      img.src = url;
    });
    const scale = Math.min(2, maxWidth / r.width);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(r.width * scale);
    canvas.height = Math.round(r.height * scale);
    const c = canvas.getContext('2d');
    if (!c) return null;
    c.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png');
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}
