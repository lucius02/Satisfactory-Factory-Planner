/**
 * Head lift for pipes (FICSIT Plumbing Manual / wiki): a machine or extractor pushes a fluid 10 m up,
 * a Pipeline Pump Mk.1 adds 20 m and a Mk.2 50 m (pumps do not stack, so they are spaced along the rise).
 * Gases have no head lift: pumps do not help them.
 */
import type { ItemId } from '../data/types';

export const HEAD_LIFT_MACHINE = 10;
export const HEAD_LIFT_PUMP = { 1: 20, 2: 50 } as const;

/** Fluids that are gases in the game. */
export const GASES = new Set<ItemId>(['nitrogen-gas', 'excited-photonic-matter', 'dark-matter-residue']);
export const isGas = (id: ItemId): boolean => GASES.has(id);

/** Pumps needed to lift a fluid `height` metres (0 for gases or small rises). */
export function pumpsFor(height: number, item: ItemId): { mk1: number; mk2: number } {
  if (isGas(item) || height <= HEAD_LIFT_MACHINE) return { mk1: 0, mk2: 0 };
  const rest = height - HEAD_LIFT_MACHINE;
  return { mk1: Math.ceil(rest / HEAD_LIFT_PUMP[1] - 1e-9), mk2: Math.ceil(rest / HEAD_LIFT_PUMP[2] - 1e-9) };
}

/** A Mk.2 pipe close to its 600 m³/min limit flows back at the first junction and loses throughput. */
export const nearFullPipe = (ratePerPipe: number, cap: number): boolean => cap >= 600 && ratePerPipe > cap * 0.9;
