import type { UnitKind } from '@/battle/types';
import { defaultSkillId } from '@/data/skillCatalog';

/**
 * 战斗特效登记表：一个技能 = 一份「配方」，由施放 / 飞行 / 命中三段组合而成。
 *
 * 之前的模型是「一技能一发光图」。远程射箭也只在目标身上闪一下，读起来是
 * 「敌人自己爆了」，而不是「我射中了他」。打击感来自时间线：出手 → 飞行的期待 →
 * 命中的反馈，不是换一张不一样的光效贴纸。
 *
 * 素材怎么产、哪段该交给生图 / 哪段该交给代码，见 docs/特效圣经.md。
 */

/** 播放锚点。以自身为中心的 AoE 锚自己，命中类锚目标 */
export type VfxAnchor = 'caster' | 'target';

/**
 * - `burst` 居中播放不旋转。环形、星形本身没有方向，转了也看不出来。
 * - `aimed` 朝目标旋转。楔形、贯穿星有明确朝向，不转就会出现「矛横着扎人」。
 * - `beam`  朝目标旋转并沿方向拉长到实际射程。只用于「瞬间铺满整条线」的光带；
 *           有飞行弹体时，拉长光带改挂在 `TravelDef.beamSet` 上跟着飞。
 */
export type VfxMode = 'burst' | 'aimed' | 'beam';

/**
 * 火花参数。**由代码画，不进生图。**
 *
 * 序列帧只有 6–9 张，帧间的细碎粒子必然对不上位置，播起来是一片沸腾的噪点；
 * 而火花恰恰要靠连续轨迹才成立。所以分工是：大形状交给生图，火花交给代码。
 */
export interface SparkSpec {
  count: number;
  /** 随机取色，按「白热核心 → 主色 → 外沿深色」三档给 */
  colors: readonly number[];
  speedMin: number;
  speedMax: number;
  radiusMin: number;
  radiusMax: number;
  lifeMinMs: number;
  lifeMaxMs: number;
  /** 每秒向下的加速度，px/s²。0 = 纯放射，正值 = 有重量感 */
  gravity: number;
  /**
   * 喷射锥角（弧度）。留空 = 360° 放射。
   * `aimed`/`travel` 用窄锥朝目标方向喷，火花才像是被那一击打出去的。
   */
  coneRad?: number;
}

/**
 * 一段「闪光」：施放瞬间或命中瞬间的黑底 additive 序列帧。
 * 近战技能通常只有这一段；远程技能把它拆到 `cast` / `impact` 两端。
 */
export interface FlashDef {
  /** animSet id，即 images/anim/<id>.png + src/data/anim/<id>.json */
  set: string;
  anchor: VfxAnchor;
  /** 特效直径按几格算。AoE 必须盖住技能的实际作用范围，否则玩家会误判 */
  cells: number;
  mode: VfxMode;
  sparks?: SparkSpec;
  /**
   * 亮度闸门，缺省 1。生图的峰值亮度控不住时在这里收一档，
   * 避免把挨打的人整个糊白。
   */
  alpha?: number;
}

/**
 * 飞行段。远程技能的距离感和期待感全靠它。
 *
 * 弹体本身是**抠图素材 + 普通混合**（`sprite`），不是黑底发光图：箭、矛这类实体靠剪影读，
 * 做成一团光反而认不出是什么东西。发光的部分（拖尾火花、拖尾光束）由代码补在后面。
 * 魔法弹（火球）本身就是光，用 `glowSet` 走 additive 序列帧。
 */
export interface TravelDef {
  /** FX_BUNDLE 里的抠图弹体 key，如 `proj_arrow`。与 glowSet 二选一 */
  sprite?: string;
  /** additive 动画弹体（火球、光弹）。与 sprite 二选一 */
  glowSet?: string;
  /** 弹体长度按几格算 */
  cells: number;
  /** 飞行速度，px/s。3 格射程大约 180–220ms 落点，再慢就拖节奏 */
  speedPxPerSec: number;
  /** 飞行途中洒的拖尾火花（代码画） */
  trail?: SparkSpec;
  /**
   * 跟着弹体拉长的 additive 光束图集。穿透箭用它和普通箭区分开：
   * 普攻只有箭 + 火花，穿透多一条能量尾迹。
   */
  beamSet?: string;
}

/**
 * 一份特效配方。三段都是可选的，按技能形态拣：
 *
 * | 形态 | cast | travel | impact |
 * |---|---|---|---|
 * | 近战斩击 | — | — | 目标闪光 |
 * | 远程射击 | — | 飞箭 | 目标命中 |
 * | 穿透射线 | — | 飞箭+光束 | 沿途每个目标命中 |
 * | 自身 AoE | — | — | 自身闪光 |
 * | 法术弹道（未来） | 出手光 | 火球 | 爆炸 |
 * | 场地召唤（未来） | 出手光 | — | 目标格持续物 |
 */
export interface VfxRecipe {
  cast?: FlashDef;
  travel?: TravelDef;
  impact?: FlashDef;
  /**
   * 贯穿技能：飞行途经每个命中目标时都播一次 impact。
   * 默认只在终点播——普攻射一支箭只有一个落点。
   */
  impactPerHit?: boolean;
}

/** @deprecated 旧名，等于 FlashDef。保留给还没迁完的调用点 */
export type VfxDef = FlashDef;

// --- 四个色相家族 ---
//
// 一个职业一套色相，普攻和技能同族。这样「金橙闪了一下」不用读文字就知道是剑士在出手，
// 而四族之间的色相差都在 60° 以上，在亮绿色草地背景上各自都拎得出来。
const GOLD = [0xfff6d0, 0xffc94a, 0xff8a1f] as const;
const CYAN = [0xe4feff, 0x5fe6ff, 0x0f9fd0] as const;
const MAGENTA = [0xffe0f8, 0xff5ae0, 0xa32bd0] as const;
const SILVER = [0xffffff, 0xdfe9f5, 0x9fb2c8] as const;

/** 命中火花：量少、快、带一点重力，跟着伤害数字一起消失 */
export function hitSparks(colors: readonly number[], coneRad?: number): SparkSpec {
  return {
    count: 10,
    colors,
    speedMin: 90,
    speedMax: 210,
    radiusMin: 1.4,
    radiusMax: 3.0,
    lifeMinMs: 200,
    lifeMaxMs: 380,
    gravity: 320,
    coneRad,
  };
}

/** 技能火花：量大、扩得远、几乎不落，配合 450ms 的技能特效 */
export function skillSparks(colors: readonly number[], coneRad?: number): SparkSpec {
  return {
    count: 20,
    colors,
    speedMin: 120,
    speedMax: 300,
    radiusMin: 1.6,
    radiusMax: 3.6,
    lifeMinMs: 320,
    lifeMaxMs: 560,
    gravity: 90,
    coneRad,
  };
}

/** 拖尾火花：比命中火花更小更短，只是标出弹体走过的路线 */
export function trailSparks(colors: readonly number[]): SparkSpec {
  return {
    count: 3,
    colors,
    speedMin: 10,
    speedMax: 60,
    radiusMin: 0.9,
    radiusMax: 2.0,
    lifeMinMs: 120,
    lifeMaxMs: 240,
    gravity: 40,
    coneRad: 0.9,
  };
}

/**
 * 普攻特效，按**兵种原型**取。
 *
 * 敌人复用四原型（草原杂兵的 defId 仍是 sword/bow/...），所以魔物也吃这张表：
 * 黏泥怪拍一下同样是金橙。这是有意的——普攻特效讲的是「这一下是近战还是远程、
 * 是刺还是砸」，属于战斗语法，不是角色皮肤。
 */
export const ATTACK_VFX: Record<UnitKind, VfxRecipe> = {
  // 近战斩击：没有飞行段，命中即闪光。整套特效的风格锚点
  sword: {
    impact: {
      set: 'slash',
      anchor: 'target',
      cells: 1.5,
      mode: 'burst',
      sparks: hitSparks(GOLD),
    },
  },
  // 远程射击：箭飞过去 → 命中闪光。距离感全靠飞行段，没有它就只是「敌人身上闪一下」
  bow: {
    travel: {
      sprite: 'proj_arrow',
      cells: 1.1,
      speedPxPerSec: 720,
      trail: trailSparks(CYAN),
    },
    impact: {
      set: 'arrow_hit',
      anchor: 'target',
      cells: 1.6,
      mode: 'aimed',
      sparks: hitSparks(CYAN, 1.1),
    },
  },
  // 近战突刺：贴身，不飞。楔形朝目标
  cavalry: {
    impact: {
      set: 'thrust',
      anchor: 'target',
      cells: 1.8,
      mode: 'aimed',
      sparks: hitSparks(MAGENTA, 0.9),
    },
  },
  // 近战钝击：径向对称所以不转。整套里最亮的一个，尺寸和亮度都往回收了一档
  shield: {
    impact: {
      set: 'bash_hit',
      anchor: 'target',
      cells: 1.35,
      mode: 'burst',
      alpha: 0.85,
      sparks: hitSparks(SILVER),
    },
  },
};

/**
 * 技能特效，按 skillId 取。没登记的技能回退到 `skillFxKey` 的静态贴图。
 *
 * `cells` 要对齐技能的真实范围：`whirl` 是曼哈顿 1 环 = 3×3 格。特效比范围小会让玩家
 * 以为够不着，比范围大更糟——他会按特效的边界去站位然后发现打不到。
 */
export const SKILL_VFX: Record<string, VfxRecipe> = {
  // 剑士 · 旋风斩：绕自身一周的三片刃，自身 AoE，没有飞行段
  whirl: {
    impact: {
      set: 'whirl',
      anchor: 'caster',
      cells: 3,
      mode: 'burst',
      sparks: skillSparks(GOLD),
    },
  },
  // 弓手 · 穿透箭：飞箭 + 能量尾迹，沿途每个目标依次中招
  pierce: {
    travel: {
      sprite: 'proj_arrow',
      cells: 1.1,
      speedPxPerSec: 640,
      trail: trailSparks(CYAN),
      // 穿透和普攻的视觉差就在这条尾迹：普攻只有箭，穿透拖着一道光
      beamSet: 'pierce',
    },
    impact: {
      set: 'arrow_hit',
      anchor: 'target',
      cells: 1.4,
      mode: 'aimed',
      sparks: hitSparks(CYAN, 0.8),
    },
    impactPerHit: true,
  },
  // 盾卫 · 震击：脚下地面开裂。键是 **skillId**（bash），不是素材名（quake）
  bash: {
    impact: {
      set: 'quake',
      anchor: 'caster',
      cells: 3,
      mode: 'burst',
      sparks: skillSparks(SILVER),
    },
  },
  // Boss · 狂暴战吼
  savage_roar: {
    impact: {
      set: 'roar',
      anchor: 'caster',
      cells: 3,
      mode: 'burst',
      sparks: skillSparks([0xfff0d0, 0xff8a2a, 0xc21f1f]),
    },
  },
};

/**
 * 冲锋（骑兵被动）的特效。
 *
 * `charge` 是被动，永远不发 `skillCast`，所以它不能待在 `SKILL_VFX` 里等事件。
 * 它挂在「这一下普攻吃到了移动加成」上，由 `attack` 事件的 `charged` 标记触发。
 */
export const CHARGE_VFX: VfxRecipe = {
  cast: {
    set: 'charge_aura',
    anchor: 'caster',
    cells: 2.0,
    mode: 'burst',
    alpha: 0.9,
    sparks: hitSparks(MAGENTA),
  },
};

/** 收集一份配方用到的全部 animSet id（弹体抠图不在此列，走 FX_BUNDLE） */
export function recipeAnimSets(recipe: VfxRecipe): string[] {
  const ids: string[] = [];
  if (recipe.cast) ids.push(recipe.cast.set);
  if (recipe.impact) ids.push(recipe.impact.set);
  if (recipe.travel?.glowSet) ids.push(recipe.travel.glowSet);
  if (recipe.travel?.beamSet) ids.push(recipe.travel.beamSet);
  return ids;
}

/** 每场战斗都要预取的特效集合：四职业普攻 + 各自默认技能 */
export function vfxSetsForKinds(kinds: readonly UnitKind[]): string[] {
  const ids = new Set<string>();
  for (const k of kinds) {
    for (const id of recipeAnimSets(ATTACK_VFX[k])) ids.add(id);
    const sk = SKILL_VFX[defaultSkillId(k)];
    if (sk) for (const id of recipeAnimSets(sk)) ids.add(id);
    if (k === 'cavalry') for (const id of recipeAnimSets(CHARGE_VFX)) ids.add(id);
  }
  return [...ids];
}
