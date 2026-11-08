/** Pan, zoom, drag & drop and keyboard shortcuts on the floor plan; tab switching. */
import { $, ctx } from '../app/context';
import { recompute } from '../app/controller';
import { applyView, fitView, renderMap, zoomAt } from '../render/map';
import { saveState, state } from '../state/store';
import { renderInfo, rotateSelected } from './info';
import { renderOverview } from './sidebar';

type Drag =
  | { mode: 'belt'; key: string; sx: number; sy: number; moved: boolean }
  | { mode: 'move'; key: string; w0: [number, number]; p0: { x: number; y: number }; sx: number; sy: number; moved: boolean }
  | { mode: 'pan'; sx: number; sy: number; t0: { tx: number; ty: number }; moved: boolean };

export function bindMap(): void {
  const svg = $<SVGSVGElement>('#map');
  let drag: Drag | null = null;
  const toWorld = (e: PointerEvent): [number, number] => {
    const r = svg.getBoundingClientRect();
    return [(e.clientX - r.left - ctx.view.tx) / ctx.view.k, (e.clientY - r.top - ctx.view.ty) / ctx.view.k];
  };

  svg.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const belt = (e.target as Element).closest<SVGElement>('[data-belt]');
    const tg = belt ? null : (e.target as Element).closest<SVGElement>('[data-key]');
    try {
      svg.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    if (belt) {
      drag = { mode: 'belt', key: belt.dataset.belt!, sx: e.clientX, sy: e.clientY, moved: false };
    } else if (tg) {
      const key = tg.dataset.key!;
      const p = state.pos[key];
      drag = { mode: 'move', key, w0: toWorld(e), p0: { x: p.x, y: p.y }, sx: e.clientX, sy: e.clientY, moved: false };
      if (ctx.sel !== key) {
        ctx.sel = key;
        renderMap();
        renderInfo();
      }
    } else {
      drag = { mode: 'pan', sx: e.clientX, sy: e.clientY, t0: { tx: ctx.view.tx, ty: ctx.view.ty }, moved: false };
      svg.classList.add('panning');
    }
  });

  svg.addEventListener('pointermove', (e) => {
    if (!drag) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 4) return;
    drag.moved = true;
    if (drag.mode === 'pan') {
      ctx.view.tx = drag.t0.tx + e.clientX - drag.sx;
      ctx.view.ty = drag.t0.ty + e.clientY - drag.sy;
      applyView();
      return;
    }
    if (drag.mode === 'belt') {
      const [x, y] = toWorld(e);
      const gs = e.shiftKey ? 1 : 2;
      state.beltWp[drag.key] = [Math.round(x / gs) * gs, Math.round(y / gs) * gs];
      renderMap({ fast: true });
      return;
    }
    const w = toWorld(e);
    const gsz = state.snap && !e.shiftKey ? 8 : 1;
    const p = state.pos[drag.key];
    const nx = Math.round((drag.p0.x + w[0] - drag.w0[0]) / gsz) * gsz;
    const ny = Math.round((drag.p0.y + w[1] - drag.w0[1]) / gsz) * gsz;
    if (nx !== p.x || ny !== p.y) {
      p.x = nx;
      p.y = ny;
      p.manual = true;
      renderMap({ fast: true });
    }
  });

  const endDrag = () => {
    if (!drag) return;
    if (drag.mode === 'pan' && !drag.moved && ctx.sel) {
      ctx.sel = null;
      renderMap();
      renderInfo();
    }
    if (drag.mode === 'belt' && drag.moved) {
      saveState(state);
      renderMap();
    }
    if (drag.mode === 'move' && drag.moved) {
      renderMap();
      saveState(state);
      renderInfo();
      renderOverview();
    }
    drag = null;
    svg.classList.remove('panning');
  };
  svg.addEventListener('pointerup', endDrag);
  svg.addEventListener('dblclick', (e) => {
    const belt = (e.target as Element).closest<SVGElement>('[data-belt]');
    if (!belt) return;
    delete state.beltWp[belt.dataset.belt!];
    saveState(state);
    renderMap();
  });
  svg.addEventListener('pointercancel', endDrag);

  svg.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const r = svg.getBoundingClientRect();
      zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top);
    },
    { passive: false },
  );
  const center = (f: number) => {
    const r = svg.getBoundingClientRect();
    zoomAt(f, r.width / 2, r.height / 2);
  };
  $('#zIn').onclick = () => center(1.25);
  $('#zOut').onclick = () => center(0.8);

  document.addEventListener('keydown', (e) => {
    if (/INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName ?? '')) return;
    if (e.key === 'r' || e.key === 'R') rotateSelected();
    if (e.key === 'Escape') {
      ctx.sel = null;
      renderMap();
      renderInfo();
    }
  });

  $('#btnAuto').onclick = () => recompute({ force: true, fit: true });
  $('#btnFit').onclick = fitView;
  $('#tabMap').onclick = () => switchTab('map');
  $('#tabTable').onclick = () => switchTab('table');
}

function switchTab(x: 'map' | 'table'): void {
  $('#tabMap').classList.toggle('on', x === 'map');
  $('#tabTable').classList.toggle('on', x === 'table');
  $('#mapView').hidden = x !== 'map';
  $('#tableView').hidden = x !== 'table';
  $('#floorTabs').style.visibility = x === 'map' ? '' : 'hidden';
  if (x === 'map') requestAnimationFrame(fitView);
}
