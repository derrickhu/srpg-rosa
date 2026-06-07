import type { AssetBundleDef } from './AssetManager';

/**
 * Asset bundle definitions.
 * Paths are relative to the mini-game root (same folder as game.js).
 * Files must be placed there manually or via the generation pipeline
 * described in doc/GENERATE_ASSET_SPEC.md.
 */

export const TERRAIN_BUNDLE: AssetBundleDef = {
  name: 'terrain',
  assets: {
    plain: 'images/terrain/plain.png',
    high: 'images/terrain/high.png',
    forest: 'images/terrain/forest.png',
    river: 'images/terrain/river.png',
    swamp: 'images/terrain/swamp.png',
    wall: 'images/terrain/wall.png',
    abyss: 'images/terrain/abyss.png',
  },
};

export const UNIT_BUNDLE: AssetBundleDef = {
  name: 'unit',
  assets: {
    sword: 'images/units/sword.png',
    bow: 'images/units/bow.png',
    cavalry: 'images/units/cavalry.png',
    shield: 'images/units/shield.png',
  },
};

export const UI_BUNDLE: AssetBundleDef = {
  name: 'ui',
  assets: {
    btn_primary: 'images/ui/btn_primary.png',
    btn_secondary: 'images/ui/btn_secondary.png',
    panel_bg: 'images/ui/panel_bg.png',
    icon_gold: 'images/ui/icon_gold.png',
    icon_hp: 'images/ui/icon_hp.png',
    icon_deploy: 'images/ui/icon_deploy.png',
    icon_terrain: 'images/ui/icon_terrain.png',
    icon_potion: 'images/ui/icon_potion.png',
    icon_essence: 'images/ui/icon_essence.png',
    logo_emblem: 'images/ui/logo_emblem.png',
    btn_start: 'images/ui/btn_start.png',
  },
};

export const FX_BUNDLE: AssetBundleDef = {
  name: 'fx',
  assets: {
    slash: 'images/fx/slash.png',
    arrow: 'images/fx/arrow.png',
    shield_bash: 'images/fx/shield_bash.png',
    whirlwind: 'images/fx/whirlwind.png',
  },
};

export const BG_BUNDLE: AssetBundleDef = {
  name: 'bg',
  assets: {
    battle_bg: 'images/bg/battle_bg.png',
  },
};

export const ALL_BUNDLES: AssetBundleDef[] = [
  TERRAIN_BUNDLE,
  UNIT_BUNDLE,
  UI_BUNDLE,
  FX_BUNDLE,
  BG_BUNDLE,
];
