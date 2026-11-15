/**
 * Divide the output of a row of machines over consumers: every consumer gets as many whole machines
 * as fit in what it takes (its own belt), the machines that are left over are merged and divided
 * over the remainders with a splitter tree (`splitPlan`).
 * Example: 7 Constructors × 40 screws → 180 + 100: 4 machines (160) and 2 machines (80); the
 * seventh (40) is split 1:2 → 20 + 20.
 * Machines are used in their order: the first consumers take machines from the left, the last one
 * from the right, the leftovers sit between the last two (close to both of their belts).
 */
import { splitPlan, type SplitPlan } from '../calc/splitPlan';

export interface HybridSplit {
  /** Machine index range [from, to) per consumer (empty when it gets no whole machine). */
  chunks: { from: number; to: number }[];
  /** Leftover machines [from, to). */
  left: { from: number; to: number };
  /** What each consumer still needs from the leftover machines. */
  rem: number[];
  /** Splitter tree over the consumers with a remainder (null when at most one has one). */
  plan: SplitPlan | null;
  /** Consumer index per plan entry. */
  planTo: number[];
}

export function hybridSplit(per: number[], rates: number[], cap: number): HybridSplit | null {
  const n = per.length;
  const k = rates.length;
  if (k < 2 || rates.some((r) => r > cap + 1e-6)) return null;
  const tol = 1e-6 * Math.max(1, ...rates);
  const chunks: { from: number; to: number }[] = [];
  const got = rates.map(() => 0);
  // first consumers from the left
  let i = 0;
  for (let c = 0; c < k - 1; c++) {
    const from = i;
    while (i < n && got[c] + per[i] <= rates[c] + tol) got[c] += per[i++];
    chunks.push({ from, to: i });
  }
  // the last consumer from the right
  let j = n;
  while (j > i && got[k - 1] + per[j - 1] <= rates[k - 1] + tol) got[k - 1] += per[--j];
  chunks.push({ from: j, to: n });
  const rem = rates.map((r, c) => Math.max(0, r - got[c]));
  const leftRate = per.slice(i, j).reduce((a, x) => a + x, 0);
  const remSum = rem.reduce((a, x) => a + x, 0);
  if (Math.abs(leftRate - remSum) > Math.max(tol, 1e-4)) return null;
  const planTo = rem.map((r, c) => (r > tol ? c : -1)).filter((c) => c >= 0);
  let plan: SplitPlan | null = null;
  if (planTo.length > 1) {
    plan = splitPlan(planTo.map((c) => rem[c]));
    if (!plan) return null;
  }
  return { chunks, left: { from: i, to: j }, rem, plan, planTo };
}
