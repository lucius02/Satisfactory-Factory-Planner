import { describe, expect, it } from 'vitest';
import { compute } from '../src/calc/solver';
import { autoLayout } from '../src/layout/autoLayout';
import { geomLocal } from '../src/layout/geometry';
import { Router } from '../src/render/router';
import type { GroupPos } from '../src/state/types';

const model = compute({
  targets: [{ item: 'motor', rate: 10 }, { item: 'modular-frame', rate: 5 }], external: [], rc: {}, miner: 2, purity: 1,
  clockMode: 'even', belt: 3, pipe: 1, reuse: true, surplus: 'output', dist: 'manifold', distOv: {}, balSmooth: false,
});
const geo = Object.fromEntries(model.groups.map((g) => [g.key, geomLocal(g, { gap: 2, perRow: 8, caps: model.caps })]));

function rects(pos: Record<string, GroupPos>) {
  return model.groups.map((g) => ({ x: pos[g.key].x, y: pos[g.key].y, w: geo[g.key].U, h: geo[g.key].V, f: pos[g.key].f }));
}
const overlap = (r: ReturnType<typeof rects>) =>
  r.some((a, i) => r.some((b, j) => j > i && a.f === b.f && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h));

describe('autoLayout', () => {
  for (const mode of ['flow', 'compact'] as const)
    it(`${mode}: no overlapping blocks`, () => {
      const pos: Record<string, GroupPos> = {};
      autoLayout(model, pos, { floors: 1, mode, floorW: 0, floorL: 0 }, (g) => geo[g.key]);
      expect(overlap(rects(pos))).toBe(false);
    });

  it('respects the floor width and spreads over floors', () => {
    const pos: Record<string, GroupPos> = {};
    const fits = autoLayout(model, pos, { floors: 6, mode: 'flow', floorW: 30, floorL: 30 }, (g) => geo[g.key]);
    const r = rects(pos);
    expect(fits).toBe(true);
    expect(overlap(r)).toBe(false);
    expect(Math.max(...r.map((x) => x.x + x.w))).toBeLessThanOrEqual(240);
    expect(Math.max(...r.map((x) => x.y + x.h))).toBeLessThanOrEqual(240);
  });

  it('does not place groups on a block that was moved by hand', () => {
    const pos: Record<string, GroupPos> = {};
    const first = model.groups[model.groups.length - 1];
    pos[first.key] = { x: 0, y: 0, rot: 0, f: 0, manual: true };
    autoLayout(model, pos, { floors: 1, mode: 'compact', floorW: 0, floorL: 0 }, (g) => geo[g.key]);
    expect(overlap(rects(pos))).toBe(false);
  });
});

describe('Router', () => {
  it('routes around a block', () => {
    const r = new Router([{ x: 10, y: 0, w: 20, h: 40 }]);
    const path = r.route([0, 20], [40, 20])!;
    expect(path).not.toBeNull();
    expect(path.every(([x, y]) => !(x > 10 && x < 30 && y > 0 && y < 40))).toBe(true);
  });
});
