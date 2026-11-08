import { describe, expect, it } from 'vitest';
import { chooseRecipes, type OptimizeInput } from '../src/calc/optimize';
import { RECIPES } from '../src/data/recipes';

const base: OptimizeInput = {
  targets: [], rc: {}, miner: 2, purity: 1, clockMode: 'even', belt: 6, pipe: 2, reuse: true,
  surplus: 'output', dist: 'manifold', distOv: {}, balSmooth: false, unlocked: {}, goal: 'raw',
};
const allAlts = Object.fromEntries(Object.values(RECIPES).flat().filter((r) => r.alt).map((r) => [r.name, true]));

describe('chooseRecipes()', () => {
  it('uses only standard recipes when nothing is unlocked', () => {
    const auto = chooseRecipes({ ...base, targets: [{ item: 'modular-frame', rate: 5 }] });
    expect(Object.values(auto).every((n) => !RECIPES[Object.keys(auto).find((k) => auto[k] === n)!].find((r) => r.name === n)?.alt)).toBe(true);
  });

  it('picks a cheaper unlocked alternate', () => {
    const auto = chooseRecipes({
      ...base, targets: [{ item: 'iron-ingot', rate: 65 }], unlocked: { 'Pure Iron Ingot': true },
    });
    expect(auto['iron-ingot']).toBe('Pure Iron Ingot');
  });

  it('keeps manual choices fixed', () => {
    const auto = chooseRecipes({
      ...base, targets: [{ item: 'iron-ingot', rate: 65 }], unlocked: { 'Pure Iron Ingot': true }, rc: { 'iron-ingot': 'Iron Ingot' },
    });
    expect(auto['iron-ingot']).toBeUndefined();
  });

  it('is fast enough for a big factory with everything unlocked', () => {
    const t0 = performance.now();
    chooseRecipes({ ...base, targets: [{ item: 'turbo-motor', rate: 5 }, { item: 'supercomputer', rate: 2 }], unlocked: allAlts });
    expect(performance.now() - t0).toBeLessThan(3000);
    console.log('optimize ms', Math.round(performance.now() - t0));
  });
});
