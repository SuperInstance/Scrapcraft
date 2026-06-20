// Block type IDs
export const B = {
  AIR: 0,
  DIRT: 1,
  GRAVEL: 2,
  CONCRETE: 3,
  RUST_METAL: 4,
  CLEAN_METAL: 5,
  WOOD_PLANK: 6,
  SCRAP_PILE: 7,
  WORKBENCH: 8,
  FORGE: 9,
  SMELTER: 10,
  OIL_DRUM: 11,
  CRATE: 12,
  WALL_METAL: 13,
  ROOF_METAL: 14,
  JUNK_CAR: 15,
  POWER_BOX: 16,
};

// hex color, emissive tint, roughness, whether it's solid/interactive/drops loot
// hardness = seconds to mine when holding left click
export const BLOCK_DEF = {
  [B.DIRT]:       { name: 'Compacted Dirt',   color: 0x7a5c3a, rough: 0.95, solid: true, hardness: 0.3 },
  [B.GRAVEL]:     { name: 'Gravel',            color: 0x6e6e6e, rough: 0.9,  solid: true, hardness: 0.3 },
  [B.CONCRETE]:   { name: 'Cracked Concrete',  color: 0x888880, rough: 0.85, solid: true, hardness: 0.7 },
  [B.RUST_METAL]: { name: 'Rusted Metal',      color: 0x8B3A00, rough: 0.8,  solid: true, hardness: 0.45,
                    drop: 'iron_scrap', dropChance: 1.0 },
  [B.CLEAN_METAL]:{ name: 'Steel Panel',       color: 0x9fb5c0, rough: 0.4,  solid: true, hardness: 0.85,
                    drop: 'iron_scrap', dropChance: 0.7 },
  [B.WOOD_PLANK]: { name: 'Rotted Wood',       color: 0x6b4c27, rough: 0.9,  solid: true, hardness: 0.35,
                    drop: 'wood_plank', dropChance: 1.0 },
  [B.SCRAP_PILE]: { name: 'Scrap Pile',        color: 0x5a5a4a, rough: 0.95, solid: true, hardness: 0.4,
                    drop: 'iron_scrap', dropChance: 0.8,
                    altDrop: 'gear_small', altDropChance: 0.35 },
  [B.WORKBENCH]:  { name: 'Workbench',         color: 0xb5832a, rough: 0.7,  solid: true,
                    interactive: true, station: 'workbench',
                    emissive: 0x261a00, emissiveIntensity: 0.3 },
  [B.FORGE]:      { name: 'Forge',             color: 0x444444, rough: 0.6,  solid: true,
                    interactive: true, station: 'forge',
                    emissive: 0xff4400, emissiveIntensity: 0.6 },
  [B.SMELTER]:    { name: 'Smelter',           color: 0x555533, rough: 0.6,  solid: true,
                    interactive: true, station: 'smelter',
                    emissive: 0xff8800, emissiveIntensity: 0.5 },
  [B.OIL_DRUM]:   { name: 'Oil Drum',          color: 0x1a1a8a, rough: 0.5,  solid: true, hardness: 0.55,
                    drop: 'fuel_can', dropChance: 0.9 },
  [B.CRATE]:      { name: 'Mystery Crate',     color: 0x8b6020, rough: 0.85, solid: true, hardness: 0.38,
                    drop: 'circuit_board', dropChance: 0.5,
                    altDrop: 'copper_wire', altDropChance: 0.8 },
  [B.WALL_METAL]: { name: 'Metal Wall',        color: 0x707070, rough: 0.5,  solid: true, hardness: 0.95 },
  [B.ROOF_METAL]: { name: 'Corrugated Roof',   color: 0x607060, rough: 0.55, solid: true, hardness: 0.95 },
  [B.JUNK_CAR]:   { name: 'Junk Car',          color: 0x3a3a2a, rough: 0.95, solid: true, hardness: 1.1,
                    drop: 'rubber_chunk', dropChance: 1.0,
                    altDrop: 'gear_small', altDropChance: 0.6 },
  [B.POWER_BOX]:  { name: 'Power Box',         color: 0xddcc00, rough: 0.4,  solid: true, hardness: 0.6,
                    drop: 'copper_wire', dropChance: 1.0,
                    altDrop: 'circuit_board', altDropChance: 0.4 },
};

// Items the player can place as blocks (item ID → block ID)
export const ITEM_TO_BLOCK = {
  wood_plank: B.WOOD_PLANK,
  iron_scrap: B.RUST_METAL,
};

export function isInteractive(id) {
  return !!BLOCK_DEF[id]?.interactive;
}
export function isSolid(id) {
  if (id === B.AIR) return false;
  return BLOCK_DEF[id]?.solid ?? false;
}
