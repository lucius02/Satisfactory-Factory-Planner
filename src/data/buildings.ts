import type { Building, BuildingId } from './types';

/**
 * Production buildings. Sizes (w × l in metres) and power from satisfactory.wiki.gg.
 * Particle Accelerator, Converter and Quantum Encoder have variable power; `mw` is the average.
 */
export const BUILDINGS: Record<BuildingId, Building> = {
  smelter: { n: 'Smelter', w: 6, l: 9, mw: 4, c: '#d9773b' },
  foundry: { n: 'Foundry', w: 10, l: 9, mw: 16, c: '#c9503c' },
  constr: { n: 'Constructor', w: 8, l: 10, mw: 4, c: '#e0a43a' },
  assembler: { n: 'Assembler', w: 10, l: 15, mw: 15, c: '#8fb34a' },
  manufacturer: { n: 'Manufacturer', w: 18, l: 20, mw: 55, c: '#4fa39a' },
  refinery: { n: 'Refinery', w: 10, l: 20, mw: 30, c: '#5a86c9' },
  blender: { n: 'Blender', w: 18, l: 16, mw: 75, c: '#7b74d1' },
  packager: { n: 'Packager', w: 8, l: 8, mw: 10, c: '#9c8b5e' },
  accel: { n: 'Particle Accelerator', w: 24, l: 38, mw: 500, c: '#b65fb8', v: true },
  converter: { n: 'Converter', w: 16, l: 16, mw: 250, c: '#c75f86', v: true },
  encoder: { n: 'Quantum Encoder', w: 22, l: 48, mw: 1000, c: '#d4589a', v: true },
};

/** Power exponent for underclocked machines (wiki: power ∝ clock^1.321928). */
export const POWER_EXP = 1.321928;
