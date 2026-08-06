import * as PIXI from 'pixi.js';
import type { TerrainId } from '@/battle/types';
import { AssetManager } from '@/core/AssetManager';
import { getTerrainSpec, terrainColor } from '@/data/terrainSpec';
import { sharesPlayerArt } from '@/view/animSets';
import { C } from './mvpTheme';

/**
 * 每格贴图相对格子的放大系数。默认 1 = 正好塞进格子，四周留出草地。
 *
 * 水系例外：河流和沼泽的贴图是一块边缘不规则的水，按 1 摆进去，相邻两格之间会留出
 * 一道草缝，一条横贯棋盘的河会读成一串水坑（第 3 关"渡口之争"整条河都这样）。
 * 稍微溢出格子让相邻两块咬合，缝就没了。其余地形是各自独立的物体，不需要连。
 */
const TERRAIN_OVERSCALE: Partial<Record<TerrainId, number>> = {
  river: 1.16,
  swamp: 1.12,
};

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
      const maxDim = cellSize * (TERRAIN_OVERSCALE[terrainId] ?? 1);
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

/** 布阵格角标的一条内容：`text` 已含正负号，`color` 表明这是好事还是坏事 */
interface TerrainBadge {
  text: string;
  color: number;
}

/**
 * 这一格的地形对站上去的单位做了什么，压成一条 ≤5 字的角标；无影响返回 null。
 *
 * 全部从 `TerrainSpec` 现算：改了数值忘了改文案，玩家看到的角标和实际伤害就会对不上，
 * 这类不一致比没有角标更糟——它教玩家不要相信 UI。
 *
 * 只出**一条**。这是「一种地形只有一个动词」这条设计契约换来的直接好处
 * （见 `terrainSpec.ts` 顶部）：真要一格同时挂减伤和闪避，5 个字就写不完，
 * 角标只能退化成一个需要额外图例才能看懂的色块。
 *
 * 不可通行地形不出角标：城墙和深渊长得就走不过去，玩家不需要文字确认。
 */
export function terrainBadge(terrainId: TerrainId): TerrainBadge | null {
  const spec = getTerrainSpec(terrainId);
  if (spec.moveCost === Infinity) return null;
  if (spec.atkMul !== 1) {
    const pct = Math.round((spec.atkMul - 1) * 100);
    return { text: `攻${pct > 0 ? '+' : ''}${pct}%`, color: pct > 0 ? C.gold : C.warnText };
  }
  if (spec.defMul !== 1) {
    return { text: `承${Math.round((spec.defMul - 1) * 100)}%`, color: C.gold };
  }
  // 「血-5」而不是「每回合-5」：最小格 36px 放不下 5 个汉字宽的串，而且和上面两条
  // 「属性 + 增减量」的格式一致。持续性靠沼泽贴图本身的语境读，不靠字数解释。
  if (spec.dotPerRound > 0) return { text: `血-${spec.dotPerRound}`, color: C.warnText };
  return null;
}

/**
 * 把地形角标画进一个 `cellSize` 的格子（左上角）。格子太小就不画：
 * 挤成一团的 6px 字读不出来，反而盖住了地形贴图本身这个更强的识别信号。
 */
export function createTerrainBadge(terrainId: TerrainId, cellSize: number): PIXI.Container | null {
  const badge = terrainBadge(terrainId);
  if (!badge || cellSize < 36) return null;

  const c = new PIXI.Container();
  const tx = new PIXI.Text(badge.text, {
    fill: badge.color,
    fontSize: Math.max(8, Math.floor(cellSize * 0.19)),
    fontWeight: 'bold',
  });
  const padX = 3;
  const padY = 1;
  const bg = new PIXI.Graphics();
  bg.beginFill(C.ink, 0.72);
  bg.drawRoundedRect(0, 0, tx.width + padX * 2, tx.height + padY * 2, 3);
  bg.endFill();
  c.addChild(bg);
  tx.x = padX;
  tx.y = padY;
  c.addChild(tx);
  c.x = 2;
  c.y = 2;
  return c;
}

/**
 * 取一个 UI 图标，等比缩放后居中放进 `size × size` 的方框里。
 *
 * 图标不是正方形（精华 39x64、部署 59x64），直接给 sprite 赋 width = height = size
 * 会把它们横向拉宽近一倍。所有用图标的地方都走这里，别自己写缩放。
 *
 * 返回 Container 而不是 Sprite：调用方只关心「这一格 size×size 的位置」，
 * 图标在框里怎么居中是这里的事。资源没加载好时返回 null，调用方自行降级。
 */
export function createUiIcon(key: string, size: number): PIXI.Container | null {
  if (!AssetManager.isBundleLoaded('ui')) return null;
  const tex = AssetManager.texture('ui', key);
  if (!tex || tex === PIXI.Texture.WHITE) return null;

  const c = new PIXI.Container();
  const sprite = new PIXI.Sprite(tex);
  const s = size / Math.max(tex.width, tex.height);
  sprite.width = tex.width * s;
  sprite.height = tex.height * s;
  sprite.x = (size - sprite.width) / 2;
  sprite.y = (size - sprite.height) / 2;
  c.addChild(sprite);
  return c;
}

/**
 * 对勾。纯几何的记号不出贴图：折线在任何尺寸下都清爽，也不用担心某个字形
 * 在设备字体里缺失变成豆腐块——`✓`、`◀`、emoji 都有这个风险，游戏字体是裁过的子集。
 */
export function drawCheck(r: number, color = 0xffffff): PIXI.Graphics {
  const g = new PIXI.Graphics();
  const s = r * 0.62;
  g.lineStyle(Math.max(2, r * 0.22), color, 1, 0.5);
  g.moveTo(-s, 0);
  g.lineTo(-s * 0.25, s * 0.65);
  g.lineTo(s, -s * 0.6);
  return g;
}

/** 翻页尖角。`dir` 为 -1 指向左、1 指向右，原点在尖角的中心 */
export function drawChevron(dir: -1 | 1, r: number, color = 0xffffff): PIXI.Graphics {
  const g = new PIXI.Graphics();
  g.lineStyle(Math.max(3, r * 0.3), color, 1, 0.5);
  g.moveTo((-r * 0.45) * dir, -r * 0.7);
  g.lineTo((r * 0.45) * dir, 0);
  g.lineTo((-r * 0.45) * dir, r * 0.7);
  return g;
}

/**
 * 顶栏货币条：深色圆角底 + 图标 + 数值。冒险 / 局外商店 / 角色三个 Tab 页都要显示魂晶，
 * 之前是三份逐字相同的手写代码，图标就是在这种复制里漏掉的——统一走这里。
 *
 * 底色用半透明黑而不是 `C.panel`：这条压在战场背景（亮黄绿草地）上，
 * 半透明黑能跟着背景走，换背景不用回来改。
 */
export function createCurrencyPill(iconKey: string, text: string): PIXI.Container {
  const c = new PIXI.Container();
  const ICON = 20;
  const PAD = 8;

  const label = new PIXI.Text(text, { fill: 0xffffff, fontSize: 14, fontWeight: 'bold' });
  const icon = createUiIcon(iconKey, ICON);
  const iconW = icon ? ICON + 4 : 0;
  const w = PAD * 2 + iconW + label.width;
  const h = Math.max(ICON, label.height) + 10;

  const bg = new PIXI.Graphics();
  bg.beginFill(0x000000, 0.4);
  bg.drawRoundedRect(0, 0, w, h, 8);
  bg.endFill();
  c.addChild(bg);

  if (icon) {
    icon.x = PAD;
    icon.y = (h - ICON) / 2;
    c.addChild(icon);
  }
  label.x = PAD + iconW;
  label.y = (h - label.height) / 2;
  c.addChild(label);

  return c;
}

/**
 * 静态单位贴图（布阵格、队伍卡片、技能头像）。锚点在中心。
 *
 * @param key 动画集合 id：有专属外观的敌人传 spawn 的 animSet，其余传 defId。
 *            贴图由 scripts/anim2token.mjs 从动画图集派生，与战场上是同一套形象。
 */
export function createUnitToken(
  key: string,
  faction: 'player' | 'enemy',
  cellSize: number,
): PIXI.Container {
  const c = new PIXI.Container();
  const maxSize = Math.max(24, cellSize - 4);

  const tex = AssetManager.isBundleLoaded('unit')
    ? AssetManager.texture('unit', key)
    : null;

  if (tex && tex !== PIXI.Texture.WHITE) {
    const sprite = new PIXI.Sprite(tex);
    sprite.anchor.set(0.5);
    // 一律按高度撑满：所有 token 共用 anim2token 烤好的同一个裁剪框，身体高度已经归一化，
    // 按高度还原就保住了彼此的比例关系。不能改成按长边撑满——狼这种横向剪影会把长边变成宽，
    // 于是它自己缩小、连带所有人跟着缩（共用框一变，人人受累）。横向溢出格子是可以的，
    // 棋盘没有 mask 也没有 z 排序，和 AnimatedUnit 让长兵器探出格子是同一个取舍。
    // 杂兵在派生时已按 MOOK_HEIGHT_CELLS 烤矮，这里不用再缩。
    sprite.height = maxSize;
    sprite.width = maxSize * (tex.width / tex.height);
    if (faction === 'enemy' && sharesPlayerArt(key)) sprite.tint = 0xffaaaa;
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
    // cover：等比放大到盖满屏幕，多出来的方向裁掉。机型宽高比从 0.46 到 0.56 不等，
    // 原来是分别赋 width/height 的非等比拉伸，在长屏手机上会把树冠拉成椭圆。
    // 背景是「中央大片空草地 + 四周树冠镶边」的构图，裁掉的只会是镶边，构图不会垮。
    const sprite = new PIXI.Sprite(tex);
    const scale = Math.max(screenW / tex.width, screenH / tex.height);
    sprite.scale.set(scale);
    sprite.x = (screenW - tex.width * scale) / 2;
    sprite.y = (screenH - tex.height * scale) / 2;
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
