import { describe, expect, it } from 'vitest';
import { balancerCount, smoothUp } from '../src/calc/balancer';
import { suppliers } from '../src/calc/model';
import { compute, type PlanInput } from '../src/calc/solver';

const base: PlanInput = {
  targets: [],
  rc: {},
  miner: 2,
  purity: 1,
  clockMode: 'even',
  belt: 6,
  pipe: 2,
  reuse: true,
  surplus: 'output',
  dist: 'manifold',
  distOv: {},
  balSmooth: false,
};
const plan = (o: Partial<PlanInput>) => compute({ ...base, ...o });
const g = (m: ReturnType<typeof compute>, key: string) => m.byKey[key];

describe('compute()', () => {
  it('solves the Modular Frame chain exactly', () => {
    const m = plan({ targets: [{ item: 'modular-frame', rate: 5 }] });
    expect(g(m, 'm:modular-frame').exact).toBeCloseTo(2.5);
    expect(g(m, 'm:reinforced-iron-plate').exact).toBeCloseTo(1.5);
    expect(g(m, 'm:screw').exact).toBeCloseTo(2.25);
    expect(g(m, 'm:iron-rod').exact).toBeCloseTo(3.5);
    expect(g(m, 'm:iron-plate').exact).toBeCloseTo(2.25);
    expect(g(m, 'm:iron-ingot').exact).toBeCloseTo(4);
    expect(g(m, 's:iron-ore').rate).toBeCloseTo(120);
    expect(g(m, 's:iron-ore').count).toBe(1);
    expect(m.converged).toBe(true);
  });

  it('reuses byproducts and converges on the recycled plastic/rubber loop', () => {
    const m = plan({
      targets: [{ item: 'plastic', rate: 60 }],
      rc: { plastic: 'Recycled Plastic', rubber: 'Recycled Rubber' },
    });
    expect(m.converged).toBe(true);
    // net: every Recycled Plastic refinery makes 60 plastic of which 30 feeds Recycled Rubber
    expect(g(m, 'm:plastic').rate - (m.demand.plastic ?? 0)).toBeCloseTo(0, 6);
  });

  it('caps machine clock by the belt tier', () => {
    // High-Speed Connector needs 210 Quickwire/min → does not fit on Mk1 (60) or Mk2 (120)
    const m = plan({ targets: [{ item: 'high-speed-connector', rate: 3.75 }], belt: 2 });
    const hsc = g(m, 'm:high-speed-connector');
    expect(hsc.maxClock).toBeCloseTo(120 / 210);
    expect(hsc.limitItem).toBe('quickwire');
    expect(hsc.count).toBe(2);
  });

  it('caps miner output by the belt tier', () => {
    const m = plan({ targets: [{ item: 'iron-ingot', rate: 240 }], miner: 3, purity: 2, belt: 3 });
    expect(g(m, 's:iron-ore').ex!.per).toBe(270);
    expect(g(m, 's:iron-ore').count).toBe(1);
  });

  it('full clock mode overproduces and reports surplus', () => {
    const m = plan({ targets: [{ item: 'iron-plate', rate: 30 }], clockMode: 'full' });
    expect(g(m, 'm:iron-plate').count).toBe(2);
    expect(g(m, 'm:iron-plate').clocks).toEqual([1, 1]);
    expect(m.left['iron-plate']).toBeCloseTo(10);
  });

  it('sends surplus to a sink, fluids to storage', () => {
    const m = plan({ targets: [{ item: 'plastic', rate: 20 }], surplus: 'sink' });
    expect(m.left['heavy-oil-residue']).toBeCloseTo(10);
    expect(g(m, 'st:heavy-oil-residue').fallback).toBe(true);
    expect(g(m, 'k:sink')).toBeUndefined();
    const m2 = plan({ targets: [{ item: 'iron-plate', rate: 30 }], clockMode: 'full', surplus: 'sink' });
    expect(g(m2, 'k:sink').sinkPoints).toBeCloseTo(60);
    expect(suppliers(m2, 'iron-plate')[0].share).toBe(1);
  });

  it('without reuse the byproduct goes to surplus', () => {
    const m = plan({ targets: [{ item: 'alumina-solution', rate: 120 }], reuse: false });
    expect(m.left.silica).toBeCloseTo(50);
  });
});

describe('balancer', () => {
  it('counts splitters like the wiki', () => {
    expect(balancerCount(4).splitters).toBe(3);
    expect(balancerCount(6).splitters).toBe(3);
    expect(balancerCount(9).splitters).toBe(4);
    expect(balancerCount(12).splitters).toBe(7);
    expect(balancerCount(27).splitters).toBe(13);
    expect(balancerCount(5)).toMatchObject({ splitters: 3, mergers: 1 });
    expect(balancerCount(10)).toMatchObject({ splitters: 7, mergers: 2 });
    expect(balancerCount(13)).toMatchObject({ splitters: 15, mergers: 3 });
  });
  it('rounds to 2^a·3^b', () => {
    expect([5, 7, 10, 13, 17].map(smoothUp)).toEqual([6, 8, 12, 16, 18]);
  });
});
