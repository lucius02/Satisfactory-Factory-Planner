import { describe, expect, it } from 'vitest';
import { resolveMax } from '../src/calc/maxTargets';
import { compute, type PlanInput } from '../src/calc/solver';

const base: PlanInput = {
  targets: [], external: [], rc: {}, miner: 2, purity: 1, clockMode: 'even', belt: 6, pipe: 2, reuse: true,
  surplus: 'output', dist: 'manifold', distOv: {}, balSmooth: false,
};

describe('max targets from the external supply', () => {
  it('60 iron ore/min gives 40 iron plates/min', () => {
    const r = resolveMax({ ...base, targets: [{ item: 'iron-plate', rate: 1, max: true }], external: [{ item: 'iron-ore', rate: 60 }] });
    expect(r.info!['iron-plate'].rate).toBeCloseTo(40);
    expect(r.info!['iron-plate'].limit).toBe('iron-ore');
    // the final plan uses exactly the external ore, no miners
    const m = compute(r.input);
    expect(m.byKey['s:iron-ore']).toBeUndefined();
    expect(m.byKey['x:iron-ore'].rate).toBe(60);
  });
  it('splits the supply by the ratio of several max targets and keeps fixed targets', () => {
    const r = resolveMax({
      ...base,
      targets: [{ item: 'iron-plate', rate: 2, max: true }, { item: 'iron-rod', rate: 1, max: true }, { item: 'iron-ingot', rate: 30 }],
      external: [{ item: 'iron-ore', rate: 210 }],
    });
    // 30 ore for the fixed ingots, 180 left: plates 2x, rods 1x → 1.5·2p + 1·p = 180 → p = 45
    expect(r.info!['iron-plate'].rate).toBeCloseTo(90);
    expect(r.info!['iron-rod'].rate).toBeCloseTo(45);
  });
  it('without external supply the number is used as the amount', () => {
    const r = resolveMax({ ...base, targets: [{ item: 'iron-plate', rate: 7, max: true }] });
    expect(r.info!['iron-plate'].rate).toBe(7);
    expect(r.info!['iron-plate'].limit).toBeUndefined();
  });
});

describe('generators from fuel per minute', () => {
  it('180 coal/min = 12 coal generators', () => {
    const m = compute({ ...base, gens: [{ gen: 'coal', fuel: 'coal', mode: 'fuel', value: 180 }] });
    expect(m.byKey['g:0'].count).toBe(12);
    expect(m.byKey['g:0'].gen).toBeCloseTo(900);
  });
});
