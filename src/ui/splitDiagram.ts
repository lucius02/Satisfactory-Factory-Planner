/** Small drawing of a split plan: belts, splitters and mergers as you would build them. */
import type { SplitNode, SplitPlan } from '../calc/splitPlan';
import { esc, fmt } from '../util/format';

const COL = 30; // px per end belt
const ROW = 36; // px per splitter level
const BOX = 16; // splitter / merger size

/** Consumer index a subtree mostly feeds (to group the end belts per consumer). */
function first(s: SplitNode): number {
  if (s.children) return Math.min(...s.children.map(first));
  return s.loop ? 99 : s.to!;
}

export function splitDiagram(plan: SplitPlan, names: string[], color: string, unitTxt: string): string {
  const d = splitDiagramBody(plan, names, color, unitTxt);
  return `<svg viewBox="0 0 ${d.W} ${d.H}" width="${d.W}" height="${d.H}" class="mt-1 block max-w-full" font-family="JetBrains Mono,monospace">${d.body}</svg>`;
}

/** The drawing itself (pixels). */
export function splitDiagramBody(plan: SplitPlan, names: string[], color: string, unitTxt: string): { W: number; H: number; body: string } {
  // children of each splitter ordered by consumer, so the belts of one consumer end up next to each other
  const sortTree = (s: SplitNode): SplitNode => (s.children ? { ...s, children: s.children.map(sortTree).sort((a, b) => first(a) - first(b)) } : s);
  const root = sortTree(plan.root);
  interface P { s: SplitNode; x: number; y: number; kids: P[] }
  let leaf = 0;
  let depth = 0;
  const place = (s: SplitNode, d: number): P => {
    depth = Math.max(depth, d);
    if (!s.children) return { s, x: (leaf++ + 0.5) * COL, y: d * ROW, kids: [] };
    const kids = s.children.map((c) => place(c, d + 1));
    return { s, x: kids.reduce((a, k) => a + k.x, 0) / kids.length, y: d * ROW, kids };
  };
  const pad = plan.loop ? 22 : 8;
  const top = plan.loop ? 34 : 18;
  const tree = place(root, 0);
  const W = leaf * COL + pad + 8;
  const yLeaf = depth * ROW + 14;
  const yBus = yLeaf + 14;
  const H = top + yBus + 52;
  const X = (x: number) => x + pad;
  const Y = (y: number) => y + top;
  let lines = '';
  let boxes = '';
  let text = '';
  const leaves: P[] = [];
  const box = (x: number, y: number, ch: string, round = false) =>
    (boxes += `<rect x="${x - BOX / 2}" y="${y - BOX / 2}" width="${BOX}" height="${BOX}" rx="${round ? 5 : 2}" fill="#1a1f25" stroke="${color}" stroke-width="1.2"/><text x="${x}" y="${y + 4}" font-size="10" text-anchor="middle" fill="${color}">${ch}</text>`);
  const walk = (p: P) => {
    if (!p.kids.length) {
      leaves.push(p);
      return;
    }
    box(X(p.x), Y(p.y), 'S');
    for (const k of p.kids) {
      const ky = k.kids.length ? Y(k.y) : Y(yLeaf);
      lines += `M${X(p.x)} ${Y(p.y) + BOX / 2}V${Y(p.y) + ROW / 2}H${X(k.x)}V${ky - (k.kids.length ? BOX / 2 : 0)}`;
      text += `<text x="${X(k.x) + 3}" y="${Y(p.y) + ROW / 2 + 10}" font-size="8" fill="#8e939b">${fmt(k.s.rate)}</text>`;
      walk(k);
    }
  };
  // input belt
  const inX = X(tree.x);
  lines += `M${inX} 2V${Y(0) - BOX / 2}`;
  text += `<text x="${inX + 4}" y="10" font-size="9" fill="${color}">${fmt(plan.root.rate)}${esc(unitTxt)}</text>`;
  if (plan.loop) box(inX, top - 12, 'M', true);
  walk(tree);
  // end belts per consumer: joined with mergers, then one belt to the consumer
  const groups = new Map<number, P[]>();
  for (const l of leaves) {
    const k = l.s.loop ? -1 : l.s.to!;
    groups.set(k, [...(groups.get(k) ?? []), l]);
  }
  let dash = '';
  for (const [k, ls] of groups) {
    const xs = ls.map((l) => X(l.x));
    if (k < 0) {
      // loopback: back up to the merger in front of the first splitter
      for (const x of xs) dash += `M${x} ${Y(yLeaf)}V${Y(yBus)}H${4}V${top - 12}H${inX - BOX / 2}`;
      continue;
    }
    const x0 = Math.min(...xs);
    const x1 = Math.max(...xs);
    const mx = (x0 + x1) / 2;
    for (const x of xs) lines += `M${x} ${Y(yLeaf)}V${Y(yBus)}`;
    if (xs.length > 1) {
      lines += `M${x0} ${Y(yBus)}H${x1}`;
      box(mx, Y(yBus), 'M', true);
    }
    lines += `M${mx} ${Y(yBus) + (xs.length > 1 ? BOX / 2 : 0)}V${Y(yBus) + 22}`;
    const rate = ls.reduce((a, l) => a + l.s.rate, 0);
    text += `<path d="M${mx - 4} ${Y(yBus) + 20}L${mx} ${Y(yBus) + 26}L${mx + 4} ${Y(yBus) + 20}z" fill="${color}"/>`;
    text += `<text x="${mx}" y="${Y(yBus) + 37}" font-size="9" text-anchor="middle" fill="#e6e8eb">${esc(names[k])}</text>`;
    text += `<text x="${mx}" y="${Y(yBus) + 47}" font-size="9" text-anchor="middle" fill="${color}">${fmt(rate)}${esc(unitTxt)}</text>`;
  }
  const body = `<path d="${lines}" fill="none" stroke="${color}" stroke-width="2"/>
    ${dash ? `<path d="${dash}" fill="none" stroke="${color}" stroke-width="1.3" stroke-dasharray="3 2"/>` : ''}
    ${boxes}${text}`;
  return { W, H, body };
}
