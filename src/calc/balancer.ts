/**
 * Load balancers (1:N) built from 1:2 and 1:3 splitters, see satisfactory.wiki.gg/wiki/Balancer.
 * Numbers with prime factors above 3 use a loopback: build the next 2ᵃ·3ᵇ balancer and feed the
 * unused outputs back into the input through a merger.
 */

/** Smallest 2ᵃ·3ᵇ ≥ n. */
export function smoothUp(n: number): number {
  n = Math.max(1, Math.ceil(n));
  for (let m = n; ; m++) if (isSmooth(m)) return m;
}

export function isSmooth(n: number): boolean {
  while (n % 2 === 0) n /= 2;
  while (n % 3 === 0) n /= 3;
  return n === 1;
}

export function primeFactors(n: number): number[] {
  const f: number[] = [];
  for (let p = 2; p * p <= n; p++) while (n % p === 0) (f.push(p), (n /= p));
  if (n > 1) f.push(n);
  return f;
}

/** Tree node: a splitter (children), a machine leaf or a loopback leaf. */
export type BNode =
  | { t: 'split'; children: BNode[]; loopRoot?: boolean; loops?: number }
  | { t: 'leaf' }
  | { t: 'loop' };

/** Split factors (2s then 3s) of a smooth number, ascending so the top of the tree stays small. */
function smoothFactors(m: number): number[] {
  return primeFactors(m).sort((a, b) => a - b);
}

/** Build the balancer tree for n outputs. */
export function balancerTree(n: number): BNode {
  if (n <= 1) return { t: 'leaf' };
  const stages = primeFactors(n).sort((a, b) => a - b);
  return buildStage(stages, 0);
}

function buildStage(stages: number[], idx: number): BNode {
  if (idx >= stages.length) return { t: 'leaf' };
  const f = stages[idx];
  const m = f <= 3 ? f : smoothUp(f);
  let used = 0;
  const factors = smoothFactors(m);
  const grow = (level: number): BNode => {
    if (level >= factors.length) {
      if (used < f) {
        used++;
        return buildStage(stages, idx + 1);
      }
      return { t: 'loop' };
    }
    return { t: 'split', children: Array.from({ length: factors[level] }, () => grow(level + 1)) };
  };
  const root = grow(0);
  if (m > f && root.t === 'split') {
    root.loopRoot = true;
    root.loops = m - f;
  }
  return root;
}

export interface BalancerCount {
  splitters: number;
  mergers: number;
  /** Number of tree levels (splitter rows, loopback merger counts as a row). */
  levels: number;
}

/** Splitters / mergers needed for a 1:n balancer. */
export function balancerCount(n: number): BalancerCount {
  const tree = balancerTree(n);
  let splitters = 0;
  let mergers = 0;
  const walk = (node: BNode): number => {
    if (node.t !== 'split') return 0;
    splitters++;
    // a loopback root has a merger in front; several unused outputs are merged first
    if (node.loopRoot) mergers += node.loops ?? 1;
    const d = Math.max(...node.children.map(walk));
    return 1 + d + (node.loopRoot ? 1 : 0);
  };
  const levels = walk(tree);
  return { splitters, mergers, levels };
}
