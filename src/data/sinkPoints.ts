import type { ItemId } from './types';

/**
 * AWESOME Sink points per item (satisfactory.wiki.gg/wiki/AWESOME_Sink).
 * Items missing here cannot be sunk (fluids, radioactive waste, Plutonium Pellet, …).
 */
export const SINK_POINTS: Record<ItemId, number> = {
  'iron-ore': 1, 'iron-ingot': 2, limestone: 2, screw: 2, coal: 3, 'copper-ore': 3, 'iron-rod': 4,
  'copper-ingot': 6, 'iron-plate': 6, wire: 6, 'caterium-ore': 7, bauxite: 8, 'steel-ingot': 8,
  sulfur: 11, concrete: 12, 'polymer-resin': 12, 'black-powder': 14, 'raw-quartz': 15, quickwire: 17,
  'petroleum-coke': 20, sam: 20, silica: 20, cable: 24, 'copper-sheet': 24, 'steel-pipe': 24,
  'aluminum-scrap': 27, 'compacted-coal': 28, uranium: 35, 'caterium-ingot': 42, 'quartz-crystal': 50,
  'smokeless-powder': 58, 'empty-canister': 60, rubber: 60, 'steel-beam': 64, 'copper-powder': 72,
  plastic: 75, 'reinforced-iron-plate': 120, 'packaged-water': 130, 'aluminum-ingot': 131, rotor: 140,
  'encased-uranium-cell': 147, 'packaged-sulfuric-acid': 152, 'packaged-alumina-solution': 160,
  'reanimated-sam': 160, 'empty-fluid-tank': 170, 'packaged-heavy-oil-residue': 180, 'packaged-oil': 180,
  diamonds: 240, stator: 240, 'alclad-aluminum-sheet': 266, 'packaged-fuel': 270,
  'packaged-nitrogen-gas': 312, 'aluminum-casing': 393, 'modular-frame': 408, 'packaged-nitric-acid': 412,
  battery: 465, 'smart-plating': 520, 'encased-industrial-beam': 528, 'packaged-turbofuel': 570,
  'circuit-board': 696, 'ai-limiter': 920, 'time-crystal': 960, 'packaged-rocket-fuel': 1028,
  'versatile-framework': 1176, 'ficsite-trigon': 1291, 'automated-wiring': 1440, motor: 1520,
  'dark-matter-crystal': 1780, 'ficsite-ingot': 1936, 'electromagnetic-control-rod': 2560,
  'heat-sink': 2804, 'crystal-oscillator': 3072, 'high-speed-connector': 3776, computer: 8352,
  'modular-engine': 9960, 'heavy-modular-frame': 10800, 'magnetic-field-generator': 11000,
  'cooling-system': 12006, 'radio-control-unit': 32352, 'superposition-oscillator': 37292,
  'uranium-fuel-rod': 43468, 'fused-modular-frame': 62840, 'adaptive-control-unit': 76368,
  supercomputer: 97352, 'singularity-cell': 114675, 'plutonium-fuel-rod': 153184, 'turbo-motor': 240496,
  'neural-quantum-processor': 248034, 'pressure-conversion-cube': 255088, 'biochemical-sculptor': 301778,
  'assembly-director-system': 500176, 'nuclear-pasta': 538976, 'ai-expansion-server': 597652,
  'thermal-propulsion-rocket': 728508, 'ballistic-warp-drive': 2895334,
};

export const canSink = (id: ItemId): boolean => SINK_POINTS[id] != null;
