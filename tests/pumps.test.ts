import { describe, expect, it } from 'vitest';
import { nearFullPipe, pumpsFor } from '../src/calc/pumps';

describe('pumps (head lift)', () => {
  it('needs no pump within the 10 m a machine pushes', () => {
    expect(pumpsFor(8, 'water')).toEqual({ mk1: 0, mk2: 0 });
  });
  it('counts Mk1 (20 m) and Mk2 (50 m) pumps for higher rises', () => {
    expect(pumpsFor(16, 'water')).toEqual({ mk1: 1, mk2: 1 });
    expect(pumpsFor(40, 'crude-oil')).toEqual({ mk1: 2, mk2: 1 });
    expect(pumpsFor(70, 'water')).toEqual({ mk1: 3, mk2: 2 });
  });
  it('gases have no head lift, pumps do not help', () => {
    expect(pumpsFor(40, 'nitrogen-gas')).toEqual({ mk1: 0, mk2: 0 });
  });
  it('warns for a Mk2 pipe near 600 m³/min', () => {
    expect(nearFullPipe(560, 600)).toBe(true);
    expect(nearFullPipe(400, 600)).toBe(false);
    expect(nearFullPipe(290, 300)).toBe(false);
  });
});
