/**
 * How to split one belt exactly over several consumers with splitters (1:2 / 1:3) and mergers.
 * Example: 90/min → 70 + 20 = 7/9 + 2/9: split in three (3 × 30), two of them go to the first
 * consumer; the third is split in three again (3 × 10): one more to the first, two to the second.
 * Shares whose denominator has other prime factors than 2 and 3 use a loopback (the unused
 * outputs go back into the input via a merger), like a balancer.
 */
import { isSmooth, primeFactors, smoothUp } from './balancer';

/** One belt in the plan: goes to a consumer (`to` = index), back to the input (`loop`) or into a splitter. */
export interface SplitNode {
  rate: number;
  to?: number;
  loop?: boolean;
  children?: SplitNode[];
}

export interface SplitPlan {
  /** Number of equal parts the belt is divided into (1/n each). */
  n: number;
  /** Equal parts per consumer. */
  parts: number[];
  root: SplitNode;
  splitters: number;
  mergers: number;
  /** Belts that arrive per consumer (to merge with mergers). */
  belts: number[];
  /** Parts that go back to the input (0 = no loopback). */
  loop: number;
}

const MAX_N = 36;

/** Smallest n ≤ MAX_N for which every rate is a whole number of 1/n of the total; 0 when there is none. */
export function shareDenominator(rates: number[]): number {
  const total = rates.reduce((s, r) => s + r, 0);
  if (total <= 0) return 0;
  for (let n = 1; n <= MAX_N; n++)
    if (rates.every((r) => Math.abs((r / total) * n - Math.round((r / total) * n)) < 1e-6)) return n;
  return 0;
}

/** Splitter / merger plan for dividing one belt over `rates` (null when no small plan exists). */
export function splitPlan(rates: number[]): SplitPlan | null {
  const total = rates.reduce((s, r) => s + r, 0);
  const n = shareDenominator(rates);
  if (!n || rates.length < 2) return null;
  const parts = rates.map((r) => Math.round((r / total) * n));
  const m = isSmooth(n) ? n : smoothUp(n);
  const loop = m - n;
  // the belt after the loopback merger carries m/n times the input
  const unit = total / n;
  let best: SplitPlan | null = null;
  // try the split orders (e.g. 3·3·2 or 2·3·3) and keep the one with the fewest splitters + mergers
  for (const order of orders(primeFactors(m))) {
    const need = [...parts, loop];
    let splitters = 0;
    const pieces = need.map(() => 0);
    const build = (size: number, depth: number): SplitNode => {
      // a whole branch to the consumer that still needs the most (and can take all of it)
      let pick = -1;
      need.forEach((c, i) => {
        if (c >= size && (pick < 0 || c > need[pick])) pick = i;
      });
      if (pick >= 0) {
        need[pick] -= size;
        pieces[pick]++;
        return pick === parts.length ? { rate: size * unit, loop: true } : { rate: size * unit, to: pick };
      }
      const f = order[depth];
      splitters++;
      const kids: SplitNode[] = [];
      for (let k = 0; k < f; k++) kids.push(build(size / f, depth + 1));
      return { rate: size * unit, children: kids };
    };
    const root = build(m, 0);
    // merging k belts into one takes ⌈(k−1)/2⌉ mergers (3 inputs each); the loopback also merges into the input
    const mergers = pieces.reduce((s, k, i) => s + Math.ceil((k - 1 + (i === parts.length && k ? 1 : 0)) / 2), 0);
    const plan: SplitPlan = { n, parts, belts: pieces.slice(0, parts.length), root, splitters, mergers, loop };
    if (!best || splitters + mergers < best.splitters + best.mergers) best = plan;
  }
  return best;
}

/** Distinct orderings of a list of factors (small lists only). */
function orders(f: number[]): number[][] {
  if (f.length <= 1) return [f];
  const seen = new Set<string>();
  const out: number[][] = [];
  const rec = (rest: number[], acc: number[]) => {
    if (!rest.length) {
      const k = acc.join(',');
      if (!seen.has(k)) (seen.add(k), out.push(acc));
      return;
    }
    rest.forEach((x, i) => rec([...rest.slice(0, i), ...rest.slice(i + 1)], [...acc, x]));
  };
  if (f.length > 6) return [f];
  rec(f, []);
  return out;
}
