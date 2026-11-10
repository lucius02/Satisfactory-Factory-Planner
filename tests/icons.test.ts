import { describe, expect, it } from 'vitest';
import { BUILDINGS } from '../src/data/buildings';
import { GENERATORS } from '../src/data/generators';
import { buildingIcon, iconKey } from '../src/render/icons';

describe('building pictograms', () => {
  it('every building has a pictogram', () => {
    const names = [
      ...Object.values(BUILDINGS).map((b) => b.n),
      ...Object.values(GENERATORS).map((g) => g.n),
      'Miner Mk2', 'Water Extractor', 'Oil Extractor', 'Resource Well Extractor', 'AWESOME Sink',
      'Industrial Storage Container', 'Industrial Fluid Buffer',
    ];
    for (const n of names) expect(iconKey(n), n).not.toBeNull();
  });
  it('draws nothing when too small', () => {
    expect(buildingIcon('Smelter', 0, 0, 1, '#fff')).toBe('');
    expect(buildingIcon('Smelter', 0, 0, 4, '#fff')).toContain('<path');
  });
});
