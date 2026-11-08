/** Conveyor belt throughput per tier (items/min), Mk.1 … Mk.6. */
export const BELTS = [60, 120, 270, 480, 780, 1200] as const;
/** Pipeline throughput per tier (m³/min), Mk.1 … Mk.2. */
export const PIPES = [300, 600] as const;

/** Logistics buildings, sizes in metres (satisfactory.wiki.gg). */
export const LOGISTICS = {
  splitter: { n: 'Conveyor Splitter', w: 4, l: 4 },
  merger: { n: 'Conveyor Merger', w: 4, l: 4 },
  junction: { n: 'Pipeline Junction Cross', w: 2, l: 2 },
  sink: { n: 'AWESOME Sink', w: 16, l: 13, mw: 30 },
  storage: { n: 'Industrial Storage Container', w: 5, l: 11, slots: 48 },
  fluidBuffer: { n: 'Industrial Fluid Buffer', w: 14, l: 14, m3: 2400 },
} as const;

export type BeltTier = 1 | 2 | 3 | 4 | 5 | 6;
export type PipeTier = 1 | 2;

export const beltCap = (tier: number): number => BELTS[Math.min(BELTS.length, Math.max(1, tier)) - 1];
export const pipeCap = (tier: number): number => PIPES[Math.min(PIPES.length, Math.max(1, tier)) - 1];
