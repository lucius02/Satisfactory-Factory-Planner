/**
 * Belt router: orthogonal A* on a 2 m grid that avoids the blocks of the production lines,
 * prefers few turns and avoids running on top of belts that were already routed.
 */
import type { Pt } from '../layout/geometry';

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

const CELL = 2;
const TURN = 3;
const USED = 4;
const DIRS: Pt[] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export class Router {
  private x0: number;
  private y0: number;
  private nx: number;
  private ny: number;
  private blocked: Uint8Array;
  private used: Uint8Array;

  constructor(boxes: Box[], extra: Pt[] = []) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const b of boxes) {
      x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y);
      x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h);
    }
    for (const [x, y] of extra) {
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
    }
    if (!Number.isFinite(x0)) (x0 = 0), (y0 = 0), (x1 = 1), (y1 = 1);
    const m = 24;
    this.x0 = Math.floor((x0 - m) / CELL) * CELL;
    this.y0 = Math.floor((y0 - m) / CELL) * CELL;
    this.nx = Math.ceil((x1 + m - this.x0) / CELL);
    this.ny = Math.ceil((y1 + m - this.y0) / CELL);
    this.blocked = new Uint8Array(this.nx * this.ny);
    this.used = new Uint8Array(this.nx * this.ny);
    for (const b of boxes) {
      // a cell is blocked when its centre lies inside the block
      const i0 = Math.ceil((b.x - this.x0) / CELL - 0.5);
      const i1 = Math.floor((b.x + b.w - this.x0) / CELL - 0.5);
      const j0 = Math.ceil((b.y - this.y0) / CELL - 0.5);
      const j1 = Math.floor((b.y + b.h - this.y0) / CELL - 0.5);
      for (let j = Math.max(0, j0); j <= Math.min(this.ny - 1, j1); j++)
        for (let i = Math.max(0, i0); i <= Math.min(this.nx - 1, i1); i++) this.blocked[j * this.nx + i] = 1;
    }
  }

  private cellOf([x, y]: Pt): [number, number] {
    const i = Math.min(this.nx - 1, Math.max(0, Math.floor((x - this.x0) / CELL)));
    const j = Math.min(this.ny - 1, Math.max(0, Math.floor((y - this.y0) / CELL)));
    return [i, j];
  }
  private center(i: number, j: number): Pt {
    return [this.x0 + (i + 0.5) * CELL, this.y0 + (j + 0.5) * CELL];
  }

  /** Path of cell centres from a to b (both excluded from blocking), or null. */
  route(a: Pt, b: Pt): Pt[] | null {
    const { nx, ny } = this;
    const [si, sj] = this.cellOf(a);
    const [ti, tj] = this.cellOf(b);
    const s = sj * nx + si;
    const tgt = tj * nx + ti;
    const N = nx * ny * 4;
    const g = new Float32Array(N).fill(Infinity);
    const prev = new Int32Array(N).fill(-1);
    const heap = new MinHeap();
    for (let d = 0; d < 4; d++) {
      g[s * 4 + d] = 0;
      heap.push(s * 4 + d, Math.abs(si - ti) + Math.abs(sj - tj));
    }
    let end = -1;
    let steps = 0;
    while (heap.size && steps++ < 400000) {
      const st = heap.pop();
      const c = st >> 2;
      const d = st & 3;
      if (c === tgt) {
        end = st;
        break;
      }
      const ci = c % nx;
      const cj = (c - ci) / nx;
      for (let nd = 0; nd < 4; nd++) {
        const ni = ci + DIRS[nd][0];
        const nj = cj + DIRS[nd][1];
        if (ni < 0 || nj < 0 || ni >= nx || nj >= ny) continue;
        const n = nj * nx + ni;
        if (this.blocked[n] && n !== tgt) continue;
        const cost = g[st] + 1 + (nd !== d ? TURN : 0) + this.used[n] * USED;
        const ns = n * 4 + nd;
        if (cost < g[ns]) {
          g[ns] = cost;
          prev[ns] = st;
          heap.push(ns, cost + Math.abs(ni - ti) + Math.abs(nj - tj));
        }
      }
    }
    if (end < 0) return null;
    const cells: number[] = [];
    for (let st = end; st >= 0; st = prev[st]) cells.push(st >> 2);
    cells.reverse();
    for (const c of cells) this.used[c] = Math.min(3, this.used[c] + 1);
    return cells.map((c) => this.center(c % nx, Math.floor(c / nx)));
  }
}

/** Remove points on a straight line. */
export function simplify(pts: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (const p of pts) {
    const n = out.length;
    if (n && Math.abs(out[n - 1][0] - p[0]) < 1e-6 && Math.abs(out[n - 1][1] - p[1]) < 1e-6) continue;
    if (n >= 2) {
      const a = out[n - 2];
      const b = out[n - 1];
      if ((Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(b[0] - p[0]) < 1e-6) || (Math.abs(a[1] - b[1]) < 1e-6 && Math.abs(b[1] - p[1]) < 1e-6)) {
        out[n - 1] = p;
        continue;
      }
    }
    out.push(p);
  }
  return out;
}

/** Join two points orthogonally (first along `vertFirst` axis). */
export function ortho(a: Pt, b: Pt, vertFirst: boolean): Pt[] {
  if (Math.abs(a[0] - b[0]) < 1e-6 || Math.abs(a[1] - b[1]) < 1e-6) return [a, b];
  return vertFirst ? [a, [a[0], b[1]], b] : [a, [b[0], a[1]], b];
}

class MinHeap {
  private k: number[] = [];
  private p: number[] = [];
  get size() {
    return this.k.length;
  }
  push(key: number, pri: number) {
    const { k, p } = this;
    let i = k.length;
    k.push(key);
    p.push(pri);
    while (i > 0) {
      const par = (i - 1) >> 1;
      if (p[par] <= p[i]) break;
      [k[i], k[par]] = [k[par], k[i]];
      [p[i], p[par]] = [p[par], p[i]];
      i = par;
    }
  }
  pop(): number {
    const { k, p } = this;
    const top = k[0];
    const lk = k.pop()!;
    const lp = p.pop()!;
    if (k.length) {
      k[0] = lk;
      p[0] = lp;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < k.length && p[l] < p[m]) m = l;
        if (r < k.length && p[r] < p[m]) m = r;
        if (m === i) break;
        [k[i], k[m]] = [k[m], k[i]];
        [p[i], p[m]] = [p[m], p[i]];
        i = m;
      }
    }
    return top;
  }
}

/**
 * Remove small jogs (Z-shapes of at most `max` metres) that come from snapping the route to the grid:
 * the middle part of the Z is moved so the two parallel segments line up. Start and end stay put.
 */
export function straighten(input: Pt[], max = 2.6): Pt[] {
  let pts = simplify(input.map((p) => [p[0], p[1]] as Pt));
  for (let guard = 0; guard < 20; guard++) {
    let changed = false;
    for (let i = 1; i + 2 < pts.length; i++) {
      const [p0, p1, p2, p3] = [pts[i - 1], pts[i], pts[i + 1], pts[i + 2]];
      const horiz = (a: Pt, b: Pt) => Math.abs(a[1] - b[1]) < 1e-6;
      const len = Math.abs(p1[0] - p2[0]) + Math.abs(p1[1] - p2[1]);
      if (len > max || len < 1e-6) continue;
      // p1→p2 is the short jog; p0→p1 and p2→p3 must be parallel
      if (horiz(p0, p1) !== horiz(p2, p3)) continue;
      const along = horiz(p0, p1) ? 1 : 0; // coordinate that differs across the jog
      if (i + 2 < pts.length - 1) {
        // move p2, p3 onto the line of p0→p1
        p2[along] = p1[along];
        p3[along] = p1[along];
      } else if (i - 1 > 0) {
        p0[along] = p2[along];
        p1[along] = p2[along];
      } else continue;
      changed = true;
    }
    pts = simplify(pts);
    if (!changed) break;
  }
  return pts;
}
