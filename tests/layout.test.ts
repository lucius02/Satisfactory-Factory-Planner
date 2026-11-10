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
    // 10 m assemblers with 2 m gap: packed at 12 m (centring on 16 m foundations would waste 6 m)
    expect(L.U).toBe(Math.ceil((asm.count * 10 + (asm.count - 1) * 2) / 8) * 8);
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
    // the miners are drawn as buildings (6 × 14 m)
    const left = geomLocal(src, { ...base, outSide: 'left' });
    expect(left.src).toBe(false);
    expect(left.machines).toHaveLength(src.count);
    expect(left.machines[0].w).toBe(6);
    if (src.count > 1) expect(left.outLanes[0].pu).toBeLessThan(geomLocal(src, { ...base, outSide: 'right' }).outLanes[0].pu);
    // two consumers that each need half: 2 + 2 miners, each half fits on one Mk3 belt
    const L = geomLocal(src, { ...base, outSplit: [{ key: 'a', rate: src.rate / 2 }, { key: 'b', rate: src.rate / 2 }] });
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

describe('input sides on a single machine', () => {
  const rotor = compute({
    targets: [{ item: 'rotor', rate: 4 }], external: [], rc: {}, miner: 1, purity: 1, clockMode: 'even', belt: 2, pipe: 1,
    reuse: true, surplus: 'output', dist: 'balancer', distOv: {}, balSmooth: true,
  }).byKey['m:rotor'];
  const base = { gap: 0, perRow: 0, caps: { belt: 120, pipe: 300 }, align: true };
  type Sd = 'left' | 'center' | 'right';
  const rodAt = (rod: Sd) =>
    geomLocal(rotor, { ...base, inSides: { 'iron-rod': rod, screw: 'left' } }).inLanes.find((l) => l.item === 'iron-rod')!.pu;

  it('moves the belts over the machine according to the chosen side', () => {
    expect(rotor.count).toBe(1);
    expect(rodAt('left')).toBeLessThan(rodAt('center'));
    expect(rodAt('center')).toBeLessThan(rodAt('right'));
  });
});

describe('gap between machines with foundation alignment', () => {
  it('0 m gap packs 10 m wide generators side by side', async () => {
    const m = compute({
      targets: [], external: [], rc: {}, miner: 1, purity: 1, clockMode: 'even', belt: 2, pipe: 1, reuse: true,
      surplus: 'output', dist: 'balancer', distOv: {}, balSmooth: false, gens: [{ gen: 'coal', fuel: 'coal', mode: 'count', value: 8 }],
    });
    const g = m.byKey['g:0'];
    expect(g.dist).toBe('balancer');
    const L = geomLocal(g, { gap: 0, perRow: 0, caps: m.caps, align: true });
    expect(L.machines[1].u - L.machines[0].u).toBe(10);
    // balancer tree: more than one splitter level for 8 machines
    expect(L.parts.filter((p) => p.t === 'split').length).toBeGreaterThanOrEqual(7);
  });
});

describe('balancer rows and extractors', () => {
  it('a balancer with water in parallel pipes stays in one row', () => {
    const m = compute({
      targets: [], external: [], rc: {}, miner: 1, purity: 1, clockMode: 'even', belt: 2, pipe: 1, reuse: true,
      surplus: 'output', dist: 'balancer', distOv: {}, balSmooth: false, gens: [{ gen: 'coal', fuel: 'coal', mode: 'count', value: 8 }],
    });
    const L = geomLocal(m.byKey['g:0'], { gap: 0, perRow: 0, caps: m.caps, align: true });
    expect(L.rows).toBe(1);
    const water = geomLocal(m.byKey['s:water'], { gap: 0, perRow: 0, caps: m.caps, align: true });
    expect(water.machines).toHaveLength(3);
    expect(water.machines[0].w).toBe(20);
  });
});

describe('pipe distribution', () => {
  const ref = compute({
    targets: [{ item: 'plastic', rate: 120 }], external: [], rc: {}, miner: 2, purity: 1, clockMode: 'even', belt: 3, pipe: 2,
    reuse: true, surplus: 'output', dist: 'manifold', distOv: {}, balSmooth: false,
  }).byKey['m:plastic'];
  const base = { gap: 2, perRow: 0, caps: { belt: 270, pipe: 600 }, align: true };
  const juncsIn = (L: ReturnType<typeof geomLocal>) =>
    L.parts.filter((p) => p.t === 'junc' && p.item === 'crude-oil').length;

  it('tree: symmetric T-junctions from the middle, one junction less than machines', () => {
    expect(ref.count).toBe(6);
    const L = geomLocal(ref, { ...base, fluidDist: 'tree' });
    expect(L.inSides!['crude-oil']).toBe('center');
    expect(juncsIn(L)).toBe(ref.count - 1);
  });
  it('loopback adds a return pipe and a junction at the far end', () => {
    const plain = juncsIn(geomLocal(ref, base));
    const loop = juncsIn(geomLocal(ref, { ...base, fluidDist: 'loopback' }));
    expect(loop).toBe(plain + 1);
  });
});

describe('balancer with two belts in one row', () => {
  it('5 smelters on Mk2 belts (144 ore/min) stay in one row with two balancers', () => {
    const m = compute({
      targets: [{ item: 'iron-ingot', rate: 144 }], external: [], rc: {}, miner: 2, purity: 1, clockMode: 'even', belt: 2, pipe: 1,
      reuse: true, surplus: 'output', dist: 'balancer', distOv: {}, balSmooth: false,
    });
    const g = m.byKey['m:iron-ingot'];
    expect(g.count).toBe(5);
    const L = geomLocal(g, { gap: 2, perRow: 0, caps: m.caps, align: true });
    expect(L.rows).toBe(1);
    expect(L.inLanes[0].belts).toBe(2);
    // 1:3 balancer (1 splitter) + 1:2 balancer (1 splitter)
    expect(L.parts.filter((p) => p.t === 'split').length).toBe(2);
  });
});

describe('no belts or pipes through machines', () => {
  it('balancers with several inputs and all pipe modes keep lines out of the buildings', () => {
    for (const item of ['plutonium-pellet', 'motor', 'computer', 'aluminum-ingot', 'plastic', 'battery'])
      for (const dist of ['manifold', 'balancer'] as const) {
        const m = compute({
          targets: [{ item, rate: 60 }], external: [], rc: {}, miner: 2, purity: 1, clockMode: 'even', belt: 3, pipe: 1, reuse: true,
          surplus: 'output', dist, distOv: {}, balSmooth: false,
        });
        for (const g of m.groups.filter((x) => x.kind === 'machine'))
          for (const fluidDist of ['manifold', 'loopback', 'tree'] as const) {
            const L = geomLocal(g, { gap: 2, perRow: 4, caps: m.caps, align: true, fluidDist });
            for (const p of L.parts) {
              if (p.t !== 'belt' && p.t !== 'loop') continue;
              for (let i = 1; i < p.pts.length; i++) {
                const [a, b] = [p.pts[i - 1], p.pts[i]];
                for (const mm of L.machines) {
                  const inside =
                    Math.max(a[0], b[0]) > mm.u + 0.3 && Math.min(a[0], b[0]) < mm.u + mm.w - 0.3 &&
                    Math.max(a[1], b[1]) > mm.v + 0.3 && Math.min(a[1], b[1]) < mm.v + mm.l - 0.3;
                  expect(inside, `${g.key} ${dist} ${fluidDist}`).toBe(false);
                }
              }
            }
          }
      }
  }, 30_000);
});

describe('rows facing each other', () => {
  it('two rows: the inputs of both run through the middle, outputs on the outside', () => {
    const m = compute({
      targets: [], external: [], rc: {}, miner: 1, purity: 1, clockMode: 'even', belt: 2, pipe: 1, reuse: true,
      surplus: 'output', dist: 'balancer', distOv: {}, balSmooth: false, gens: [{ gen: 'coal', fuel: 'coal', mode: 'count', value: 12 }],
    });
    const g = m.byKey['g:0'];
    const L = geomLocal(g, { gap: 0, perRow: 6, caps: m.caps, align: true, opt: { facing: true } });
    expect(L.rows).toBe(2);
    expect(L.facing).toBe(true);
    const top = L.machines.slice(0, 6);
    const bottom = L.machines.slice(6);
    const midTop = Math.max(...top.map((x) => x.v + x.l));
    const midBottom = Math.min(...bottom.map((x) => x.v));
    // every splitter / junction of the inputs (coal, water) lies between the two rows
    const inputNodes = L.parts.filter((p) => (p.t === 'split' || p.t === 'junc') && (p.item === 'coal' || p.item === 'water'));
    const inner = inputNodes.filter((p) => 'u' in p && p.u > 8 && p.u < L.U - 8);
    expect(inner.length).toBeGreaterThan(0);
    for (const p of inner) if ('v' in p) expect(p.v > midTop - 1e-6 && p.v < midBottom + 1e-6).toBe(true);
  });
});
