/** SVG floor plan in world coordinates (1 unit = 1 metre); pan/zoom via one matrix() transform. */
import { $, ctx } from '../app/context';
import { suppliers, type Group } from '../calc/model';
import { isFluid, itemName } from '../data/items';
import { t } from '../i18n';
import { PAR_STEP, POLE_CONNECTIONS, worldGeom, type Pt, type WorldGeom } from '../layout/geometry';
import { buildingIcon } from './icons';
import { ortho, Router, simplify, straighten } from './router';
import { FLOOR_H, powerNetwork } from '../layout/powerNet';
import { nearFullPipe, pumpsFor } from '../calc/pumps';
import { state } from '../state/store';
import { beltFor, col, esc, fmt, fmtInt, fname, hue, pct, unit } from '../util/format';
import { groupTitle, sourceName } from '../ui/labels';

const P = (pts: Pt[]) => 'M' + pts.map((p) => p[0].toFixed(2) + ' ' + p[1].toFixed(2)).join('L');

function line(pts: Pt[], c: string, w: number, dash: boolean): string {
  return `<path d="${P(pts)}" stroke="${c}" stroke-width="${w}" fill="none"${dash ? ' stroke-dasharray="1 .6"' : ''} stroke-linecap="round" stroke-linejoin="round"/>`;
}

function tag(x: number, y: number, txt: string, c: string, fs = 1.25, vertical = false): string {
  const tw = txt.length * fs * 0.5 + 1.2;
  return `<g${vertical ? ` transform="rotate(-90 ${x} ${y})"` : ''}><rect x="${x - tw / 2}" y="${y - fs * 0.92}" width="${tw}" height="${fs * 1.84}" rx=".5" fill="#0f1215" stroke="${c}" stroke-width=".12"/><text x="${x}" y="${y + fs * 0.36}" font-size="${fs}" text-anchor="middle" fill="${c}">${esc(txt)}</text></g>`;
}

function lift(pt: Pt, f: number, incoming: boolean, extra?: string): string {
  const up = incoming ? f < state.cur : f > state.cur;
  const s = `${incoming ? t('fromF') : t('toF')} ${fname(f)}${extra ? ' · ' + extra : ''}`;
  return (
    `<g><rect x="${pt[0] - 1.6}" y="${pt[1] - 1.6}" width="3.2" height="3.2" rx=".4" fill="#2a2214" stroke="#ffb85c" stroke-width=".25"/>` +
    `<text x="${pt[0]}" y="${pt[1] + 0.55}" font-size="1.6" text-anchor="middle" fill="#ffb85c" font-weight="700">${up ? '↑' : '↓'}</text></g>` +
    tag(pt[0], pt[1] + 3.2, s, '#ffb85c', 1.1)
  );
}

let routeCache: { key: string; routes: Record<string, Pt[]> } | null = null;

/**
 * Blocks right next to each other: the input lies just ahead of the output (within a few metres),
 * so connect them with a short straight / Z-shaped belt instead of routing around the blocks.
 */
function touching(a: Pt, da: Pt, b: Pt): Pt[] | null {
  const ahead = (b[0] - a[0]) * da[0] + (b[1] - a[1]) * da[1];
  const side = Math.abs((b[0] - a[0]) * da[1]) + Math.abs((b[1] - a[1]) * da[0]);
  if (ahead < -0.01 || ahead > 6 || side > 80) return null;
  if (side < 1e-6) return [a, b];
  const m: Pt = [a[0] + (da[0] * ahead) / 2, a[1] + (da[1] * ahead) / 2];
  const m2: Pt = da[1] !== 0 ? [b[0], m[1]] : [m[0], b[1]];
  return simplify([a, m, m2, b]);
}

/** Route a belt from output `a` (direction da) to input `b` (direction db), optionally via a waypoint. */
function routeBelt(router: Router | null, a: Pt, da: Pt, b: Pt, db: Pt, wp: [number, number] | undefined, off: number): Pt[] {
  const s = 3;
  const a1: Pt = [a[0] + da[0] * s, a[1] + da[1] * s];
  const b1: Pt = [b[0] - db[0] * s, b[1] - db[1] * s];
  if (!router) {
    if (!wp) return route(a, da, b, db, off);
    return simplify([a, ...ortho(a1, wp, da[1] !== 0), ...ortho(wp, b1, db[1] === 0), b]);
  }
  const legs: Pt[][] = [];
  const stops: Pt[] = wp ? [a1, wp, b1] : [a1, b1];
  for (let i = 0; i < stops.length - 1; i++) {
    const p = router.route(stops[i], stops[i + 1]);
    if (!p) return route(a, da, b, db, off);
    legs.push(p);
  }
  const pts: Pt[] = [a, a1];
  legs.forEach((leg, i) => {
    const start = pts[pts.length - 1];
    pts.push(...ortho(start, leg[0], i === 0 ? da[1] !== 0 : true).slice(1), ...leg.slice(1));
    const stop = stops[i + 1];
    pts.push(...ortho(pts[pts.length - 1], stop, i === legs.length - 1 ? db[1] === 0 : true).slice(1));
  });
  pts.push(b);
  return straighten(pts);
}

/** Pipeline pump: circle with "P" (and the number when more than one). */
function drawPump([x, y]: Pt, n: number, c: string): string {
  return (
    `<g pointer-events="none"><circle cx="${x}" cy="${y}" r="1.5" fill="#14202a" stroke="${c}" stroke-width=".3"/>` +
    `<text x="${x}" y="${y + 0.5}" font-size="1.4" text-anchor="middle" fill="${c}" font-weight="700">P</text>` +
    (n > 1 ? `<text x="${x + 1.9}" y="${y - 1}" font-size="1.1" fill="${c}">×${n}</text>` : '') +
    `</g>`
  );
}

function drawPole([x, y]: Pt, extra = false): string {
  return `<rect x="${x - 0.4}" y="${y - 0.4}" width=".8" height=".8" fill="${extra ? '#fff1b3' : '#ffd34d'}" stroke="#0d0f12" stroke-width=".15"/><circle cx="${x}" cy="${y}" r="1.6" fill="none" stroke="#ffd34d" stroke-opacity=".35" stroke-width=".15"/>`;
}

/** Power lines between production lines (minimum spanning tree, ≤ 100 m per wire). */
function drawPowerNet(cur: number): string {
  const net = powerNetwork(
    ctx.model.groups.map((g) => {
      const w = ctx.world[g.key];
      const poles = w.L.parts.filter((p) => p.t === 'pole');
      return { key: g.key, f: w.f, poles: poles.map((p) => w.T(p.u, p.v)), used: poles.map((p) => p.used ?? 0) };
    }),
    POLE_CONNECTIONS[state.pole - 1],
    state.floorH || FLOOR_H,
  );
  ctx.net = net;
  if (!state.showWires) return '';
  let h = '';
  for (const hp of net.helpers)
    if (hp.f === cur)
      h += `<path d="M${hp.of[0]} ${hp.of[1]}L${hp.at[0]} ${hp.at[1]}" stroke="#ffd34d" stroke-width=".2" pointer-events="none"/>` + drawPole(hp.at, true);
  for (const e of net.edges) {
    if (e.fa === cur && e.fb === cur) {
      h += `<path d="M${e.a[0]} ${e.a[1]}L${e.b[0]} ${e.b[1]}" stroke="#ffd34d" stroke-opacity=".7" stroke-width=".2" fill="none" stroke-dasharray=".9 .5" pointer-events="none"/>`;
      for (const p of e.extra) h += drawPole(p, true);
    } else if (e.fa === cur || e.fb === cur) {
      const p = e.fa === cur ? e.a : e.b;
      const other = e.fa === cur ? e.fb : e.fa;
      h += `<text x="${p[0] + 1}" y="${p[1] - 1}" font-size="1.4" fill="#ffd34d">⚡ ${other > cur ? '↑' : '↓'} ${fname(other)}</text>`;
    }
  }
  return h;
}

/**
 * Draw `n` belts / pipes side by side. Shifting an orthogonal path diagonally offsets both its horizontal
 * and its vertical parts, so the copies stay parallel.
 */
function parallel(pts: Pt[], n: number, draw: (pts: Pt[]) => string): string {
  if (n <= 1) return draw(pts);
  const step = PAR_STEP;
  let s = '';
  for (let i = 0; i < n; i++) {
    const d = (i - (n - 1) / 2) * step;
    s += draw(pts.map(([x, y]) => [x + d, y + d] as Pt));
  }
  return s;
}

/** Foundation lines (8 m) inside a block, so its width in foundations is easy to count. */
function foundationGrid(w: WorldGeom): string {
  let d = '';
  for (let x = w.x + 8; x < w.x + w.W - 1e-6; x += 8) d += `M${x} ${w.y}V${w.y + w.H}`;
  for (let y = w.y + 8; y < w.y + w.H - 1e-6; y += 8) d += `M${w.x} ${y}H${w.x + w.W}`;
  return d ? `<path d="${d}" stroke="#3a4350" stroke-width=".18" fill="none" pointer-events="none"/>` : '';
}

/** Dashed outline of the maximum floor size. */
function floorFrame(): string {
  if (!(state.floorW > 0 || state.floorL > 0)) return '';
  const b = bounds(true);
  const x = 0;
  const y = 0;
  const w = state.floorW > 0 ? state.floorW * 8 : Math.max(8, (b?.x1 ?? 8) - x);
  const h = state.floorL > 0 ? state.floorL * 8 : Math.max(8, (b?.y1 ?? 8) - y);
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="#f29b30" stroke-opacity=".55" stroke-width=".5" stroke-dasharray="3 1.5" pointer-events="none"/>`;
}

/** Orthogonal route between an output (direction da) and an input (direction db). */
function route(a: Pt, da: Pt, b: Pt, db: Pt, off: number): Pt[] {
  const s = 4;
  const a1: Pt = [a[0] + da[0] * s, a[1] + da[1] * s];
  const b1: Pt = [b[0] - db[0] * s, b[1] - db[1] * s];
  const pts: Pt[] = [a, a1];
  const av = da[1] !== 0;
  const bv = db[1] !== 0;
  if (av && bv) {
    const m = (a1[1] + b1[1]) / 2 + off;
    pts.push([a1[0], m], [b1[0], m]);
  } else if (!av && !bv) {
    const m = (a1[0] + b1[0]) / 2 + off;
    pts.push([m, a1[1]], [m, b1[1]]);
  } else if (av) pts.push([a1[0], b1[1]]);
  else pts.push([b1[0], a1[1]]);
  pts.push(b1, b);
  return pts;
}

function drawNode(w: WorldGeom, u: number, v: number, kind: 'split' | 'merge' | 'junc', item: string): string {
  const [x, y] = w.T(u, v);
  const c = col(item);
  // junction: filled diamond with a dark cross (clearly different from the hollow round drag point)
  if (kind === 'junc')
    return `<path d="M${x} ${y - 1.3}L${x + 1.3} ${y}L${x} ${y + 1.3}L${x - 1.3} ${y}z" fill="${c}" stroke="#0d0f12" stroke-width=".2"/><path d="M${x - 0.6} ${y}H${x + 0.6}M${x} ${y - 0.6}V${y + 0.6}" stroke="#0d0f12" stroke-width=".25"/>`;
  const s = 3.4; // 4 m footprint, drawn slightly smaller so neighbours stay apart
  const label = kind === 'split' ? 'S' : 'M';
  return (
    `<rect x="${x - s / 2}" y="${y - s / 2}" width="${s}" height="${s}" rx="${kind === 'merge' ? 1.2 : 0.4}" fill="#1a1f25" stroke="${c}" stroke-width=".22"/>` +
    `<text x="${x}" y="${y + 0.5}" font-size="1.4" text-anchor="middle" fill="${c}" font-family="JetBrains Mono,monospace">${label}</text>`
  );
}

function drawGroup(g: Group, w: WorldGeom, ghost: boolean): string {
  const L = w.L;
  const T = w.T;
  let s = ghost ? `<g opacity=".2" pointer-events="none">` : `<g data-key="${g.key}">`;
  if (L.src) {
    const c = col(g.id);
    const a = T(1, 1);
    const b2 = T(L.U - 1, L.V - 1.6);
    const x = Math.min(a[0], b2[0]);
    const y = Math.min(a[1], b2[1]);
    const ww = Math.abs(b2[0] - a[0]);
    const hh = Math.abs(b2[1] - a[1]);
    const name = itemName(g.id);
    s += `<rect x="${x}" y="${y}" width="${ww}" height="${hh}" rx=".5" fill="${c}" fill-opacity=".14" stroke="${c}" stroke-width=".25"/>`;
    const fs = Math.min(1.7, (ww - 1) / (name.length * 0.6));
    s += `<text x="${x + ww / 2}" y="${y + hh / 2 - 0.3}" font-size="${fs.toFixed(2)}" font-weight="600" text-anchor="middle" fill="${c}">${esc(name)}</text>`;
    const sub = `${Number.isFinite(g.ex!.per) ? g.count + '× ' : ''}${sourceName(g)}`;
    s += `<text x="${x + ww / 2}" y="${y + hh / 2 + 1.8}" font-size="${Math.min(1.2, (ww - 1) / (sub.length * 0.55)).toFixed(2)}" text-anchor="middle" fill="#aab2bc">${esc(sub)}</text>`;
    for (const l of L.outLanes) s += line([T(l.pu, L.V - 1.6), T(l.pu, L.V)], c, 0.6, false);
    for (const p of L.parts) {
      if (p.t === 'pole') s += drawPole(T(p.u, p.v));
      else if (p.t === 'wire' && state.showWires) s += `<path d="M${T(...p.a).join(' ')}L${T(...p.b).join(' ')}" stroke="#ffd34d" stroke-opacity=".75" stroke-width=".14" pointer-events="none"/>`;
    }
  } else {
    for (const p of L.parts) {
      // a dark casing under every belt / pipe makes crossings readable (the later one runs on top)
      if (p.t === 'belt')
        s += parallel(p.pts.map(([u, v]) => T(u, v)), p.n ?? 1, (q) => line(q, '#12151a', p.w + 0.55, false) + line(q, col(p.item), p.w, isFluid(p.item)));
      else if (p.t === 'loop')
        s += `<path d="${P(p.pts.map(([u, v]) => T(u, v)))}" stroke="${col(p.item)}" stroke-width=".35" fill="none" stroke-dasharray=".8 .5" marker-end="url(#arr)"/>`;
    }
    for (const p of L.parts) {
      if (p.t === 'split' || p.t === 'merge' || p.t === 'junc') s += drawNode(w, p.u, p.v, p.t, p.item);
      else if (p.t === 'pole') {
        s += drawPole(T(p.u, p.v));
      }
    }
    if (state.showWires) {
      let d = '';
      for (const p of L.parts) {
        if (p.t !== 'wire') continue;
        const [x1, y1] = T(p.a[0], p.a[1]);
        const [x2, y2] = T(p.b[0], p.b[1]);
        d += `M${x1.toFixed(2)} ${y1.toFixed(2)}L${x2.toFixed(2)} ${y2.toFixed(2)}`;
      }
      if (d) s += `<path d="${d}" stroke="#ffd34d" stroke-opacity=".75" stroke-width=".14" fill="none" pointer-events="none"/>`;
    }
    const bd = L.bld!;
    for (const m of L.machines) {
      const c1 = T(m.u, m.v);
      const c2 = T(m.u + m.w, m.v + m.l);
      const a: Pt = [Math.min(c1[0], c2[0]), Math.min(c1[1], c2[1])];
      const bw = Math.abs(c2[0] - c1[0]);
      const bh = Math.abs(c2[1] - c1[1]);
      s += `<rect x="${a[0]}" y="${a[1]}" width="${bw}" height="${bh}" rx=".4" fill="${bd.c}" fill-opacity=".22" stroke="${bd.c}" stroke-width=".25"/>`;
      const fs = Math.min(1.3, (bw - 0.8) / (bd.n.length * 0.6));
      // pictogram of the building in the upper part, name and clock speed underneath
      const icon = Math.min(bw * 0.7, bh * 0.42, 9);
      const showIcon = icon >= 2.2;
      const textY = showIcon ? a[1] + bh * 0.42 + icon / 2 + fs : a[1] + bh / 2 - 0.2;
      if (showIcon) s += buildingIcon(bd.n, a[0] + bw / 2, a[1] + bh * 0.42, icon, bd.c);
      s += `<text x="${a[0] + bw / 2}" y="${textY.toFixed(2)}" font-size="${fs.toFixed(2)}" text-anchor="middle" fill="#d8d4cc">${esc(bd.n)}</text>`;
      if (g.kind === 'machine' || g.kind === 'generator' || g.kind === 'source')
        s += `<text x="${a[0] + bw / 2}" y="${(textY + 1.7).toFixed(2)}" font-size="${Math.min(1.4, bw / 5).toFixed(2)}" text-anchor="middle" fill="${m.clock < 0.999 ? '#ffb85c' : '#9aa3ad'}" font-family="JetBrains Mono,monospace">${pct(m.clock)}</text>`;
    }
  }
  let title: string;
  if (g.kind === 'source') title = `${itemName(g.id)} · ${fmt(g.rate)}${unit(g.id)}`;
  else if (g.kind === 'sink') title = `AWESOME Sink · ${g.count}× · ${fmtInt(g.sinkPoints ?? 0)} ${t('pointsMin')}`;
  else if (g.kind === 'storage') title = `${t('storageBlock')}: ${itemName(g.id)} · ${fmt(g.rate)}${unit(g.id)}`;
  else if (g.kind === 'generator') title = `${groupTitle(g)} · ${fmtInt(g.gen ?? 0)} MW · ${g.count}×`;
  else title = `${groupTitle(g)} · ${fmt(g.rate)}${unit(g.id)} · ${g.count}× ${g.bld!.n}`;
  // the title must fit above its own block (narrow blocks: smaller text, then the short title)
  const room = w.W - 0.6;
  let fs = Math.min(1.9, room / (title.length * 0.56));
  if (fs < 1.1) {
    title = g.kind === 'source' ? itemName(g.id) : `${groupTitle(g)} · ${g.count}×`;
    fs = Math.max(0.9, Math.min(1.9, room / (title.length * 0.56)));
  }
  s += `<text x="${w.x + 0.3}" y="${w.y - 0.9}" font-size="${fs.toFixed(2)}" font-weight="600" fill="${ctx.sel === g.key ? '#ffb85c' : '#e8e4db'}"><title>${esc(title)}</title>${esc(title)}</text>`;
  return s + '</g>';
}

export function renderMap(opts: { fast?: boolean } = {}): void {
  const { model } = ctx;
  const WG: Record<string, WorldGeom> = {};
  for (const g of model.groups) WG[g.key] = worldGeom(ctx.local[g.key], state.pos[g.key]);
  ctx.world = WG;
  const F = state.floors || 1;
  const cur = Math.min(state.cur || 0, F - 1);
  const onCur = (g: Group) => WG[g.key].f === cur;

  // overlapping groups
  const bad = new Set<string>();
  const arr = model.groups.map((g) => [g.key, WG[g.key]] as const);
  for (let i = 0; i < arr.length; i++)
    for (let j = i + 1; j < arr.length; j++) {
      const A = arr[i][1];
      const B = arr[j][1];
      if (A.f !== B.f) continue;
      if (A.x < B.x + B.W - 1e-6 && B.x < A.x + A.W - 1e-6 && A.y < B.y + B.H - 1e-6 && B.y < A.y + A.H - 1e-6) {
        bad.add(arr[i][0]);
        bad.add(arr[j][0]);
      }
    }

  let h = `<rect x="-6000" y="-6000" width="12000" height="12000" fill="url(#g32)"/>`;
  if (F > 1 && cur > 0) for (const g of model.groups) if (WG[g.key].f === cur - 1) h += drawGroup(g, WG[g.key], true);
  for (const g of model.groups) {
    if (!onCur(g)) continue;
    const w = WG[g.key];
    h += `<g data-key="${g.key}" class="${ctx.sel === g.key ? 'gsel' : ''} ${bad.has(g.key) ? 'gbad' : ''}"><rect class="grp" x="${w.x}" y="${w.y}" width="${w.W}" height="${w.H}" rx=".6"/>${foundationGrid(w)}<text x="${w.x + w.W - 0.6}" y="${w.y + w.H - 0.7}" font-size="1.5" text-anchor="end" fill="#8e939b" font-family="JetBrains Mono,monospace">${w.W / 8}×${w.H / 8}</text></g>`;
  }

  // belts between groups
  interface Conn { key: string; item: string; rate: number; pts: Pt[]; label: boolean; touch?: Pt }
  const conns: Conn[] = [];
  let lifts = '';
  const jobs: { key: string; item: string; rate: number; a: Pt; da: Pt; b: Pt; db: Pt; pre: Pt[]; post: Pt[]; label: boolean }[] = [];
  for (const g of model.groups) {
    const w = WG[g.key];
    g.inputs.forEach((inp, k) => {
      suppliers(model, inp.item).forEach((sp, si) => {
        const pw = WG[sp.g.key];
        if (pw.f !== cur && w.f !== cur) return;
        const rate = inp.rate * sp.share;
        const from = pw.outFor(inp.item, g.key);
        const key = `${sp.g.key}>${g.key}|${inp.item}`;
        if (pw.f === w.f) {
          jobs.push({ key, item: inp.item, rate, a: from, da: pw.dir, b: w.ins[k], db: w.dir, pre: [], post: [], label: true });
          return;
        }
        const inp0 = w.ins[k];
        const Lp: Pt = [inp0[0] - w.dir[0] * 7 + w.dir[1] * si * 4, inp0[1] - w.dir[1] * 7 + w.dir[0] * si * 4];
        if (w.f === cur) {
          conns.push({ key, item: inp.item, rate, pts: [Lp, [inp0[0] - w.dir[0] * 7, inp0[1] - w.dir[1] * 7], inp0], label: false });
          // a fluid that has to go up needs pumps (head lift: machine 10 m, Pump Mk.1 +20 m, Mk.2 +50 m)
          const pumps = isFluid(inp.item) && w.f > pw.f ? pumpsFor((w.f - pw.f) * (state.floorH || FLOOR_H), inp.item) : null;
          const pumpTxt = pumps && pumps.mk1 ? ` · +${pumps.mk1}× Pump Mk1` : '';
          lifts += lift(Lp, pw.f, true, `${fmt(rate)}${unit(inp.item)}${pumpTxt}`);
          // pump symbol on the pipe between the lift and the block
          if (pumps?.mk1) lifts += drawPump([Lp[0] + (inp0[0] - Lp[0]) * 0.5, Lp[1] + (inp0[1] - Lp[1]) * 0.5], pumps.mk1, col(inp.item));
        } else {
          jobs.push({ key, item: inp.item, rate, a: from, da: pw.dir, b: Lp, db: w.dir, pre: [], post: [], label: true });
          lifts += lift(Lp, w.f, false);
        }
      });
    });
  }
  const boxes = model.groups.filter((g) => onCur(g)).map((g) => ({ x: WG[g.key].x, y: WG[g.key].y, w: WG[g.key].W, h: WG[g.key].H }));
  // a moved belt keeps its drag point relative to the middle between its two ends, so it moves along with the blocks
  const wpOf = (j: (typeof jobs)[number]): [number, number] | undefined => {
    const off = state.beltOff[j.key];
    const mid: Pt = [(j.a[0] + j.b[0]) / 2, (j.a[1] + j.b[1]) / 2];
    ctx.beltMid[j.key] = mid;
    return off ? [mid[0] + off[0], mid[1] + off[1]] : undefined;
  };
  const wps: Record<string, [number, number] | undefined> = {};
  for (const j of jobs) wps[j.key] = wpOf(j);
  const cacheKey = JSON.stringify([boxes, jobs.map((j) => [j.key, j.a, j.b, wps[j.key]])]);
  let routed: Record<string, Pt[]>;
  if (!opts.fast && routeCache?.key === cacheKey) routed = routeCache.routes;
  else {
    routed = {};
    const router = opts.fast ? null : new Router(boxes, jobs.flatMap((j) => [j.a, j.b]));
    // long connections first, they need the free channels most
    const sorted = [...jobs].sort((x, y) => Math.abs(y.a[0] - y.b[0]) + Math.abs(y.a[1] - y.b[1]) - (Math.abs(x.a[0] - x.b[0]) + Math.abs(x.a[1] - x.b[1])));
    for (const j of sorted)
      routed[j.key] = touching(j.a, j.da, j.b) ?? routeBelt(router, j.a, j.da, j.b, j.db, wps[j.key], ((hue(j.item) % 5) - 2) * 1.3);
    if (!opts.fast) routeCache = { key: cacheKey, routes: routed };
  }
  // belts between blocks that touch get no text (click them to see what runs over them)
  for (const j of jobs) {
    const touch = !!touching(j.a, j.da, j.b);
    conns.push({ key: j.key, item: j.item, rate: j.rate, pts: routed[j.key], label: j.label && !touch, touch: touch ? j.db : undefined });
  }

  let labels = '';
  let handles = '';
  ctx.conns = {};
  for (const c of conns) {
    ctx.conns[c.key] = { item: c.item, rate: c.rate };
    const fl = isFluid(c.item);
    const col_ = col(c.item);
    const pts = c.pts;
    const nBelts = Math.max(1, Math.ceil(c.rate / (fl ? model.caps.pipe : model.caps.belt) - 1e-6));
    h += parallel(pts, nBelts, (q) => `<path d="${P(q)}" fill="none" stroke="#0d0f12" stroke-width="1.5" stroke-linejoin="round"/>`);
    h += parallel(
      pts,
      nBelts,
      (q) =>
        `<path d="${P(q)}" fill="none" stroke="${col_}" stroke-width=".7" stroke-linejoin="round"${fl ? ' stroke-dasharray="1.6 .8"' : ''}${c.touch ? '' : ' marker-end="url(#arr)"'}/>`,
    );
    // blocks against each other: the last piece is (almost) zero long, so draw the arrow into the block ourselves
    if (c.touch) {
      const [bx, by] = pts[pts.length - 1];
      const [dx, dy] = c.touch;
      const tip: Pt = [bx + dx * 1.2, by + dy * 1.2];
      const l: Pt = [bx - dy * 0.8, by + dx * 0.8];
      const r: Pt = [bx + dy * 0.8, by - dx * 0.8];
      h += `<path d="M${l[0]} ${l[1]}L${tip[0]} ${tip[1]}L${r[0]} ${r[1]}z" fill="${col_}"/>`;
    }
    // wide invisible hit area: click a belt to see what runs over it
    h += `<path class="belt-hit" data-conn="${esc(c.key)}" d="${P(pts)}" fill="none" stroke="transparent" stroke-width="2.4"/>`;
    let best = 0;
    let bi = 1;
    for (let i = 1; i < pts.length; i++) {
      const d = Math.abs(pts[i][0] - pts[i - 1][0]) + Math.abs(pts[i][1] - pts[i - 1][1]);
      if (d > best) {
        best = d;
        bi = i;
      }
    }
    const mid: Pt = [(pts[bi][0] + pts[bi - 1][0]) / 2, (pts[bi][1] + pts[bi - 1][1]) / 2];
    const length = pts.reduce((sum, p, i) => (i ? sum + Math.abs(p[0] - pts[i - 1][0]) + Math.abs(p[1] - pts[i - 1][1]) : 0), 0);
    // short belts (blocks right next to each other) get no text; click them instead
    if (c.label && length >= 18) {
      const vertical = Math.abs(pts[bi][0] - pts[bi - 1][0]) < 1e-6;
      const perPipe = c.rate / Math.max(1, Math.ceil(c.rate / (fl ? model.caps.pipe : model.caps.belt) - 1e-6));
      const warn = fl && nearFullPipe(perPipe, model.caps.pipe) ? ' ⚠' : '';
      const txt = `${itemName(c.item)} · ${fmt(c.rate)}${unit(c.item)} · ${beltFor(c.rate, c.item)}${warn}`;
      labels += vertical ? tag(mid[0] - 1.6, mid[1], txt, col_, 1.25, true) : tag(mid[0], mid[1] - 1.6, txt, col_);
      const wp = wps[c.key];
      const hp = wp ?? mid;
      handles += `<circle class="belt-handle${wp ? ' moved' : ''}" data-belt="${esc(c.key)}" cx="${hp[0]}" cy="${hp[1]}" r="1.1" fill="#0d0f12" stroke="${col_}" stroke-width=".35"><title>${esc(t('beltHint'))}</title></circle>`;
    }
  }

  // end products and loose surplus
  for (const g of model.groups) {
    if (!onCur(g)) continue;
    const w = WG[g.key];
    g.outputs.forEach((o, j) => {
      const target = j === 0 && g.kind === 'machine' ? model.targets[o.item] ?? 0 : 0;
      const tot = (model.supply[o.item] ?? []).reduce((s, x) => s + x.rate, 0) || 1;
      const leftHere = state.surplus === 'output' ? ((model.left[o.item] ?? 0) * o.rate) / tot : 0;
      const items: [string, string][] = [];
      if (target > 1e-6) items.push([`★ ${t('endProduct')}: ${fmt(target)}${unit(o.item)}`, '#ffb85c']);
      if (leftHere > 1e-6) items.push([`${t('surplus')}: ${itemName(o.item)} ${fmt(leftHere)}${unit(o.item)}`, '#9aa3ad']);
      if (!items.length) return;
      const p = target > 1e-6 ? w.outFor(o.item, '*target') : w.outs[w.outIdx[o.item]];
      const end: Pt = [p[0] + w.dir[0] * 3, p[1] + w.dir[1] * 3];
      h += `<path d="${P([p, end])}" stroke="${items[0][1]}" stroke-width=".7" fill="none" marker-end="url(#arr)"/>`;
      items.forEach(([txt, c], i) => {
        labels += tag(end[0] + w.dir[0] * 2, end[1] + w.dir[1] * 2 + (w.dir[1] ? 1.2 : 0) + i * 2.4, txt, c, 1.2);
      });
    });
  }

  for (const g of model.groups) if (onCur(g)) h += drawGroup(g, WG[g.key], false);
  $('#world').innerHTML = floorFrame() + h + drawPowerNet(cur) + labels + lifts + handles;
  applyView();
}

export function applyView(): void {
  const { k, tx, ty } = ctx.view;
  $('#world').setAttribute('transform', `matrix(${k} 0 0 ${k} ${tx} ${ty})`);
}

export function bounds(onlyCur: boolean) {
  let x0 = 1e9;
  let y0 = 1e9;
  let x1 = -1e9;
  let y1 = -1e9;
  for (const k in ctx.world) {
    const w = ctx.world[k];
    if (onlyCur && w.f !== (state.cur || 0)) continue;
    x0 = Math.min(x0, w.x);
    y0 = Math.min(y0, w.y);
    x1 = Math.max(x1, w.x + w.W);
    y1 = Math.max(y1, w.y + w.H);
  }
  return x0 > x1 ? null : { x0, y0, x1, y1 };
}

export function fitView(): void {
  const b = bounds(true) ?? bounds(false);
  const r = $('#map').getBoundingClientRect();
  if (!b || !r.width) return;
  const by0 = b.y0 - 4;
  const k = Math.max(0.4, Math.min(30, Math.min((r.width - 80) / (b.x1 - b.x0), (r.height - 80) / (b.y1 - by0))));
  ctx.view = { k, tx: (r.width - (b.x1 - b.x0) * k) / 2 - b.x0 * k, ty: (r.height - (b.y1 - by0) * k) / 2 - by0 * k };
  applyView();
}

export function zoomAt(f: number, cx: number, cy: number): void {
  const v = ctx.view;
  const k2 = Math.max(0.3, Math.min(40, v.k * f));
  v.tx = cx - (cx - v.tx) * (k2 / v.k);
  v.ty = cy - (cy - v.ty) * (k2 / v.k);
  v.k = k2;
  applyView();
}
