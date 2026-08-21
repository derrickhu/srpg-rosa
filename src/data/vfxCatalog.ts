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
 * 跟着弹体取样的淡出光带。路径长度是变量，不能靠序列帧。
 * 对标 Godot Line2D trail / Pixi 折线拖尾。
 */
export interface RibbonSpec {
  color: number;
  glowColor?: number;
  /** 弹头处的光带宽度（像素） */
  widthPx: number;
  /** 一个取样点从出现到消失 */
  tailMs: number;
  /** 弹体到达后再把整条光带留多久 */
  fadeMs: number;
}

/**
 * 施法者到落点的能量路径。平滑光带像剑气，折线像闪电。
 * 没弹体的技能（治疗、突刺）也能单独播这一段，避免「目标自己亮了」。
 */
export interface PathBeamSpec {
  style: 'smooth' | 'jagged';
  color: number;
  glowColor?: number;
  widthPx: number;
  persistMs: number;
  segments?: number;
  jagAmp?: number;
  /** 沿路径拉长的生图图集。有它时路径用这张图，折线只当没图时的兜底 */
  set?: string;
}

/**
 * 近战月牙扫斩。贴身技能如果只有目标身上一张闪光，读起来是盖章，不是挥出去。
 */
export interface SlashSweepSpec {
  color: number;
  glowColor?: number;
  radiusCells: number;
  /** 扫过的圆心角 */
  arcRad: number;
  durationMs: number;
  thicknessPx: number;
  /** 扫出去的生图（斩击弧 / 旋风刃）。残影用它的帧，不要只画一条几何弧 */
  set?: string;
}

/**
 * 命中星爆：白热核 + 放射线 + 扩散环。和序列帧叠播，专门讲「打中了」。
 */
export interface HitBurstSpec {
  color: number;
  glowColor?: number;
  rays: number;
  ring: boolean;
  sizeCells: number;
  durationMs: number;
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
  /** 序列帧播放倍率。1 = 原速，小于 1 更慢。闪光默认在回放层收一档 */
  playbackSpeed?: number;
  /** 叠在闪光上的代码打击爆裂 */
  hitBurst?: HitBurstSpec;
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
  /** 飞行速度，px/s。3 格射程大约 360–450ms 落点；再快会读成瞬移 */
  speedPxPerSec: number;
  /** 飞行途中洒的拖尾火花（代码画） */
  trail?: SparkSpec;
  /**
   * 跟着弹体拉长的 additive 光束图集。穿透箭用它和普通箭区分开：
   * 普攻只有箭 + 火花，穿透多一条能量尾迹。
   */
  beamSet?: string;
  /**
   * 不随飞行方向旋转。蜂群云团这类「团状」弹体转了反而读不出朝向；
   * 箭/矛必须转（尖端朝右画的）。
   */
  noRotate?: boolean;
  /**
   * 抵达目标后绕着飞几圈再淡出。邻格技能直线只有一格，蜂群不绕圈就看不清。
   */
  orbitLaps?: number;
  /** 弹体身后的淡出光带。远程技能应尽量带上，否则只看见一个小点子在飞 */
  ribbon?: RibbonSpec;
  /** 施法者到弹体的能量路径，跟着弹头拉长 */
  path?: PathBeamSpec;
  /**
   * 最短飞行时间。邻格射击按速度算只有几十毫秒，会被读成瞬移。
   * 缺省由回放层兜 240ms。
   */
  minMs?: number;
  /** 弹体到达后还留在落点多久再淡出 */
  lingerMs?: number;
}

/**
 * 实体道具施放：透明底抠图放大消失（号角、药草十字）。
 * 和黑底 additive 环光是两条路——道具靠剪影认物，环光靠发光认事件。
 */
export interface PropBurstDef {
  /** FX_BUNDLE 抠图 / 黑底光效 key */
  sprite: string;
  anchor: VfxAnchor;
  cells: number;
  scaleFrom: number;
  scaleTo: number;
  durationMs: number;
  sparks?: SparkSpec;
  /** 黑底发光用 add；药草十字这类认物剪影用 normal */
  blend?: 'add' | 'normal';
  /** 相对锚点向上为负，号角挂头顶 */
  yOffsetCells?: number;
}

/**
 * 一份特效配方。三段都是可选的，按技能形态拣：
 *
 * | 形态 | cast | travel | impact |
 * |---|---|---|---|
 * | 近战斩击 | 月牙扫斩 | — | 目标闪光 + 星爆 |
 * | 远程射击 | 原点放射 | 飞箭 + 光带 + 路径 | 目标命中 + 星爆 |
 * | 穿透射线 | 原点放射 | 飞箭+光束+光带 | 沿途每个目标命中 |
 * | 自身 AoE | 原点放射 / 绕身扫 | — | 自身闪光 + 大环 |
 * | 法术弹道 | 出手放射 | 火球 + 火轨 | 爆炸 + 星爆 |
 * | 场地召唤（未来） | 出手光 | — | 目标格持续物 |
 */
export interface VfxRecipe {
  cast?: FlashDef;
  travel?: TravelDef;
  impact?: FlashDef;
  /** 实体道具放大消失（号角 / 药草） */
  propBurst?: PropBurstDef;
  /**
   * 贯穿技能：飞行途经每个命中目标时都播一次 impact。
   * 默认只在终点播——普攻射一支箭只有一个落点。
   */
  impactPerHit?: boolean;
  /**
   * 对每个命中目标各飞一发弹体（蜂群）。
   * 与 `impactPerHit`（一发贯穿多目标）互斥语义：这边是「分头扑」，那边是「一条线穿」。
   */
  travelPerTarget?: boolean;
  /** 近战月牙扫斩，从施法者扫向目标 */
  slashSweep?: SlashSweepSpec;
  /** 没有弹体时的能量连线（治疗、突刺） */
  pathBeam?: PathBeamSpec;
  /** 施法原点放射。远程用来标「东西从这里出去」 */
  castBurst?: HitBurstSpec;
  /** 命中星爆。impact 上也能写；两边都写则各播一次 */
  hitBurst?: HitBurstSpec;
}

/** @deprecated 旧名，等于 FlashDef。保留给还没迁完的调用点 */
export type VfxDef = FlashDef;

// --- 六个色相家族 ---
//
// 一个职业一套色相，普攻和技能同族。这样「金橙闪了一下」不用读文字就知道是剑士在出手，
// 各族之间的色相差都要能在亮绿色草地背景上拎得出来。
const GOLD = [0xfff6d0, 0xffc94a, 0xff8a1f] as const;
const CYAN = [0xe4feff, 0x5fe6ff, 0x0f9fd0] as const;
const MAGENTA = [0xffe0f8, 0xff5ae0, 0xa32bd0] as const;
const SILVER = [0xffffff, 0xdfe9f5, 0x9fb2c8] as const;
/** 法师赤焰：比剑士金橙更红，形态是火球/火环而不是斩击 */
const FIRE = [0xfff4d0, 0xff4a12, 0xb01400] as const;
const MINT = [0xf0fff4, 0x6ee7b7, 0x0d9488] as const;

/** 命中火花：量少、快、带一点重力，跟着伤害数字一起消失 */
export function hitSparks(colors: readonly number[], coneRad?: number): SparkSpec {
  return {
    count: 16,
    colors,
    speedMin: 110,
    speedMax: 260,
    radiusMin: 1.6,
    radiusMax: 3.6,
    lifeMinMs: 260,
    lifeMaxMs: 460,
    gravity: 300,
    coneRad,
  };
}

/** 技能火花：量大、扩得远、几乎不落，配合 450ms 的技能特效 */
export function skillSparks(colors: readonly number[], coneRad?: number): SparkSpec {
  return {
    count: 28,
    colors,
    speedMin: 140,
    speedMax: 340,
    radiusMin: 1.8,
    radiusMax: 4.2,
    lifeMinMs: 380,
    lifeMaxMs: 640,
    gravity: 80,
    coneRad,
  };
}

/** 拖尾火花：比命中火花更小更短，只是标出弹体走过的路线 */
export function trailSparks(colors: readonly number[]): SparkSpec {
  return {
    count: 5,
    colors,
    speedMin: 16,
    speedMax: 70,
    radiusMin: 1.1,
    radiusMax: 2.4,
    lifeMinMs: 180,
    lifeMaxMs: 320,
    gravity: 36,
    coneRad: 0.9,
  };
}

export function ribbonGlow(colors: readonly number[], widthPx = 16): RibbonSpec {
  return {
    color: colors[1] ?? 0xffffff,
    glowColor: colors[0] ?? 0xffffff,
    widthPx,
    tailMs: 320,
    fadeMs: 360,
  };
}

export function pathGlow(
  colors: readonly number[],
  style: PathBeamSpec['style'] = 'smooth',
  widthPx = 11,
  set?: string,
): PathBeamSpec {
  return {
    style,
    color: colors[1] ?? 0xffffff,
    glowColor: colors[0] ?? 0xffffff,
    widthPx,
    persistMs: 280,
    segments: style === 'jagged' ? 8 : undefined,
    jagAmp: style === 'jagged' ? 12 : undefined,
    set,
  };
}

export function slashArc(
  colors: readonly number[],
  radiusCells = 1.85,
  arcRad = 2.45,
  set?: string,
): SlashSweepSpec {
  return {
    color: colors[1] ?? 0xffffff,
    glowColor: colors[0] ?? 0xffffff,
    radiusCells,
    arcRad,
    durationMs: 260,
    thicknessPx: 11,
    set,
  };
}

export function hitBurst(colors: readonly number[], sizeCells = 1.9): HitBurstSpec {
  return {
    color: colors[1] ?? 0xffffff,
    glowColor: colors[0] ?? 0xffffff,
    rays: 9,
    ring: true,
    sizeCells,
    durationMs: 340,
  };
}

export function castBurst(colors: readonly number[], sizeCells = 1.35): HitBurstSpec {
  return {
    color: colors[1] ?? 0xffffff,
    glowColor: colors[0] ?? 0xffffff,
    rays: 7,
    ring: false,
    sizeCells,
    durationMs: 260,
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
  // 近战斩击：生图斩击弧扫过去，落到目标再盖一记。几何弧只垫一层很淡的光
  sword: {
    slashSweep: slashArc(GOLD, 1.95, 2.5, 'slash'),
    impact: {
      set: 'slash',
      anchor: 'target',
      cells: 2.2,
      mode: 'burst',
      playbackSpeed: 0.72,
      sparks: hitSparks(GOLD),
    },
  },
  // 远程射击：箭的残影铺轨迹，命中播 arrow_hit 生图
  bow: {
    travel: {
      sprite: 'proj_arrow',
      cells: 1.4,
      speedPxPerSec: 400,
      minMs: 260,
      lingerMs: 80,
      trail: trailSparks(CYAN),
      ribbon: ribbonGlow(CYAN, 7),
    },
    impact: {
      set: 'arrow_hit',
      anchor: 'target',
      cells: 2.15,
      mode: 'aimed',
      playbackSpeed: 0.7,
      sparks: hitSparks(CYAN, 1.1),
    },
  },
  // 近战突刺：把 thrust 生图拉成扎过去的路径，再在目标上播楔形
  cavalry: {
    pathBeam: pathGlow(MAGENTA, 'smooth', 10, 'thrust'),
    impact: {
      set: 'thrust',
      anchor: 'target',
      cells: 2.25,
      mode: 'aimed',
      playbackSpeed: 0.72,
      sparks: hitSparks(MAGENTA, 0.9),
    },
  },
  // 近战钝击：bash_hit 生图就是爆炸，不再叠一层几何星
  shield: {
    impact: {
      set: 'bash_hit',
      anchor: 'target',
      cells: 2.0,
      mode: 'burst',
      alpha: 0.9,
      playbackSpeed: 0.7,
      sparks: hitSparks(SILVER),
    },
  },
  // 远程炎弹普攻：一颗小火球砸上去。爆炸图留给技能「炎弹」
  mage: {
    travel: {
      glowSet: 'ember_orb',
      cells: 1.15,
      speedPxPerSec: 400,
      minMs: 220,
      lingerMs: 50,
      trail: trailSparks(FIRE),
      ribbon: ribbonGlow(FIRE, 5),
    },
    impact: {
      set: 'ember_orb',
      anchor: 'target',
      cells: 1.55,
      mode: 'burst',
      playbackSpeed: 0.8,
      sparks: hitSparks(FIRE, 1.0),
    },
  },
  // 远程圣光弹：出手光球、轨迹光球残影、命中 holy_burst
  healer: {
    cast: {
      set: 'holy_orb',
      anchor: 'caster',
      cells: 1.25,
      mode: 'burst',
      playbackSpeed: 0.85,
      sparks: hitSparks(MINT),
    },
    travel: {
      glowSet: 'holy_orb',
      cells: 1.4,
      speedPxPerSec: 320,
      minMs: 280,
      lingerMs: 100,
      trail: trailSparks(MINT),
      ribbon: ribbonGlow(MINT, 5),
      beamSet: 'holy_bolt',
    },
    impact: {
      set: 'holy_burst',
      anchor: 'target',
      cells: 2.2,
      mode: 'burst',
      alpha: 0.92,
      playbackSpeed: 0.7,
      sparks: hitSparks(MINT),
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
  // 剑士 · 旋风斩：先绕身扫一圈月牙，再播三片刃
  whirl: {
    slashSweep: { ...slashArc(GOLD, 1.7, Math.PI * 2, 'whirl'), durationMs: 360, thicknessPx: 13 },
    impact: {
      set: 'whirl',
      anchor: 'caster',
      cells: 3,
      mode: 'burst',
      playbackSpeed: 0.75,
      sparks: skillSparks(GOLD),
    },
  },
  // 弓手 · 穿透箭：飞箭 + 能量尾迹 + 光带，沿途每个目标依次中招
  pierce: {
    travel: {
      sprite: 'proj_arrow',
      cells: 1.45,
      speedPxPerSec: 380,
      minMs: 260,
      lingerMs: 70,
      trail: trailSparks(CYAN),
      // 穿透和普攻的视觉差就在这条生图尾迹：普攻只有箭残影，穿透再拖 pierce 光束
      beamSet: 'pierce',
      ribbon: ribbonGlow(CYAN, 6),
    },
    impact: {
      set: 'pierce',
      anchor: 'target',
      cells: 2.1,
      mode: 'aimed',
      playbackSpeed: 0.7,
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
      playbackSpeed: 0.72,
      sparks: skillSparks(SILVER),
    },
  },
  // Boss · 底层狂暴战吼（未换皮时的结算 id 仍指向这里）
  savage_roar: {
    impact: {
      set: 'roar',
      anchor: 'caster',
      cells: 3.2,
      mode: 'burst',
      playbackSpeed: 0.72,
      sparks: skillSparks([0xfff0d0, 0xff8a2a, 0xc21f1f]),
    },
  },
  // 第一章 Boss 皮肤「血牙咆哮」：血红犬齿环，与通用橙金 roar 形态区分开
  bloodfang_roar: {
    impact: {
      set: 'bloodfang_roar',
      anchor: 'caster',
      cells: 3.2,
      mode: 'burst',
      playbackSpeed: 0.72,
      sparks: skillSparks([0xffe8e0, 0xff3a2a, 0x8b0000]),
    },
  },
  // 第二章 Boss 皮肤「燎原咒火」：一圈竖直火柱。同为血牙部族，但形态从「环」换成
  // 「向上窜」——两场 Boss 战的招式不能靠颜色分辨（都是红的），只能靠形态。
  // 火星用品红偏冷的一族，和玩家「松脂火把」的暖橙分开。
  bloodfang_wildfire: {
    impact: {
      set: 'bloodfang_wildfire',
      anchor: 'caster',
      cells: 3.2,
      mode: 'burst',
      playbackSpeed: 0.72,
      sparks: skillSparks([0xffd8e8, 0xc2185b, 0x8b0000]),
    },
  },
  /**
   * 第三章 Boss 皮肤「破阵冲撞」：起手一圈冲锋光环，然后沿线逐个突刺。
   *
   * 三个血牙 Boss 都是红色系，所以只能靠**形态**区分（见 §4.4）：
   * 咆哮是向外扩散的环、咒火是向上窜的柱、这一招是**一条贯穿线**。
   *
   * 这里复用了 `charge_aura` 和 `thrust` 两个现成图集，是记了账的美术欠账
   * （见 `enemySkillCatalog` 里这个皮肤的注释）。`impactPerHit` 必须开：
   * 一条线上穿三个人却只闪一下，玩家会以为只打到了一个。
   */
  bloodfang_breach: {
    cast: {
      set: 'charge_aura',
      anchor: 'caster',
      cells: 2.4,
      mode: 'burst',
      sparks: skillSparks([0xffd8e8, 0xc2185b, 0x8b0000]),
    },
    pathBeam: pathGlow([0xffe8e0, 0xff3a2a, 0x8b0000], 'jagged', 12, 'thrust'),
    impact: {
      set: 'thrust',
      anchor: 'target',
      cells: 2.1,
      mode: 'aimed',
      playbackSpeed: 0.7,
      sparks: skillSparks([0xffd8e8, 0xc2185b, 0x8b0000]),
    },
    impactPerHit: true,
  },
  // ── 草原战线临时技能：四种完全不同的「零件」语言，禁止再做成同质环光 ──
  // 野草缠足：目标格藤蔓收束（additive 序列帧）
  temp_gl_snare: {
    pathBeam: pathGlow([0xe8ffe0, 0x5ecc3a, 0x1a6b18], 'smooth', 8, 'temp_gl_snare'),
    impact: {
      set: 'temp_gl_snare',
      anchor: 'target',
      cells: 2.0,
      mode: 'burst',
      playbackSpeed: 0.75,
      sparks: skillSparks([0xe8ffe0, 0x5ecc3a, 0x1a6b18]),
    },
  },
  // 草药敷治：药草十字道具在友军身上放大淡出
  temp_gl_salve: {
    pathBeam: pathGlow([0xf0fff4, 0x7effb0, 0x2a9b6a], 'smooth', 8, 'temp_gl_salve'),
    propBurst: {
      sprite: 'prop_salve',
      anchor: 'target',
      cells: 1.45,
      scaleFrom: 0.65,
      scaleTo: 1.6,
      durationMs: 560,
      sparks: hitSparks([0xf0fff4, 0x7effb0, 0x2a9b6a]),
    },
  },
  // 惊扰蜂群：蜜蜂团弹体分头飞向每个敌人（对齐射手箭的 travel 语法）
  temp_gl_swarm: {
    travel: {
      sprite: 'proj_bees',
      cells: 1.5,
      speedPxPerSec: 300,
      minMs: 240,
      trail: trailSparks([0xfff0c0, 0xffb020, 0xc45a00]),
      ribbon: ribbonGlow([0xfff0c0, 0xffb020, 0xc45a00], 6),
      orbitLaps: 3,
    },
    travelPerTarget: true,
  },
  // 法师 · 炎弹技能：出手闪光 + 大火球，落到才炸。普攻只是小球砸中，不播这张爆炸
  ember: {
    cast: {
      set: 'ember_orb',
      anchor: 'caster',
      cells: 1.55,
      mode: 'burst',
      playbackSpeed: 0.8,
      sparks: skillSparks(FIRE),
    },
    travel: {
      glowSet: 'ember_orb',
      cells: 1.75,
      speedPxPerSec: 300,
      minMs: 300,
      lingerMs: 110,
      trail: trailSparks(FIRE),
      ribbon: ribbonGlow(FIRE, 6),
      beamSet: 'ember_wave',
    },
    impact: {
      set: 'ember_burst',
      anchor: 'target',
      cells: 2.8,
      mode: 'burst',
      playbackSpeed: 0.65,
      sparks: skillSparks(FIRE, 0.9),
    },
  },
  // 法师 · 炎环：自身 2 格火环，盖住 5×5。不是旋风刃、不是奥术星
  flame_ring: {
    impact: {
      set: 'flame_ring',
      anchor: 'caster',
      cells: 5,
      mode: 'burst',
      playbackSpeed: 0.7,
      sparks: skillSparks(FIRE),
    },
  },
  // 祭司 · 圣疗：十字光自己连过去再爆。普攻才是光球砸人，不共用 holy_orb 路径
  heal_touch: {
    cast: {
      set: 'heal_flash',
      anchor: 'caster',
      cells: 1.3,
      mode: 'burst',
      playbackSpeed: 0.85,
    },
    pathBeam: pathGlow(MINT, 'smooth', 12, 'heal_flash'),
    impact: {
      set: 'heal_flash',
      anchor: 'target',
      cells: 2.35,
      mode: 'burst',
      alpha: 0.92,
      playbackSpeed: 0.7,
      sparks: skillSparks(MINT),
    },
  },
  // 祭司 · 守护祷言：盾轮廓连过去再撑开。不复用圣疗十字、也不复用普攻光球
  ward_prayer: {
    cast: {
      set: 'ward_aegis',
      anchor: 'caster',
      cells: 1.35,
      mode: 'burst',
      playbackSpeed: 0.85,
    },
    pathBeam: pathGlow(MINT, 'smooth', 11, 'ward_aegis'),
    impact: {
      set: 'ward_aegis',
      anchor: 'target',
      cells: 2.6,
      mode: 'burst',
      alpha: 0.95,
      playbackSpeed: 0.7,
      sparks: skillSparks(MINT),
    },
  },
  // 战场祝福：施法者脚下四向升光。商店临时槽也会卖，形态必须自己能认
  field_bless: {
    impact: {
      set: 'bless_rays',
      anchor: 'caster',
      cells: 3.3,
      mode: 'burst',
      playbackSpeed: 0.72,
      sparks: skillSparks(MINT),
    },
  },
  // 牧野号角：头顶号角光效放大淡出（additive，不是写实道具）
  temp_gl_horn: {
    propBurst: {
      sprite: 'prop_horn',
      anchor: 'caster',
      cells: 1.35,
      scaleFrom: 0.55,
      scaleTo: 1.85,
      durationMs: 1200,
      blend: 'add',
      yOffsetCells: -0.85,
      sparks: skillSparks([0xfff0c8, 0xffc040, 0xd47800]),
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
    cells: 2.3,
    mode: 'burst',
    alpha: 0.9,
    playbackSpeed: 0.75,
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
  if (recipe.slashSweep?.set) ids.push(recipe.slashSweep.set);
  if (recipe.pathBeam?.set) ids.push(recipe.pathBeam.set);
  return ids;
}

/** 每场战斗都要预取的特效集合：上场职业普攻 + 各自默认技能 */
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
