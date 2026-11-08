/**
 * Recipes for Satisfactory 1.0 (satisfactory.wiki.gg). All amounts are per minute at 100%.
 * `RECIPES[itemId]` lists the recipes whose main product is `itemId`; `out` also holds byproducts.
 */
import { defineItem, FLUIDS, ITEMS } from './items';
import type { Amounts, BuildingId, ItemId, Recipe, TierGroup } from './types';

export const RECIPES: Record<ItemId, Recipe[]> = {};

interface RecOpts {
  name?: string;
  mw?: number;
}

/** Standard recipe; also registers the item in the given tier group. */
function rec(
  id: ItemId,
  name: string,
  tier: TierGroup,
  b: BuildingId,
  ins: Amounts,
  out: number,
  extra?: Amounts | null,
  o: RecOpts = {},
): void {
  defineItem(id, name, { tier });
  (RECIPES[id] ??= []).push({ name: o.name ?? name, b, in: ins, out: { [id]: out, ...(extra ?? {}) }, mw: o.mw });
}

/** Alternate recipe (unlocked with Hard Drives). */
function A(id: ItemId, name: string, b: BuildingId, ins: Amounts, out: number, extra?: Amounts | null, mw?: number): void {
  const it = ITEMS[id];
  if (!it || it.tier == null) defineItem(id, it ? it.n : id, { tier: 6 });
  (RECIPES[id] ??= []).push({ name, b, in: ins, out: { [id]: out, ...(extra ?? {}) }, alt: true, mw });
}

// ---------- Tier 0–6 ----------
rec('iron-ingot', 'Iron Ingot', 6, 'smelter', { 'iron-ore': 30 }, 30);
rec('copper-ingot', 'Copper Ingot', 6, 'smelter', { 'copper-ore': 30 }, 30);
rec('caterium-ingot', 'Caterium Ingot', 6, 'smelter', { 'caterium-ore': 45 }, 15);
rec('steel-ingot', 'Steel Ingot', 6, 'foundry', { 'iron-ore': 45, coal: 45 }, 45);
rec('concrete', 'Concrete', 6, 'constr', { limestone: 45 }, 15);
rec('iron-plate', 'Iron Plate', 6, 'constr', { 'iron-ingot': 30 }, 20);
rec('iron-rod', 'Iron Rod', 6, 'constr', { 'iron-ingot': 15 }, 15);
rec('screw', 'Screw', 6, 'constr', { 'iron-rod': 10 }, 40);
rec('wire', 'Wire', 6, 'constr', { 'copper-ingot': 15 }, 30);
rec('cable', 'Cable', 6, 'constr', { wire: 60 }, 30);
rec('copper-sheet', 'Copper Sheet', 6, 'constr', { 'copper-ingot': 20 }, 10);
rec('steel-beam', 'Steel Beam', 6, 'constr', { 'steel-ingot': 60 }, 15);
rec('steel-pipe', 'Steel Pipe', 6, 'constr', { 'steel-ingot': 30 }, 20);
rec('quickwire', 'Quickwire', 6, 'constr', { 'caterium-ingot': 12 }, 60);
rec('silica', 'Silica', 6, 'constr', { 'raw-quartz': 22.5 }, 37.5);
rec('quartz-crystal', 'Quartz Crystal', 6, 'constr', { 'raw-quartz': 37.5 }, 22.5);
rec('black-powder', 'Black Powder', 6, 'assembler', { coal: 15, sulfur: 15 }, 30);
rec('smokeless-powder', 'Smokeless Powder', 6, 'refinery', { 'black-powder': 20, 'heavy-oil-residue': 10 }, 20);
rec('plastic', 'Plastic', 6, 'refinery', { 'crude-oil': 30 }, 20, { 'heavy-oil-residue': 10 });
rec('rubber', 'Rubber', 6, 'refinery', { 'crude-oil': 30 }, 20, { 'heavy-oil-residue': 20 });
rec('fuel', 'Fuel', 6, 'refinery', { 'crude-oil': 60 }, 40, { 'polymer-resin': 30 });
rec('heavy-oil-residue', 'Heavy Oil Residue', 6, 'refinery', { 'crude-oil': 30 }, 40, { 'polymer-resin': 20 });
rec('petroleum-coke', 'Petroleum Coke', 6, 'refinery', { 'heavy-oil-residue': 40 }, 120);
rec('empty-canister', 'Empty Canister', 6, 'constr', { plastic: 30 }, 60);
rec('reinforced-iron-plate', 'Reinforced Iron Plate', 6, 'assembler', { 'iron-plate': 30, screw: 60 }, 5);
rec('rotor', 'Rotor', 6, 'assembler', { 'iron-rod': 20, screw: 100 }, 4);
rec('modular-frame', 'Modular Frame', 6, 'assembler', { 'reinforced-iron-plate': 3, 'iron-rod': 12 }, 2);
rec('smart-plating', 'Smart Plating', 6, 'assembler', { 'reinforced-iron-plate': 2, rotor: 2 }, 2);
rec('encased-industrial-beam', 'Encased Industrial Beam', 6, 'assembler', { 'steel-beam': 18, concrete: 36 }, 6);
rec('stator', 'Stator', 6, 'assembler', { 'steel-pipe': 15, wire: 40 }, 5);
rec('motor', 'Motor', 6, 'assembler', { rotor: 10, stator: 10 }, 5);
rec('versatile-framework', 'Versatile Framework', 6, 'assembler', { 'modular-frame': 2.5, 'steel-beam': 30 }, 5);
rec('automated-wiring', 'Automated Wiring', 6, 'assembler', { stator: 2.5, cable: 50 }, 2.5);
rec('circuit-board', 'Circuit Board', 6, 'assembler', { 'copper-sheet': 15, plastic: 30 }, 7.5);
rec('ai-limiter', 'AI Limiter', 6, 'assembler', { 'copper-sheet': 25, quickwire: 100 }, 5);
rec('computer', 'Computer', 6, 'manufacturer', { 'circuit-board': 10, cable: 20, plastic: 40 }, 2.5);
rec('heavy-modular-frame', 'Heavy Modular Frame', 6, 'manufacturer',
  { 'modular-frame': 10, 'steel-pipe': 40, 'encased-industrial-beam': 10, screw: 240 }, 2);
rec('modular-engine', 'Modular Engine', 6, 'manufacturer', { motor: 2, rubber: 15, 'smart-plating': 2 }, 1);
rec('crystal-oscillator', 'Crystal Oscillator', 6, 'manufacturer',
  { 'quartz-crystal': 18, cable: 14, 'reinforced-iron-plate': 2.5 }, 1);
rec('high-speed-connector', 'High-Speed Connector', 6, 'manufacturer',
  { quickwire: 210, cable: 37.5, 'circuit-board': 3.75 }, 3.75);
rec('adaptive-control-unit', 'Adaptive Control Unit', 6, 'manufacturer',
  { 'automated-wiring': 7.5, 'circuit-board': 5, 'heavy-modular-frame': 1, computer: 2 }, 1);
// Packaging (Packager)
rec('packaged-water', 'Packaged Water', 6, 'packager', { water: 60, 'empty-canister': 60 }, 60);
rec('packaged-oil', 'Packaged Oil', 6, 'packager', { 'crude-oil': 30, 'empty-canister': 30 }, 30);
rec('packaged-heavy-oil-residue', 'Packaged Heavy Oil Residue', 6, 'packager', { 'heavy-oil-residue': 30, 'empty-canister': 30 }, 30);
rec('packaged-fuel', 'Packaged Fuel', 6, 'packager', { fuel: 40, 'empty-canister': 40 }, 40);
rec('packaged-turbofuel', 'Packaged Turbofuel', 6, 'packager', { turbofuel: 20, 'empty-canister': 20 }, 20);

// ---------- Tier 7 ----------
rec('sulfuric-acid', 'Sulfuric Acid', 7, 'refinery', { sulfur: 50, water: 50 }, 50);
rec('alumina-solution', 'Alumina Solution', 7, 'refinery', { bauxite: 120, water: 180 }, 120, { silica: 50 });
rec('aluminum-scrap', 'Aluminum Scrap', 7, 'refinery', { 'alumina-solution': 240, coal: 120 }, 360, { water: 120 });
rec('aluminum-ingot', 'Aluminum Ingot', 7, 'foundry', { 'aluminum-scrap': 90, silica: 75 }, 60);
rec('alclad-aluminum-sheet', 'Alclad Aluminum Sheet', 7, 'assembler', { 'aluminum-ingot': 30, 'copper-ingot': 10 }, 30);
rec('aluminum-casing', 'Aluminum Casing', 7, 'constr', { 'aluminum-ingot': 90 }, 60);
rec('empty-fluid-tank', 'Empty Fluid Tank', 7, 'constr', { 'aluminum-ingot': 60 }, 60);
rec('battery', 'Battery', 7, 'blender',
  { 'sulfuric-acid': 50, 'alumina-solution': 40, 'aluminum-casing': 20 }, 20, { water: 30 });
rec('heat-sink', 'Heat Sink', 7, 'assembler', { 'alclad-aluminum-sheet': 37.5, 'copper-sheet': 22.5 }, 7.5);
rec('cooling-system', 'Cooling System', 7, 'blender',
  { 'heat-sink': 12, rubber: 12, water: 30, 'nitrogen-gas': 150 }, 6);
rec('fused-modular-frame', 'Fused Modular Frame', 7, 'blender',
  { 'heavy-modular-frame': 1.5, 'aluminum-casing': 75, 'nitrogen-gas': 37.5 }, 1.5);
rec('radio-control-unit', 'Radio Control Unit', 7, 'manufacturer',
  { 'aluminum-casing': 40, 'crystal-oscillator': 1.25, computer: 2.5 }, 2.5);
rec('turbo-motor', 'Turbo Motor', 7, 'manufacturer',
  { 'cooling-system': 7.5, 'radio-control-unit': 3.75, motor: 7.5, rubber: 45 }, 1.875);
rec('supercomputer', 'Supercomputer', 7, 'manufacturer',
  { computer: 7.5, 'ai-limiter': 3.75, 'high-speed-connector': 5.625, plastic: 52.5 }, 1.875);
rec('assembly-director-system', 'Assembly Director System', 7, 'assembler',
  { 'adaptive-control-unit': 1.5, supercomputer: 0.75 }, 0.75);
rec('packaged-sulfuric-acid', 'Packaged Sulfuric Acid', 7, 'packager', { 'sulfuric-acid': 40, 'empty-canister': 40 }, 40);
rec('packaged-alumina-solution', 'Packaged Alumina Solution', 7, 'packager',
  { 'alumina-solution': 120, 'empty-canister': 120 }, 120);
rec('packaged-nitrogen-gas', 'Packaged Nitrogen Gas', 7, 'packager', { 'nitrogen-gas': 240, 'empty-fluid-tank': 60 }, 60);

// ---------- Tier 8 ----------
rec('nitric-acid', 'Nitric Acid', 8, 'blender', { 'nitrogen-gas': 120, water: 30, 'iron-plate': 10 }, 30);
rec('rocket-fuel', 'Rocket Fuel', 8, 'blender', { turbofuel: 60, 'nitric-acid': 10 }, 100, { 'compacted-coal': 10 });
rec('packaged-nitric-acid', 'Packaged Nitric Acid', 8, 'packager', { 'nitric-acid': 30, 'empty-fluid-tank': 30 }, 30);
rec('packaged-rocket-fuel', 'Packaged Rocket Fuel', 8, 'packager', { 'rocket-fuel': 120, 'empty-fluid-tank': 60 }, 60);
rec('encased-uranium-cell', 'Encased Uranium Cell', 8, 'blender',
  { uranium: 50, concrete: 15, 'sulfuric-acid': 40 }, 25, { 'sulfuric-acid': 10 });
rec('electromagnetic-control-rod', 'Electromagnetic Control Rod', 8, 'assembler', { stator: 6, 'ai-limiter': 4 }, 4);
rec('uranium-fuel-rod', 'Uranium Fuel Rod', 8, 'manufacturer',
  { 'encased-uranium-cell': 20, 'encased-industrial-beam': 1.2, 'electromagnetic-control-rod': 2 }, 0.4);
rec('non-fissile-uranium', 'Non-Fissile Uranium', 8, 'blender',
  { 'uranium-waste': 37.5, silica: 25, 'nitric-acid': 15, 'sulfuric-acid': 15 }, 50, { water: 15 });
rec('plutonium-pellet', 'Plutonium Pellet', 8, 'accel', { 'non-fissile-uranium': 100, 'uranium-waste': 25 }, 30, null, { mw: 500 });
rec('encased-plutonium-cell', 'Encased Plutonium Cell', 8, 'assembler', { 'plutonium-pellet': 10, concrete: 20 }, 5);
rec('plutonium-fuel-rod', 'Plutonium Fuel Rod', 8, 'manufacturer',
  { 'encased-plutonium-cell': 7.5, 'steel-beam': 4.5, 'electromagnetic-control-rod': 1.5, 'heat-sink': 2.5 }, 0.25);
rec('pressure-conversion-cube', 'Pressure Conversion Cube', 8, 'assembler',
  { 'fused-modular-frame': 1, 'radio-control-unit': 2 }, 1);
rec('copper-powder', 'Copper Powder', 8, 'constr', { 'copper-ingot': 300 }, 50);
rec('nuclear-pasta', 'Nuclear Pasta', 8, 'accel', { 'copper-powder': 100, 'pressure-conversion-cube': 0.5 }, 0.5, null, { mw: 1000 });
rec('magnetic-field-generator', 'Magnetic Field Generator', 8, 'assembler',
  { 'versatile-framework': 2.5, 'electromagnetic-control-rod': 1 }, 1);
rec('thermal-propulsion-rocket', 'Thermal Propulsion Rocket', 8, 'manufacturer',
  { 'modular-engine': 2.5, 'turbo-motor': 1, 'cooling-system': 3, 'fused-modular-frame': 1 }, 1);

// ---------- Tier 9 ----------
rec('reanimated-sam', 'Reanimated SAM', 9, 'constr', { sam: 120 }, 30);
rec('ficsite-ingot', 'Ficsite Ingot', 9, 'converter', { 'reanimated-sam': 60, 'aluminum-ingot': 120 }, 30, null,
  { name: 'Ficsite Ingot (Aluminum)' });
rec('ficsite-ingot', 'Ficsite Ingot', 9, 'converter', { 'reanimated-sam': 45, 'caterium-ingot': 60 }, 15, null,
  { name: 'Ficsite Ingot (Caterium)' });
rec('ficsite-ingot', 'Ficsite Ingot', 9, 'converter', { 'reanimated-sam': 40, 'iron-ingot': 240 }, 10, null,
  { name: 'Ficsite Ingot (Iron)' });
rec('ficsite-trigon', 'Ficsite Trigon', 9, 'constr', { 'ficsite-ingot': 10 }, 30);
rec('diamonds', 'Diamonds', 9, 'accel', { coal: 600 }, 30, null, { mw: 500 });
rec('time-crystal', 'Time Crystal', 9, 'converter', { diamonds: 12 }, 6);
rec('dark-matter-residue', 'Dark Matter Residue', 9, 'converter', { 'reanimated-sam': 50 }, 100);
rec('excited-photonic-matter', 'Excited Photonic Matter', 9, 'converter', {}, 200);
rec('dark-matter-crystal', 'Dark Matter Crystal', 9, 'accel', { diamonds: 30, 'dark-matter-residue': 150 }, 30, null, { mw: 1000 });
rec('superposition-oscillator', 'Superposition Oscillator', 9, 'encoder',
  { 'dark-matter-crystal': 30, 'crystal-oscillator': 5, 'alclad-aluminum-sheet': 45, 'excited-photonic-matter': 125 }, 5,
  { 'dark-matter-residue': 125 });
rec('neural-quantum-processor', 'Neural-Quantum Processor', 9, 'encoder',
  { 'time-crystal': 15, supercomputer: 3, 'ficsite-trigon': 45, 'excited-photonic-matter': 75 }, 3,
  { 'dark-matter-residue': 75 });
rec('ai-expansion-server', 'AI Expansion Server', 9, 'encoder',
  { 'magnetic-field-generator': 4, 'neural-quantum-processor': 4, 'superposition-oscillator': 4, 'excited-photonic-matter': 100 }, 4,
  { 'dark-matter-residue': 100 });
rec('singularity-cell', 'Singularity Cell', 9, 'manufacturer',
  { 'nuclear-pasta': 1, 'dark-matter-crystal': 20, 'iron-plate': 100, concrete: 200 }, 10);
rec('ballistic-warp-drive', 'Ballistic Warp Drive', 9, 'manufacturer',
  { 'thermal-propulsion-rocket': 1, 'singularity-cell': 5, 'superposition-oscillator': 2, 'dark-matter-crystal': 40 }, 1);
rec('biochemical-sculptor', 'Biochemical Sculptor', 9, 'blender',
  { 'assembly-director-system': 0.5, 'ficsite-trigon': 40, water: 10 }, 2);

// ---------- Alternate recipes ----------
A('iron-ingot', 'Basic Iron Ingot', 'foundry', { 'iron-ore': 25, limestone: 40 }, 50);
A('iron-ingot', 'Iron Alloy Ingot', 'foundry', { 'iron-ore': 40, 'copper-ore': 10 }, 75);
A('iron-ingot', 'Leached Iron Ingot', 'refinery', { 'iron-ore': 50, 'sulfuric-acid': 10 }, 100);
A('iron-ingot', 'Pure Iron Ingot', 'refinery', { 'iron-ore': 35, water: 20 }, 65);
A('copper-ingot', 'Copper Alloy Ingot', 'foundry', { 'copper-ore': 50, 'iron-ore': 50 }, 100);
A('copper-ingot', 'Leached Copper Ingot', 'refinery', { 'copper-ore': 45, 'sulfuric-acid': 25 }, 110);
A('copper-ingot', 'Pure Copper Ingot', 'refinery', { 'copper-ore': 15, water: 10 }, 37.5);
A('copper-ingot', 'Tempered Copper Ingot', 'foundry', { 'copper-ore': 25, 'petroleum-coke': 40 }, 60);
A('caterium-ingot', 'Leached Caterium Ingot', 'refinery', { 'caterium-ore': 54, 'sulfuric-acid': 30 }, 36);
A('caterium-ingot', 'Pure Caterium Ingot', 'refinery', { 'caterium-ore': 24, water: 24 }, 12);
A('caterium-ingot', 'Tempered Caterium Ingot', 'foundry', { 'caterium-ore': 45, 'petroleum-coke': 15 }, 22.5);
A('steel-ingot', 'Coke Steel Ingot', 'foundry', { 'iron-ore': 75, 'petroleum-coke': 75 }, 100);
A('steel-ingot', 'Compacted Steel Ingot', 'foundry', { 'iron-ore': 5, 'compacted-coal': 2.5 }, 10);
A('steel-ingot', 'Solid Steel Ingot', 'foundry', { 'iron-ingot': 40, coal: 40 }, 60);
A('aluminum-ingot', 'Pure Aluminum Ingot', 'smelter', { 'aluminum-scrap': 60 }, 30);
A('compacted-coal', 'Compacted Coal', 'assembler', { coal: 25, sulfur: 25 }, 25);
A('concrete', 'Fine Concrete', 'assembler', { silica: 15, limestone: 60 }, 50);
A('concrete', 'Rubber Concrete', 'assembler', { limestone: 100, rubber: 20 }, 90);
A('concrete', 'Wet Concrete', 'refinery', { limestone: 120, water: 100 }, 80);
A('iron-plate', 'Coated Iron Plate', 'assembler', { 'iron-ingot': 37.5, plastic: 7.5 }, 75);
A('iron-plate', 'Steel Cast Plate', 'foundry', { 'iron-ingot': 15, 'steel-ingot': 15 }, 45);
A('iron-rod', 'Aluminum Rod', 'constr', { 'aluminum-ingot': 7.5 }, 52.5);
A('iron-rod', 'Steel Rod', 'constr', { 'steel-ingot': 12 }, 48);
A('screw', 'Cast Screws', 'constr', { 'iron-ingot': 12.5 }, 50);
A('screw', 'Steel Screws', 'constr', { 'steel-beam': 5 }, 260);
A('wire', 'Caterium Wire', 'constr', { 'caterium-ingot': 15 }, 120);
A('wire', 'Fused Wire', 'assembler', { 'copper-ingot': 12, 'caterium-ingot': 3 }, 90);
A('wire', 'Iron Wire', 'constr', { 'iron-ingot': 12.5 }, 22.5);
A('cable', 'Coated Cable', 'refinery', { wire: 37.5, 'heavy-oil-residue': 15 }, 67.5);
A('cable', 'Insulated Cable', 'assembler', { wire: 45, rubber: 30 }, 100);
A('cable', 'Quickwire Cable', 'assembler', { quickwire: 7.5, rubber: 5 }, 27.5);
A('copper-sheet', 'Steamed Copper Sheet', 'refinery', { 'copper-ingot': 22.5, water: 22.5 }, 22.5);
A('steel-beam', 'Aluminum Beam', 'constr', { 'aluminum-ingot': 22.5 }, 22.5);
A('steel-beam', 'Molded Beam', 'foundry', { 'steel-ingot': 120, concrete: 80 }, 45);
A('steel-pipe', 'Iron Pipe', 'constr', { 'iron-ingot': 100 }, 25);
A('steel-pipe', 'Molded Steel Pipe', 'foundry', { 'steel-ingot': 50, concrete: 30 }, 50);
A('quickwire', 'Fused Quickwire', 'assembler', { 'caterium-ingot': 7.5, 'copper-ingot': 37.5 }, 90);
A('silica', 'Cheap Silica', 'assembler', { 'raw-quartz': 22.5, limestone: 37.5 }, 52.5);
A('silica', 'Distilled Silica', 'blender', { 'dissolved-silica': 120, limestone: 50, water: 100 }, 270, { water: 80 });
A('quartz-crystal', 'Fused Quartz Crystal', 'foundry', { 'raw-quartz': 75, coal: 36 }, 54);
A('quartz-crystal', 'Pure Quartz Crystal', 'refinery', { 'raw-quartz': 67.5, water: 37.5 }, 52.5);
A('quartz-crystal', 'Quartz Purification', 'refinery', { 'raw-quartz': 120, 'nitric-acid': 10 }, 75, { 'dissolved-silica': 60 });
A('plastic', 'Recycled Plastic', 'refinery', { rubber: 30, fuel: 30 }, 60);
A('rubber', 'Recycled Rubber', 'refinery', { plastic: 30, fuel: 30 }, 60);
A('fuel', 'Diluted Fuel', 'blender', { 'heavy-oil-residue': 50, water: 100 }, 100);
A('polymer-resin', 'Polymer Resin', 'refinery', { 'crude-oil': 60 }, 130, { 'heavy-oil-residue': 20 });
A('turbofuel', 'Turbofuel', 'refinery', { fuel: 22.5, 'compacted-coal': 15 }, 18.75);
A('turbofuel', 'Turbo Heavy Fuel', 'refinery', { 'heavy-oil-residue': 37.5, 'compacted-coal': 30 }, 30);
A('turbofuel', 'Turbo Blend Fuel', 'blender',
  { fuel: 15, 'heavy-oil-residue': 30, sulfur: 22.5, 'petroleum-coke': 22.5 }, 45);
A('rocket-fuel', 'Nitro Rocket Fuel', 'blender', { fuel: 100, 'nitrogen-gas': 75, sulfur: 100, coal: 50 }, 150,
  { 'compacted-coal': 25 });
A('empty-canister', 'Coated Iron Canister', 'assembler', { 'iron-plate': 30, 'copper-sheet': 15 }, 60);
A('empty-canister', 'Steel Canister', 'constr', { 'steel-ingot': 40 }, 40);
A('reinforced-iron-plate', 'Adhered Iron Plate', 'assembler', { 'iron-plate': 11.25, rubber: 3.75 }, 3.75);
A('reinforced-iron-plate', 'Bolted Iron Plate', 'assembler', { 'iron-plate': 90, screw: 250 }, 15);
A('reinforced-iron-plate', 'Stitched Iron Plate', 'assembler', { 'iron-plate': 18.75, wire: 37.5 }, 5.625);
A('rotor', 'Copper Rotor', 'assembler', { 'copper-sheet': 22.5, screw: 195 }, 11.25);
A('rotor', 'Steel Rotor', 'assembler', { 'steel-pipe': 10, wire: 30 }, 5);
A('modular-frame', 'Bolted Frame', 'assembler', { 'reinforced-iron-plate': 7.5, screw: 140 }, 5);
A('modular-frame', 'Steeled Frame', 'assembler', { 'reinforced-iron-plate': 2, 'steel-pipe': 10 }, 3);
A('smart-plating', 'Plastic Smart Plating', 'manufacturer', { 'reinforced-iron-plate': 2.5, rotor: 2.5, plastic: 7.5 }, 5);
A('encased-industrial-beam', 'Encased Industrial Pipe', 'assembler', { 'steel-pipe': 24, concrete: 20 }, 4);
A('stator', 'Quickwire Stator', 'assembler', { 'steel-pipe': 16, quickwire: 60 }, 8);
A('motor', 'Electric Motor', 'assembler', { 'electromagnetic-control-rod': 3.75, rotor: 7.5 }, 7.5);
A('motor', 'Rigor Motor', 'manufacturer', { rotor: 3.75, stator: 3.75, 'crystal-oscillator': 1.25 }, 7.5);
A('versatile-framework', 'Flexible Framework', 'manufacturer', { 'modular-frame': 3.75, 'steel-beam': 22.5, rubber: 30 }, 7.5);
A('automated-wiring', 'Automated Speed Wiring', 'manufacturer', { stator: 3.75, wire: 75, 'high-speed-connector': 1.875 }, 7.5);
A('circuit-board', 'Caterium Circuit Board', 'assembler', { plastic: 12.5, quickwire: 37.5 }, 8.75);
A('circuit-board', 'Electrode Circuit Board', 'assembler', { rubber: 20, 'petroleum-coke': 40 }, 5);
A('circuit-board', 'Silicon Circuit Board', 'assembler', { 'copper-sheet': 27.5, silica: 27.5 }, 12.5);
A('ai-limiter', 'Plastic AI Limiter', 'assembler', { quickwire: 120, plastic: 28 }, 8);
A('computer', 'Caterium Computer', 'manufacturer', { 'circuit-board': 15, quickwire: 52.5, rubber: 22.5 }, 3.75);
A('computer', 'Crystal Computer', 'assembler', { 'circuit-board': 5, 'crystal-oscillator': 5 / 3 }, 10 / 3);
A('heavy-modular-frame', 'Heavy Encased Frame', 'manufacturer',
  { 'modular-frame': 7.5, 'encased-industrial-beam': 9.375, 'steel-pipe': 33.75, concrete: 20.625 }, 2.8125);
A('heavy-modular-frame', 'Heavy Flexible Frame', 'manufacturer',
  { 'modular-frame': 18.75, 'encased-industrial-beam': 11.25, rubber: 75, screw: 390 }, 3.75);
A('crystal-oscillator', 'Insulated Crystal Oscillator', 'manufacturer',
  { 'quartz-crystal': 18.75, rubber: 13.125, 'ai-limiter': 1.875 }, 1.875);
A('high-speed-connector', 'Silicon High-Speed Connector', 'manufacturer', { quickwire: 90, silica: 37.5, 'circuit-board': 3 }, 3);
A('alumina-solution', 'Sloppy Alumina', 'refinery', { bauxite: 200, water: 200 }, 240);
A('aluminum-scrap', 'Electrode Aluminum Scrap', 'refinery', { 'alumina-solution': 180, 'petroleum-coke': 60 }, 300, { water: 105 });
A('aluminum-scrap', 'Instant Scrap', 'blender', { bauxite: 150, coal: 100, 'sulfuric-acid': 50, water: 60 }, 300, { water: 50 });
A('aluminum-casing', 'Alclad Casing', 'assembler', { 'aluminum-ingot': 150, 'copper-ingot': 75 }, 112.5);
A('battery', 'Classic Battery', 'manufacturer', { sulfur: 45, 'alclad-aluminum-sheet': 52.5, plastic: 60, wire: 90 }, 30);
A('heat-sink', 'Heat Exchanger', 'assembler', { 'aluminum-casing': 30, rubber: 30 }, 10);
A('cooling-system', 'Cooling Device', 'blender', { 'heat-sink': 10, motor: 2.5, 'nitrogen-gas': 60 }, 5);
A('fused-modular-frame', 'Heat-Fused Frame', 'blender',
  { 'heavy-modular-frame': 3, 'aluminum-ingot': 150, 'nitric-acid': 24, fuel: 30 }, 3);
A('radio-control-unit', 'Radio Connection Unit', 'manufacturer',
  { 'heat-sink': 15, 'high-speed-connector': 7.5, 'quartz-crystal': 45 }, 3.75);
A('radio-control-unit', 'Radio Control System', 'manufacturer',
  { 'crystal-oscillator': 1.5, 'circuit-board': 15, 'aluminum-casing': 90, rubber: 45 }, 4.5);
A('turbo-motor', 'Turbo Electric Motor', 'manufacturer',
  { motor: 6.5625, 'radio-control-unit': 8.4375, 'electromagnetic-control-rod': 4.6875, rotor: 6.5625 }, 2.8125);
A('supercomputer', 'OC Supercomputer', 'assembler', { 'radio-control-unit': 6, 'cooling-system': 6 }, 3);
A('supercomputer', 'Super-State Computer', 'manufacturer',
  { computer: 7.2, 'electromagnetic-control-rod': 2.4, battery: 24, wire: 60 }, 2.4);
A('electromagnetic-control-rod', 'Electromagnetic Connection Rod', 'assembler', { stator: 8, 'high-speed-connector': 4 }, 8);
A('encased-uranium-cell', 'Infused Uranium Cell', 'manufacturer', { uranium: 25, silica: 15, sulfur: 25, quickwire: 75 }, 20);
A('uranium-fuel-rod', 'Uranium Fuel Unit', 'manufacturer',
  { 'encased-uranium-cell': 20, 'electromagnetic-control-rod': 2, 'crystal-oscillator': 0.6, rotor: 2 }, 0.6);
A('non-fissile-uranium', 'Fertile Uranium', 'blender',
  { uranium: 25, 'uranium-waste': 25, 'nitric-acid': 15, 'sulfuric-acid': 25 }, 100, { water: 40 });
A('encased-plutonium-cell', 'Instant Plutonium Cell', 'accel', { 'non-fissile-uranium': 75, 'aluminum-casing': 10 }, 10, null, 500);
A('plutonium-fuel-rod', 'Plutonium Fuel Unit', 'assembler', { 'encased-plutonium-cell': 10, 'pressure-conversion-cube': 0.5 }, 0.5);
A('diamonds', 'Cloudy Diamonds', 'accel', { coal: 240, limestone: 480 }, 20, null, 500);
A('diamonds', 'Oil-Based Diamonds', 'accel', { 'crude-oil': 200 }, 40, null, 500);
A('diamonds', 'Petroleum Diamonds', 'accel', { 'petroleum-coke': 720 }, 30, null, 500);
A('diamonds', 'Pink Diamonds', 'converter', { coal: 120, 'quartz-crystal': 45 }, 15);
A('dark-matter-crystal', 'Dark Matter Crystallization', 'accel', { 'dark-matter-residue': 200 }, 20, null, 1000);
A('dark-matter-crystal', 'Dark Matter Trap', 'accel', { 'time-crystal': 30, 'dark-matter-residue': 150 }, 60, null, 1000);

for (const id in ITEMS) if (FLUIDS.has(id)) ITEMS[id].fluid = true;

/** Craftable items, sorted by name. */
export function craftableItems(): ItemId[] {
  return Object.keys(RECIPES).sort((a, b) => ITEMS[a].n.localeCompare(ITEMS[b].n));
}
