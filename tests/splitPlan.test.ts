import { describe, expect, it } from 'vitest';
import { splitPlan, type SplitNode } from '../src/calc/splitPlan';

/** Rate that reaches each consumer (loopback re-enters the input, so scale by n/(n+loop)). */
function delivered(root: SplitNode, k: number): number[] {
  const out = Array(k).fill(0);
  const walk = (s: SplitNode) => {
    if (s.children) s.children.forEach(walk);
    else if (s.to !== undefined) out[s.to] += s.rate;
  };
  walk(root);
  return out;
}

describe('splitPlan()', () => {
  it('90 → 70 + 20 with two 1:3 splitters', () => {
    const p = splitPlan([70, 20])!;
    expect(p.n).toBe(9);
    expect(p.splitters).toBe(2);
    expect(p.belts).toEqual([3, 2]);
    expect(delivered(p.root, 2).map((x) => Math.round(x))).toEqual([70, 20]);
  });

  it('equal halves need one splitter and no merger', () => {
    const p = splitPlan([30, 30])!;
    expect(p.splitters).toBe(1);
    expect(p.mergers).toBe(0);
  });

  it('a share of 1/5 uses a loopback', () => {
    const p = splitPlan([48, 12])!;
    expect(p.n).toBe(5);
    expect(p.loop).toBe(1);
    expect(delivered(p.root, 2).map((x) => Math.round(x))).toEqual([48, 12]);
  });

  it('gives up on awkward ratios', () => {
    expect(splitPlan([100, 1.234])).toBeNull();
  });
});

describe('exactSplit()', () => {
  it('8 smelters (last at 50 %) → 135 + 90: three machines for 90, the rest for 135', async () => {
    const { exactSplit } = await import('../src/layout/geometry');
    const r = exactSplit([1, 1, 1, 1, 1, 1, 1, 0.5], 225, [{ key: 'a', rate: 135 }, { key: 'b', rate: 90 }])!;
    expect(r.order).toEqual([1, 0]);
    expect(r.counts).toEqual([3, 5]);
  });

  it('no exact split when machines do not add up', async () => {
    const { exactSplit } = await import('../src/layout/geometry');
    expect(exactSplit(Array(8).fill(0.9375), 225, [{ key: 'a', rate: 135 }, { key: 'b', rate: 90 }])).toBeNull();
  });
});

describe('hybridSplit()', () => {
  it('7 × 40 screws → 180 + 100: 4 and 2 whole machines, the seventh split 1:2', async () => {
    const { hybridSplit } = await import('../src/layout/hybridSplit');
    const h = hybridSplit(Array(7).fill(40), [180, 100], 270)!;
    expect(h.chunks).toEqual([{ from: 0, to: 4 }, { from: 5, to: 7 }]);
    expect(h.left).toEqual({ from: 4, to: 5 });
    expect(h.rem).toEqual([20, 20]);
    expect(h.plan!.splitters).toBe(1);
  });

  it('6 × 15 rods → 70 + 20: 4 + 1 whole, one machine split 2:1', async () => {
    const { hybridSplit } = await import('../src/layout/hybridSplit');
    const h = hybridSplit(Array(6).fill(15), [70, 20], 120)!;
    expect(h.chunks).toEqual([{ from: 0, to: 4 }, { from: 5, to: 6 }]);
    expect(h.rem.map((x) => Math.round(x))).toEqual([10, 5]);
  });
});
