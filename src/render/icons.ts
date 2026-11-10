/**
 * Simple pictograms of the buildings (own drawings, not the game's artwork), in a 24 × 24 box.
 * Each is a list of SVG elements drawn with the building colour as stroke.
 */

const ICONS: Record<string, string> = {
  // furnace with a flame
  smelter:
    '<path d="M5 21V9l7-5 7 5v12z"/><path d="M12 18c-2 0-3-1.4-3-3 0-2 2-2.5 3-5 1 2.5 3 3 3 5 0 1.6-1 3-3 3z"/>',
  // crucible pouring
  foundry: '<path d="M4 7h14l-2 9H6z"/><path d="M18 9l3-2"/><path d="M9 19v2M12 18v3M15 19v2"/>',
  // gear
  constr: '<path d="M20.53 10.92L20.53 13.08L17.98 13.64L17.39 15.07L18.80 17.27L17.27 18.80L15.07 17.39L13.64 17.98L13.08 20.53L10.92 20.53L10.36 17.98L8.93 17.39L6.73 18.80L5.20 17.27L6.61 15.07L6.02 13.64L3.47 13.08L3.47 10.92L6.02 10.36L6.61 8.93L5.20 6.73L6.73 5.20L8.93 6.61L10.36 6.02L10.92 3.47L13.08 3.47L13.64 6.02L15.07 6.61L17.27 5.20L18.80 6.73L17.39 8.93L17.98 10.36Z"/><circle cx="12" cy="12" r="2.6"/>',
  // two gears
  assembler: '<path d="M13.65 8.26L13.65 9.74L11.93 10.08L11.49 11.01L12.29 12.56L11.13 13.49L9.80 12.36L8.79 12.59L8.08 14.18L6.63 13.85L6.68 12.11L5.88 11.46L4.19 11.90L3.54 10.56L4.94 9.52L4.94 8.48L3.54 7.44L4.19 6.10L5.88 6.54L6.68 5.89L6.63 4.15L8.08 3.82L8.79 5.41L9.80 5.64L11.13 4.51L12.29 5.44L11.49 6.99L11.93 7.92Z"/><circle cx="8.5" cy="9" r="1.5"/><path d="M21.15 14.76L21.15 16.24L19.43 16.58L18.99 17.51L19.79 19.06L18.63 19.99L17.30 18.86L16.29 19.09L15.58 20.68L14.13 20.35L14.18 18.61L13.38 17.96L11.69 18.40L11.04 17.06L12.44 16.02L12.44 14.98L11.04 13.94L11.69 12.60L13.38 13.04L14.18 12.39L14.13 10.65L15.58 10.32L16.29 11.91L17.30 12.14L18.63 11.01L19.79 11.94L18.99 13.49L19.43 14.42Z"/><circle cx="16" cy="15.5" r="1.5"/>',
  // robot arm
  manufacturer: '<path d="M4 21h8"/><path d="M8 21v-5l5-6 5 3"/><circle cx="13" cy="10" r="1.6"/><path d="M18 13l2 2M18 13l1-3"/>',
  // tank with a drop
  refinery: '<rect x="4" y="6" width="9" height="15" rx="2"/><path d="M13 10h4v4"/><path d="M19 15c0 1.7-1 3-2 3s-2-1.3-2-3 2-4 2-4 2 2.3 2 4z"/>',
  // mixing beaker
  blender: '<path d="M8 3h8M9 3v6l-5 10a2 2 0 0 0 2 3h12a2 2 0 0 0 2-3l-5-10V3"/><path d="M7 15h10"/>',
  // box
  packager: '<path d="M3 8l9-5 9 5v8l-9 5-9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
  // atom
  accel:
    '<circle cx="12" cy="12" r="1.8"/><ellipse cx="12" cy="12" rx="9" ry="3.5"/><ellipse cx="12" cy="12" rx="9" ry="3.5" transform="rotate(60 12 12)"/><ellipse cx="12" cy="12" rx="9" ry="3.5" transform="rotate(-60 12 12)"/>',
  // cycle arrows
  converter: '<path d="M5 12a7 7 0 0 1 12-5l2 2"/><path d="M19 4v5h-5"/><path d="M19 12a7 7 0 0 1-12 5l-2-2"/><path d="M5 20v-5h5"/>',
  // chip
  encoder:
    '<rect x="6" y="6" width="12" height="12" rx="1.5"/><path d="M9 3v3M12 3v3M15 3v3M9 18v3M12 18v3M15 18v3M3 9h3M3 12h3M3 15h3M18 9h3M18 12h3M18 15h3"/><path d="M10 10h4v4h-4z"/>',
  // drill
  miner: '<path d="M8 3h8v6H8z"/><path d="M9 9l3 12 3-12"/><path d="M10.5 13h3M11 16.5h2"/>',
  // water drop with waves
  water: '<path d="M12 3c3 4 6 7 6 10a6 6 0 0 1-12 0c0-3 3-6 6-10z"/><path d="M8.5 14c1 .8 2.3.8 3.5 0s2.5-.8 3.5 0"/>',
  // pump jack
  oil: '<path d="M3 21h18"/><path d="M7 21l4-9 4 9"/><path d="M4 9l14-3"/><path d="M18 6v8"/><circle cx="11" cy="8" r="1.4"/>',
  // gas cloud
  well: '<path d="M7 18a4 4 0 0 1 0-8 5 5 0 0 1 9.5-1.5A4 4 0 0 1 17 18z"/><path d="M9 21v-2M12 21v-2M15 21v-2"/>',
  // lightning bolt
  generator: '<path d="M13 2L5 14h6l-1 8 8-12h-6z"/>',
  // funnel into a hole
  sink: '<path d="M4 4h16l-6 8v6l-4 2v-8z"/>',
  // crate
  storage: '<rect x="3" y="6" width="18" height="14" rx="1"/><path d="M3 11h18M9 6v14M15 6v14"/>',
};

/** Pictogram key for a building, by its (English) name. */
export function iconKey(name: string): string | null {
  const n = name.toLowerCase();
  if (n.includes('smelter')) return 'smelter';
  if (n.includes('foundry')) return 'foundry';
  if (n.includes('constructor')) return 'constr';
  if (n.includes('assembler')) return 'assembler';
  if (n.includes('manufacturer')) return 'manufacturer';
  if (n.includes('refinery')) return 'refinery';
  if (n.includes('blender')) return 'blender';
  if (n.includes('packager')) return 'packager';
  if (n.includes('particle')) return 'accel';
  if (n.includes('converter')) return 'converter';
  if (n.includes('encoder')) return 'encoder';
  if (n.includes('miner')) return 'miner';
  if (n.includes('water extractor')) return 'water';
  if (n.includes('oil extractor')) return 'oil';
  if (n.includes('resource well')) return 'well';
  if (n.includes('generator') || n.includes('power plant') || n.includes('burner')) return 'generator';
  if (n.includes('sink')) return 'sink';
  if (n.includes('storage') || n.includes('buffer')) return 'storage';
  return null;
}

/** SVG for the pictogram of `name`, centred at (cx, cy) with the given size, or '' when there is none. */
export function buildingIcon(name: string, cx: number, cy: number, size: number, color: string): string {
  const key = iconKey(name);
  if (!key || size < 1.5) return '';
  const k = size / 24;
  return `<g transform="translate(${(cx - size / 2).toFixed(2)} ${(cy - size / 2).toFixed(2)}) scale(${k.toFixed(4)})" fill="none" stroke="${color}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" opacity=".75" pointer-events="none">${ICONS[key]}</g>`;
}

export const ICON_KEYS = Object.keys(ICONS);
