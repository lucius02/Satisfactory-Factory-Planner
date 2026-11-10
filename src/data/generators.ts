/** Power generators (satisfactory.wiki.gg), all values at 100% clock. Fuel use and output scale linearly with clock. */
import { defineItem } from './items';
import type { Amounts, ItemId } from './types';

export type GenId = 'biomass' | 'coal' | 'fuel' | 'nuclear';

export interface GenFuel {
  item: ItemId;
  /** Fuel per minute at 100%. */
  rate: number;
  /** Waste per minute at 100%. */
  waste?: Amounts;
}

export interface Generator {
  id: GenId;
  n: string;
  w: number;
  l: number;
  /** Output in MW at 100%. */
  mw: number;
  /** Water in m³/min at 100%. */
  water: number;
  c: string;
  fuels: GenFuel[];
}

// Fuels that cannot be automated from resources in this planner; they come in as external supply.
defineItem('biomass', 'Biomass');
defineItem('solid-biofuel', 'Solid Biofuel');
defineItem('plutonium-waste', 'Plutonium Waste');

export const GENERATORS: Record<GenId, Generator> = {
  biomass: {
    id: 'biomass', n: 'Biomass Burner', w: 8, l: 8, mw: 30, water: 0, c: '#7a9a4a',
    fuels: [{ item: 'solid-biofuel', rate: 4 }, { item: 'biomass', rate: 10 }],
  },
  coal: {
    id: 'coal', n: 'Coal-Powered Generator', w: 10, l: 26, mw: 75, water: 45, c: '#6b6f78',
    fuels: [{ item: 'coal', rate: 15 }, { item: 'compacted-coal', rate: 75 / 10.5 }, { item: 'petroleum-coke', rate: 25 }],
  },
  fuel: {
    id: 'fuel', n: 'Fuel-Powered Generator', w: 20, l: 20, mw: 250, water: 0, c: '#c98a3a',
    fuels: [{ item: 'fuel', rate: 20 }, { item: 'turbofuel', rate: 7.5 }, { item: 'rocket-fuel', rate: 25 / 6 }],
  },
  nuclear: {
    id: 'nuclear', n: 'Nuclear Power Plant', w: 36, l: 43, mw: 2500, water: 240, c: '#5fb86b',
    fuels: [
      { item: 'uranium-fuel-rod', rate: 0.2, waste: { 'uranium-waste': 10 } },
      { item: 'plutonium-fuel-rod', rate: 0.1, waste: { 'plutonium-waste': 1 } },
    ],
  },
};

export const genFuel = (gen: GenId, fuel: ItemId): GenFuel => GENERATORS[gen].fuels.find((f) => f.item === fuel) ?? GENERATORS[gen].fuels[0];

/** Generator spec on the power page. */
export interface GenSpec {
  gen: GenId;
  fuel: ItemId;
  /** mw = `value` is the wanted output in MW; count = `value` generators; fuel = `value` fuel per minute available. */
  mode: 'mw' | 'count' | 'fuel';
  value: number;
}

/** Generators (fractional, at 100%) for a spec: from a count, an output in MW or the fuel per minute. */
export function genExact(spec: GenSpec): number {
  const G = GENERATORS[spec.gen];
  if (!G) return 0;
  if (spec.mode === 'mw') return spec.value / G.mw;
  if (spec.mode === 'fuel') return spec.value / genFuel(spec.gen, spec.fuel).rate;
  return spec.value;
}
