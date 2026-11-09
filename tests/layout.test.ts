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

describe('powerNetwork', () => {
  it('connects all lines with the shortest wires and adds poles every 100 m', async () => {
    const { powerNetwork } = await import('../src/layout/powerNet');
    const net = powerNetwork([
      { key: 'a', f: 0, poles: [[0, 0]] },
      { key: 'b', f: 0, poles: [[50, 0]] },
      { key: 'c', f: 0, poles: [[300, 0], [60, 10]] },
    ]);
    expect(net.edges).toHaveLength(2);
    expect(net.extraPoles).toBe(0);
    const far = powerNetwork([
      { key: 'a', f: 0, poles: [[0, 0]] },
      { key: 'b', f: 0, poles: [[250, 0]] },
    ]);
    expect(far.extraPoles).toBe(2);
    expect(far.wires).toBe(3);
  });
});

describe('foundation alignment', () => {
  it('centers 1-foundation machines (Constructor) on a foundation', () => {
    const g = model.groups.find((x) => x.bld?.n === 'Constructor')!;
    const L = geomLocal(g, { gap: 2, perRow: 8, caps: model.caps, align: true });
    for (const m of L.machines) {
      expect((m.u + m.w / 2) % 8).toBeCloseTo(4);
    }
    expect(L.U % 8).toBe(0);
  });
});

describe('block size', () => {
  it('one Constructor fits on 1 × 3 foundations', () => {
    const one = compute({
      targets: [{ item: 'iron-plate', rate: 20 }], external: [{ item: 'iron-ingot', rate: 30 }], rc: {}, miner: 2, purity: 1,
      clockMode: 'even', belt: 3, pipe: 1, reuse: true, surplus: 'output', dist: 'manifold', distOv: {}, balSmooth: false,
    }).byKey['m:iron-plate'];
    const L = geomLocal(one, { gap: 2, perRow: 8, caps: { belt: 270, pipe: 300 }, align: true });
    expect([L.U / 8, L.V / 8]).toEqual([1, 3]);
  });
});

describe('pole capacity', () => {
  it('adds a helper pole when a pole has no free connections', async () => {
    const { powerNetwork } = await import('../src/layout/powerNet');
    const net = powerNetwork(
      [
        { key: 'a', f: 0, poles: [[0, 0]], used: [4] },
        { key: 'b', f: 0, poles: [[20, 0]], used: [1] },
      ],
      4,
    );
    expect(net.helpers).toHaveLength(1);
    expect(net.extraPoles).toBe(1);
  });
});

describe('rows, parallel belts and block settings', () => {
  const smelt = compute({
    targets: [{ item: 'iron-ingot', rate: 435 }], external: [], rc: {}, miner: 2, purity: 1, clockMode: 'even', belt: 3, pipe: 1,
    reuse: true, surplus: 'output', dist: 'manifold', distOv: {}, balSmooth: false,
  }).byKey['m:iron-ingot'];
  const base = { gap: 2, perRow: 0, caps: { belt: 270, pipe: 300 }, align: true };

  it('keeps one row and uses parallel belts when the flow does not fit on one belt', () => {
    const L = geomLocal(smelt, base);
    expect(L.rows).toBe(1);
    expect(L.inLanes[0].belts).toBe(2);
  });
  it('makes extra rows when that option is on', () => {
    expect(geomLocal(smelt, { ...base, capRows: true }).rows).toBe(2);
  });
  it('honours machines per row and spacing of a block', () => {
    const L = geomLocal(smelt, { ...base, opt: { perRow: 5, spacing: 1 } });
    expect(L.rows).toBe(Math.ceil(smelt.count / 5));
    expect(L.machines[1].u - L.machines[0].u).toBe(16);
  });
  it('feeds from the middle also with several rows (corridor in the middle)', () => {
    const L = geomLocal(smelt, { ...base, perRow: 4, inSide: 'center' });
    expect(L.inSides!['iron-ore']).toBe('center');
    expect(L.rows).toBeGreaterThan(1);
    const pu = L.inLanes[0].pu;
    // no machine sits on the trunk
    expect(L.machines.every((m) => pu < m.u || pu > m.u + m.w)).toBe(true);
    expect(Math.abs(pu - L.U / 2)).toBeLessThan(8);
  });
  it('2 constructors in one row are 2 foundations wide', () => {
    const two = compute({
      targets: [{ item: 'iron-plate', rate: 40 }], external: [{ item: 'iron-ingot', rate: 60 }], rc: {}, miner: 2, purity: 1,
      clockMode: 'even', belt: 3, pipe: 1, reuse: true, surplus: 'output', dist: 'manifold', distOv: {}, balSmooth: false,
    }).byKey['m:iron-plate'];
    expect(geomLocal(two, base).U / 8).toBe(2);
    expect(geomLocal(two, { ...base, opt: { spacing: 1 } }).U / 8).toBe(3);
    for (const inSide of ['left', 'center', 'right'] as const)
      for (const outSide of ['left', 'center', 'right'] as const) {
        const L = geomLocal(two, { ...base, inSide, outSide });
        expect([L.U / 8, L.inSides!['iron-ingot'], L.outSide]).toEqual([2, inSide, outSide]);
      }
    // middle: the entry lies between the two machines
    const C = geomLocal(two, { ...base, inSide: 'center' });
    expect(C.inLanes[0].pu).toBeCloseTo(8, 0);
  });
  it('feeds from the middle when asked and possible', () => {
    const g = model.groups.find((x) => x.key === 'm:modular-frame')!;
    const L = geomLocal(g, { gap: 2, perRow: 8, caps: model.caps, align: true, inSide: 'center' });
    expect(Object.values(L.inSides!)).toEqual(['center', 'center']);
    expect(Math.abs(L.inLanes[0].pu - L.U / 2)).toBeLessThan(8);
  });
});

describe('per-input sides, balancer and split output', () => {
  const asm = model.groups.find((x) => x.key === 'm:reinforced-iron-plate')!;
  it('lets every input come from its own side', () => {
    const L = geomLocal(asm, { gap: 2, perRow: 8, caps: model.caps, align: true, inSides: { 'iron-plate': 'left', screw: 'right' } });
    const [a, b] = L.inLanes;
    expect(a.pu).toBeLessThan(b.pu);
    expect(L.inSides).toEqual({ 'iron-plate': 'left', screw: 'right' });
  });
  it('feeds a single-row balancer from the middle, without side strips', () => {
    const L = geomLocal({ ...asm, dist: 'balancer' }, { gap: 2, perRow: 8, caps: model.caps, align: true, inSide: 'left' });
    expect(Object.values(L.inSides!)).toEqual(['center', 'center']);
    expect(L.U / 8).toBe(Math.ceil(asm.count * 16 / 8));
  });
  it('splits the output over consumers with a balancing splitter', async () => {
    const { allocate } = await import('../src/layout/geometry');
    expect(allocate(3, [20, 10])).toEqual([2, 1]);
    const rod = model.groups.find((x) => x.key === 'm:iron-rod')!;
    const L = geomLocal(rod, {
      gap: 2, perRow: 0, caps: model.caps, align: true,
      outSplit: [{ key: 'a', rate: rod.rate * 0.7 }, { key: 'b', rate: rod.rate * 0.3 }],
    });
    expect(L.split).toBe(true);
    expect(L.outLanes.filter((l) => l.item === 'iron-rod').map((l) => l.to)).toEqual(['a', 'b']);
  });
});

describe('straighten', () => {
  it('removes small jogs but keeps both ends', async () => {
    const { straighten } = await import('../src/render/router');
    const out = straighten([[0, 0], [0, 10], [1, 10], [1, 30], [20, 30]]);
    expect(out[0]).toEqual([0, 0]);
    expect(out[out.length - 1]).toEqual([20, 30]);
    expect(out).toHaveLength(3);
  });
});

describe('daisy-chaining (1.2)', () => {
  it('uses one pole per row and chains the machines', () => {
    const g = model.groups.find((x) => x.key === 'm:screw')!;
    const L = geomLocal(g, { gap: 2, perRow: 0, caps: model.caps, align: true, pole: 1, daisy: true });
    expect(L.counts.poles).toBe(L.rows);
    expect(L.parts.filter((p) => p.t === 'wire').length).toBe(g.count + L.rows - 1);
  });
});

describe('output options for every block with an output', () => {
  it('a raw resource block can choose its exit side and split per consumer', async () => {
    const { consumersOf } = await import('../src/layout/sides');
    const src = model.groups.find((x) => x.key === 's:iron-ore')!;
    const cons = consumersOf(model, src);
    expect(cons.length).toBeGreaterThan(0);
    const base = { gap: 2, perRow: 8, caps: model.caps };
    expect(geomLocal(src, { ...base, outSide: 'left' }).outLanes[0].pu).toBe(3);
    expect(geomLocal(src, { ...base, outSide: 'right' }).outLanes[0].pu).toBe(13);
    const L = geomLocal(src, { ...base, outSplit: [{ key: 'a', rate: 60 }, { key: 'b', rate: 30 }] });
    expect(L.split).toBe(true);
    expect(L.outLanes.map((l) => l.to)).toEqual(['a', 'b']);
  });
});

describe('no unnecessary mergers on the output side', () => {
  it('never uses more mergers than machines minus outgoing belts', async () => {
    const { isFluid } = await import('../src/data/items');
    for (const belt of [1, 3] as const)
      for (const [item, rate] of [['iron-plate', 60], ['screw', 400], ['reinforced-iron-plate', 20], ['plastic', 90], ['modular-frame', 10]] as const) {
        const m = compute({
          targets: [{ item, rate }], external: [], rc: {}, miner: 2, purity: 1, clockMode: 'even', belt, pipe: 1, reuse: true,
          surplus: 'output', dist: 'manifold', distOv: {}, balSmooth: false,
        });
        for (const g of m.groups.filter((x) => x.kind === 'machine'))
          for (const outSide of ['left', 'center', 'right'] as const)
            for (const perRow of [0, 3]) {
              const L = geomLocal(g, { gap: 2, perRow, caps: m.caps, align: true, outSide });
              const mergers = L.parts.filter((p) => p.t === 'merge').length;
              const solidOuts = g.outputs.filter((o) => !isFluid(o.item)).length;
              expect(mergers).toBeLessThanOrEqual(solidOuts * g.count - L.outLanes.filter((l) => !l.fluid).length);
            }
      }
  });
});

describe('middle feed with an odd number of machines', () => {
  it('3 machines from the middle: one 3-way splitter and one 3-way merger at the middle machine', () => {
    const three = compute({
      targets: [{ item: 'iron-rod', rate: 45 }], external: [{ item: 'iron-ingot', rate: 45 }], rc: {}, miner: 2, purity: 1,
      clockMode: 'even', belt: 3, pipe: 1, reuse: true, surplus: 'output', dist: 'manifold', distOv: {}, balSmooth: false,
    }).byKey['m:iron-rod'];
    expect(three.count).toBe(3);
    const L = geomLocal(three, { gap: 2, perRow: 0, caps: { belt: 270, pipe: 300 }, align: true, inSide: 'center', outSide: 'center' });
    expect(L.parts.filter((p) => p.t === 'split').length).toBe(1);
    expect(L.parts.filter((p) => p.t === 'merge').length).toBe(1);
    const midX = L.machines[1].u + L.machines[1].w / 2;
    expect(L.outLanes[0].pu).toBeCloseTo(midX);
    expect(L.inLanes[0].pu).toBeCloseTo(midX);
  });
});

describe('input order follows the chosen side', () => {
  it('one assembler: rods right, screws left puts the rod belt on the right', () => {
    const rotor = compute({
      targets: [{ item: 'rotor', rate: 4 }], external: [], rc: {}, miner: 2, purity: 1, clockMode: 'even', belt: 3, pipe: 1,
      reuse: true, surplus: 'output', dist: 'manifold', distOv: {}, balSmooth: false,
    }).byKey['m:rotor'];
    expect(rotor.count).toBe(1);
    const L = geomLocal(rotor, { gap: 2, perRow: 8, caps: { belt: 270, pipe: 300 }, align: true, inSides: { 'iron-rod': 'right', screw: 'left' } });
    const rod = L.inLanes.find((l) => l.item === 'iron-rod')!;
    const screw = L.inLanes.find((l) => l.item === 'screw')!;
    expect(rod.pu).toBeGreaterThan(screw.pu);
  });
});
