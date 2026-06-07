import * as PIXI from 'pixi.js';
import type { TerrainId, UnitKind } from '@/battle/types';
import { AssetManager } from '@/core/AssetManager';
import { terrainColor } from '@/data/terrainSpec';
import { C } from './mvpTheme';

/**
 * Create a display object for one terrain cell.
 * Plain cells show only the grass-colored background (provided by groundLayer).
 * Other terrain types overlay a transparent-background sprite on top.
 */
export function createTerrainCell(
  terrainId: TerrainId,
  cellSize: number,
): PIXI.Container {
  const c = new PIXI.Container();

  if (terrainId !== 'plain') {
    const tex = AssetManager.isBundleLoaded('terrain')
      ? AssetManager.texture('terrain', terrainId)
      : null;

    if (tex && tex !== PIXI.Texture.WHITE) {
      const sprite = new PIXI.Sprite(tex);
      const aspect = tex.width / tex.height;
      const maxDim = cellSize;
      if (aspect >= 1) {
        sprite.width = maxDim;
        sprite.height = maxDim / aspect;
      } else {
        sprite.height = maxDim;
        sprite.width = maxDim * aspect;
      }
      sprite.x = (cellSize - sprite.width) / 2;
      sprite.y = (cellSize - sprite.height) / 2;
      c.addChild(sprite);
    } else {
      const bg = new PIXI.Graphics();
      bg.beginFill(terrainColor(terrainId), 1);
      bg.drawRect(0, 0, cellSize, cellSize);
      bg.endFill();
      c.addChild(bg);
    }
  }

  return c;
}

/**
 * Create a unit token display object.
 * Sprite fills the cell and is anchored at center.
 * Uses texture if available, otherwise draws a colored circle.
 */
export function createUnitToken(
  defId: UnitKind,
  faction: 'player' | 'enemy',
  cellSize: number,
): PIXI.Container {
  const c = new PIXI.Container();
  const maxSize = Math.max(24, cellSize - 4);

  const tex = AssetManager.isBundleLoaded('unit')
    ? AssetManager.texture('unit', defId)
    : null;

  if (tex && tex !== PIXI.Texture.WHITE) {
    const sprite = new PIXI.Sprite(tex);
    sprite.anchor.set(0.5);
    const aspect = tex.width / tex.height;
    if (aspect >= 1) {
      sprite.width = maxSize;
      sprite.height = maxSize / aspect;
    } else {
      sprite.height = maxSize;
      sprite.width = maxSize * aspect;
    }
    if (faction === 'enemy') sprite.tint = 0xffaaaa;
    c.addChild(sprite);
  } else {
    const r = Math.max(10, cellSize * 0.32);
    const body = new PIXI.Graphics();
    const col = faction === 'player' ? C.playerTint : C.enemyTint;
    body.beginFill(col, 0.95);
    body.drawCircle(0, 0, r);
    body.endFill();
    c.addChild(body);
  }
  return c;
}

/**
 * Create a full-screen background.
 * Uses the battle_bg texture (top-down forest clearing) if available,
 * otherwise draws a green gradient fallback.
 */
export function createBackground(
  screenW: number,
  screenH: number,
  bundleKey = 'battle_bg',
): PIXI.Container {
  const c = new PIXI.Container();
  const tex = AssetManager.isBundleLoaded('bg')
    ? AssetManager.texture('bg', bundleKey)
    : null;

  if (tex && tex !== PIXI.Texture.WHITE) {
    const sprite = new PIXI.Sprite(tex);
    sprite.width = screenW;
    sprite.height = screenH;
    c.addChild(sprite);
  } else {
    const g = new PIXI.Graphics();
    g.beginFill(C.bg, 1);
    g.drawRect(0, 0, screenW, screenH);
    g.endFill();
    c.addChild(g);
  }
  return c;
}
