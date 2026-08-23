import type { UnitKind } from '@/battle/types';
import { defaultSkillId } from '@/data/skillCatalog';
import { isMookArt } from '@/view/animSets';

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
  /** 整段挥击的时长。逐帧图会被压进这个时长播完，所以它也是「这一刀有多重」 */
  durationMs: number;
  thicknessPx: number;
  /**
   * 挥砍的 additive 逐帧图集。缺省时退回几何弧兜底。
   *
   * 这里原先还有一个 `sprite` 字段，用来沿弧线反复钉一张实体剑的抠图。
   * 那条路已经删掉：单张静态图沿路径平移做不出挥砍——挥砍的信息量在刀身角度的
   * 变化里，钉一张带护手握柄的剑的结果是一把剑绕着角色打转。
   */
  set?: string;
}

/**
 * 蓄力前摇：能量收束，末尾攒成亮核。**由代码画。**
 *
 * 这一段是节奏的来源。它不是「多一个特效」，而是把原本零前摇的
 * 「技能名刚飘出来，爆炸已经播完了」拆成「攒 → 放」两拍。
 * 时长比什么都重要：太短没有期待，太长拖回合。自身 AoE 260–340ms，
 * 弹道 200–260ms（后面还有飞行时间可以垫）。
 */
export interface WindupSpec {
  durationMs: number;
  color: number;
  glowColor?: number;
  /** 从几格外开始往里收 */
  fromCells: number;
  /** 收束的碎片数 */
  shards?: number;
  /**
   * - `implode` 360° 向内收，给自身 AoE：气在身上聚，然后炸开。
   * - `gather`  朝出手方向聚成一点，给弹道和单体重击：能量攒在手上，然后送出去。
   */
  style?: 'implode' | 'gather';
}

/**
 * 棋盘震动。作用在棋盘层而不是整屏——HUD 跟着抖会读成界面坏了。
 * 实现见 `src/view/battle/cameraShake.ts`。
 */
export interface ShakeSpec {
  /** 峰值振幅（像素）。格子约 72 时，4 是轻击、9 是重击、14 是 Boss 级 */
  amplitudePx: number;
  durationMs: number;
  /** 每秒来回几次。钝器砸地用低频（闷），剑刃切中用高频（脆）。缺省 20 */
  frequencyHz?: number;
  /**
   * 沿「施法者 → 目标」方向单向抖，读起来是「被打进去」。单体重击用它。
   * 缺省 false = 随机换向，读起来是「炸开」，给 AoE 用。
   *
   * 方向只能在运行时算，所以这里是个开关而不是一个向量。
   */
  alongAim?: boolean;
}

/**
 * 点击：**普攻专用**，几乎只是「碰到了」。
 *
 * 比技能低一档是必须的：一场战斗有几十次普攻、只有几次技能施放。
 * 普攻按技能的力度震，整场就是持续晃动，技能反而不再突出——
 * 打击感是相对的，全都最重等于全都没有。
 */
export const SHAKE_TAP: ShakeSpec = {
  amplitudePx: 3, durationMs: 120, frequencyHz: 28, alongAim: true,
};
/** 轻击：低倍率技能、控制类技能 */
export const SHAKE_LIGHT: ShakeSpec = {
  amplitudePx: 5, durationMs: 160, frequencyHz: 26, alongAim: true,
};
/** 重击：单体高倍率技能（重劈、铁锤、破阵斩） */
export const SHAKE_HEAVY: ShakeSpec = {
  amplitudePx: 9, durationMs: 240, frequencyHz: 15, alongAim: true,
};
/** 爆炸：AoE 和 Boss 招式。不带方向——环形爆炸没有「被推」的朝向 */
export const SHAKE_BLAST: ShakeSpec = { amplitudePx: 12, durationMs: 300, frequencyHz: 18 };

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
   * 整体不透明度，缺省 1。
   *
   * 别拿它当亮度旋钮用。亮度归两段式混合管（见 `src/view/vfxBlend.ts`），
   * 调低这个字段是连形体一起变淡——原先这里配的一排 0.55~0.75 是为纯 additive
   * 配的亮度闸门，混合口径改掉之后它们只剩「让每个特效都半透明」这一个效果，
   * 已经全部清掉。只有确实想让单位从特效里透出来时才写它。
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
 * 魔法弹可以「实体 + 身后光」：`sprite` 认形状，`glowSet` 补一圈可见的光。
 */
export interface TravelDef {
  /** FX_BUNDLE 里的抠图弹体 key，如 `proj_arrow_wood`。有它时走普通混合 */
  sprite?: string;
  /**
   * **多帧**抠图弹体（透明底、普通混合的动画集合）。
   *
   * 和 `sprite` 的区别只在帧数，和 `glowSet` 的区别在混合方式：
   * `glowSet` 是光，走两段式（形体普混 + 核心 additive）；这条是**实体**，
   * 只有普通混合，不叠核心层——给一团蜜蜂加辉光会让它变成一团发光的雾。
   *
   * 存在的理由：静态单图 + 位移做不出「群体在扰动」。蜂群从前是一张静图沿轨道平移，
   * 屏幕上是一块贴纸在滑，和剑士从前拿一张剑图沿弧线钉下去是同一种毛病。
   */
  spriteSet?: string;
  /**
   * additive 光球。单独用时就是弹体（圣光）；
   * 和 `sprite` 一起用时铺在实体后面，帮火球在草地上被看见。
   */
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
  /**
   * 处决触发时叠在**那个目标**上的闪光。旋风斩的「斩残」复用重劈的垂直劈裂：
   * 刃环还是扫一圈，残血的那个身上再多一记下劈，才读得出「这一刀不一样」。
   *
   * 只在 `modNote === '处决'` 的命中上播。没写这一项的技能（燃尽、通用处决）
   * 仍然只飘字，避免法师火球打出一记金橙重劈。
   */
  executeImpact?: FlashDef;
  /**
   * 溅射命中叠在**周围那些人**身上的闪光。长驱「贯枪」复用践踏的蹄印扬尘：
   * 主目标仍是螺旋钻刺，邻格再扬一把土，才读得出「这一枪带了周围」。
   *
   * 只在 `SkillHit.splash` 上播。没写的技能（通用溅射、炎弹爆炎）不加。
   */
  splashImpact?: FlashDef;
  /**
   * 施放前的能量收束（代码画）。**AoE 和高倍率单体都该有。**
   *
   * 它播完才进 slash / travel / impact，所以它买到的是节奏：
   * 没有这一段，技能名胶囊刚飘出来爆炸就结束了，玩家的视线还没移到那一格。
   */
  windup?: WindupSpec;
  /**
   * 命中瞬间的棋盘震动。远程在弹体抵达时震，近战在命中闪光时震。
   * AoE 只震一次（在第一个目标上），每个目标各震一次会糊成持续抖动。
   */
  shake?: ShakeSpec;
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
/**
 * 芙洛霜环占位色。比弓手电青更白、更淡，避免两招都读成「一道青光」。
 * 正式冰系图集还没做，先靠色相把这一招从奥莉的火里拉开。
 */
const FROST = [0xf7fbff, 0xa8d4ff, 0x3a7ab8] as const;
/**
 * 中毒叠层。紫是状态语言，不是职业色——和法师品红（偏粉）错开，走葡萄紫。
 * 淬毒 / 贯钉 / 霜噬 / 蜂群，凡是会挂毒的招都叠这一团，不跟技能自己的色相走。
 */
const POISON = [0xf3e8ff, 0x9b4dff, 0x4a1a8a] as const;
const MINT = [0xf0fff4, 0x6ee7b7, 0x0d9488] as const;

// --- 章节色（只给商店卖的临时技能用）---
//
// 临时技能不属于任何职业，所以不吃上面六族的色相——玩家看到林绿就知道
// 「这不是队里谁的招牌，是这一章捡的牌」。都刻意压暗一档：临时技能是功能牌，
// 亮度盖过角色技能会抢戏。
/** 森林章林绿：比草原章的草绿更暗更木质，免得荆棘和野草看成同一招 */
const BARK = [0xeaf7d0, 0x8fae3a, 0x4a5a12] as const;
/** 松脂火把的暖橙：比法师赤焰更黄，火把不该看成奥莉在放火 */
const TORCH = [0xfff2cc, 0xff9a2a, 0xc25400] as const;
/** 要塞章攻城土金：比剑士金橙更褐更暗 */
const SIEGE = [0xffeccc, 0xd98a34, 0x8a4a12] as const;
/**
 * 终章龙息：全表最亮的一族，内芯直接给到近白。
 *
 * 和法师赤焰（FIRE）的关系是**同色相不同色温**——赤焰中段是 #ff4a12 的红橙，
 * 这一族中段是 #ff7a18 的纯橙、外沿也更红。区分靠的是「烧得更旺」而不是换色相：
 * 终章 Boss 的招式不该看成奥莉在放火，但也不该为了区分而变成另一个颜色的火。
 */
const DRAKEFIRE = [0xfff6e0, 0xff7a18, 0xb3200c] as const;
/**
 * 毒沼章瘟疫脓黄绿。
 *
 * **绝不能画成紫色。** 瘟疫/毒在通用美术语言里几乎总是紫的，而紫是本项目的硬禁
 * （既贴近抠色键，也和我方法师的品红族撞）。改走脓黄绿之后另有一个好处：
 * 它和第二章的林绿（BARK）是同一色相的两个极端——那个暗而木质，这个亮而酸，
 * 于是「森林」和「腐坏」在屏幕上分得开，而不用再占一个新色相。
 */
const MIASMA = [0xcfe05a, 0xa8bc3a, 0x3d5220] as const;
/**
 * 第三章破阵冲撞：白热芯 + 钢青身 + 血红沿。
 *
 * 三个血牙 Boss 只能靠形态区分，但这一招还多一层任务——它要读成**攻城器械**
 * 而不是又一次咆哮。所以中段破例给了钢青（和这一章守军的甲、和城门同色系），
 * 血红只压在边沿保住部族归属。这是血牙三招里唯一不以红为主体的一招。
 */
const BREACH = [0xffe8e0, 0x7a8794, 0xa8201a] as const;
/**
 * 杂兵通用攻击：骨白芯 + 锈褐。
 *
 * 不进上面六族——那六族是「谁在出手」的职业色。杂兵共用这一族，玩家看到锈褐
 * 就知道是野怪在挠 / 喷 / 砸，不是队里谁的金橙刀光。
 */
const FERAL = [0xfff0d4, 0xc47a32, 0x6a3010] as const;

/** 火花/光带不用近白那档，否则一叠就糊成灯泡 */
function toneColors(colors: readonly number[]): number[] {
  if (colors.length >= 3) return [colors[1]!, colors[2]!];
  if (colors.length === 2) return [colors[1]!];
  return [...colors];
}

/** 命中火花：量少、快、带一点重力，跟着伤害数字一起消失 */
export function hitSparks(colors: readonly number[], coneRad?: number): SparkSpec {
  return {
    count: 7,
    colors: toneColors(colors),
    speedMin: 90,
    speedMax: 200,
    radiusMin: 1.2,
    radiusMax: 2.4,
    lifeMinMs: 220,
    lifeMaxMs: 380,
    gravity: 300,
    coneRad,
  };
}

/** 技能火花：比命中稍多，但仍克制，避免盖住生图形状 */
export function skillSparks(colors: readonly number[], coneRad?: number): SparkSpec {
  return {
    count: 10,
    colors: toneColors(colors),
    speedMin: 110,
    speedMax: 240,
    radiusMin: 1.3,
    radiusMax: 2.8,
    lifeMinMs: 280,
    lifeMaxMs: 480,
    gravity: 80,
    coneRad,
  };
}

/** 拖尾火花：比命中火花更小更短，只是标出弹体走过的路线 */
export function trailSparks(colors: readonly number[]): SparkSpec {
  return {
    count: 3,
    colors: toneColors(colors),
    speedMin: 14,
    speedMax: 50,
    radiusMin: 0.9,
    radiusMax: 1.8,
    lifeMinMs: 160,
    lifeMaxMs: 260,
    gravity: 36,
    coneRad: 0.9,
  };
}

export function ribbonGlow(colors: readonly number[], widthPx = 16): RibbonSpec {
  return {
    color: colors[1] ?? 0xffffff,
    glowColor: colors[2] ?? colors[1] ?? 0xffffff,
    widthPx,
    // 弹体飞 420~480ms，拖尾要能覆到大半条路径才读得出「拖」。
    // 原先 280ms 只盖住尾巴一小截，加上当年整条走 additive 被草地洗白，
    // 屏幕上几乎看不见有拖尾这回事
    tailMs: 440,
    fadeMs: 320,
  };
}

/**
 * 一条从施法者铺到目标的光路。
 *
 * `widthPx` 是光束在**屏幕上的实际厚度**（像素）。带 `set` 时它从前按源帧 256px
 * 算缩放，实体占不满源帧的那部分就被白白吃掉——详见 `vfxProcedural.ts` 的 `inkBox`。
 *
 * 这个口径修正**只对楔形的 `thrust` 有实质影响**（实体只占帧高 43%，厚度 2.3 倍），
 * 祭司那几条光路用的是放射状闪光、实体占帧 89-96%，只动 1.0-1.1 倍。
 * 格子最大 56px，所以 11px 约合 0.2 格，这才是一条「看得见的光」该有的粗细。
 */
export function pathGlow(
  colors: readonly number[],
  style: PathBeamSpec['style'] = 'smooth',
  widthPx = 11,
  set?: string,
  persistMs = 280,
): PathBeamSpec {
  return {
    style,
    color: colors[1] ?? 0xffffff,
    glowColor: colors[2] ?? colors[1] ?? 0xffffff,
    widthPx,
    persistMs,
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

/**
 * 自身 AoE 的起手：360° 向内收束。旋风斩、炎环、践踏这类「气聚在身上然后炸开」。
 * 时长默认 300ms——低于 240 读不出「攒住了」，高于 380 就开始拖回合。
 */
export function windupImplode(
  colors: readonly number[],
  fromCells = 1.55,
  durationMs = 300,
): WindupSpec {
  return {
    durationMs,
    color: colors[1] ?? 0xffffff,
    glowColor: colors[0] ?? colors[1] ?? 0xffffff,
    fromCells,
    shards: 9,
    style: 'implode',
  };
}

/**
 * 弹道和单体重击的起手：朝出手方向聚成一点。
 * 比 `windupImplode` 短——后面还有飞行时间或挥击时间可以垫节奏。
 */
export function windupGather(
  colors: readonly number[],
  fromCells = 1.15,
  durationMs = 230,
): WindupSpec {
  return {
    durationMs,
    color: colors[1] ?? 0xffffff,
    glowColor: colors[0] ?? colors[1] ?? 0xffffff,
    fromCells,
    shards: 5,
    style: 'gather',
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
 * 普攻特效，按**兵种原型**取。只给我方英雄，以及精英 / Boss 的普攻。
 * 各章杂兵（含第三章人形守军）走下面的 `MOOK_ATTACK_VFX`。
 *
 * 敌人的 defId 仍是 sword/bow/...，但再让黏泥怪挥金橙刀光，玩家读成「对面也是我方
 * 那一套招」——近战 / 远程 / 砸的语法可以共用，零件不能共用。
 */
export const ATTACK_VFX: Record<UnitKind, VfxRecipe> = {
  // 近战斩击：生图斩击弧扫过去，落到目标再盖一记。几何弧只垫一层很淡的光
  sword: {
    /**
     * 挥砍用 `sword_swing` 的**逐帧**刀影，朝目标方向摆。
     *
     * 原先是拿 `slash_blade`（一整把带护手握柄的剑的侧视图）沿弧线反复钉下去、
     * 每次转一点角度，屏幕上就是一把剑连着柄在角色身边打转。单张静态图沿路径平移
     * 做不出挥砍——挥砍的信息量在**刀身角度的变化**里，而那正是单图运动丢掉的东西。
     */
    slashSweep: { ...slashArc(GOLD, 1.9, 2.5, 'sword_swing'), durationMs: 300 },
    impact: {
      set: 'slash',
      anchor: 'target',
      cells: 1.55,
      mode: 'burst',
      playbackSpeed: 0.72,
      sparks: hitSparks(GOLD),
    },
    shake: SHAKE_TAP,
  },
  // 远程射击：箭的残影铺轨迹，命中播 arrow_hit 生图
  bow: {
    travel: {
      // 短木箭，0.62 格。**尺子是角色身高（0.92 格），不是格子**——箭比人高就成了投枪。
      // 从前写 1.05 格，出屏比角色还长一截；而且渲染侧的下限把它和速射箭一起顶到
      // 1 格，三支箭的长度差其实一直不存在。
      sprite: 'proj_arrow_wood',
      cells: 0.62,
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
    shake: SHAKE_TAP,
  },
  // 近战突刺：把 thrust 生图拉成扎过去的路径，再在目标上播楔形
  cavalry: {
    // 22px 约 0.4 格厚。楔形前刺的信息量全在刀口的厚度上，压成发丝就只剩一道紫痕
    pathBeam: pathGlow(MAGENTA, 'smooth', 22, 'thrust'),
    impact: {
      set: 'thrust',
      anchor: 'target',
      cells: 2.25,
      mode: 'aimed',
      playbackSpeed: 0.72,
      sparks: hitSparks(MAGENTA, 0.9),
    },
    shake: SHAKE_TAP,
  },
  // 近战钝击：bash_hit 生图就是爆炸，不再叠一层几何星
  shield: {
    impact: {
      set: 'bash_hit',
      anchor: 'target',
      cells: 2.0,
      mode: 'burst',
      playbackSpeed: 0.7,
      sparks: hitSparks(SILVER),
    },
    shake: SHAKE_TAP,
  },
  // 远程炎弹普攻：一颗小火球砸上去。爆炸图留给技能「炎弹」
  mage: {
    travel: {
      // 火球只用 `ember_orb` 那套六帧发光图，不再叠 `proj_ember` 抠图。
      // 那张抠图有 31.9% 的**不透明**像素亮度低于 60——是生图时画进去的漫画黑描边
      // （违反《特效圣经》§4.7「特效不要画漫画描边」），普通混合下就是一圈死黑边；
      // 而且它是**一张静态图**在平移，火球飞起来是僵的。
      // 发光图那套是六帧、有胀缩和舔舐的焰尾，两段式混合之后红橙也回来了。
      glowSet: 'ember_orb',
      cells: 1.7,
      speedPxPerSec: 210,
      minMs: 420,
      // 60 而不是 140：拖长了会和命中闪光叠在一起，屏幕上同时有两颗火球
      lingerMs: 60,
      trail: trailSparks(FIRE),
      ribbon: ribbonGlow(FIRE, 6),
    },
    /**
     * 命中用**放射状**的 `ember_burst`，不是再放一颗 `ember_orb`。
     *
     * 从前是后者，于是火球「打到人身上会拐个弯」：`ember_orb` 是一颗带焰尾的彗星，
     * 有明确朝向，飞行段按射向转过；而命中段 `mode: 'burst'` 把朝向钉死成 0（朝右）。
     * 斜着射出去的那一发，一命中焰尾就从斜角瞬间掰成水平——那就是那个弯。
     *
     * 光把 mode 改成 `aimed` 只是遮住症状：**有朝向的素材当命中闪光用本身就是错的**，
     * 炸开这个动作没有方向。
     *
     * 也不能直接借炎弹的 `ember_burst`——那会让普攻和技能的命中变成同一张图
     * （`vfxCatalog.test.ts` 有守卫拦这个）。所以普攻有自己的 `ember_splat`：
     * 炎弹是在空中**炸开**（径向对称、八条等长火舌、一圈扩散环），
     * 普攻是拍在身上**溅开**（长短不齐的火舌偏上舔、火滴飞散、没有环）。
     */
    impact: {
      set: 'ember_splat',
      anchor: 'target',
      cells: 1.45,
      mode: 'burst',
      playbackSpeed: 0.95,
      sparks: hitSparks(FIRE, 1.0),
    },
    shake: SHAKE_TAP,
  },
  // 圣击是光，不是徽章：光球 + 青绿折线，和火球/飞箭分开
  healer: {
    travel: {
      glowSet: 'holy_orb',
      cells: 1.35,
      speedPxPerSec: 280,
      minMs: 320,
      lingerMs: 110,
      trail: trailSparks(MINT),
      beamSet: 'holy_bolt',
    },
    impact: {
      set: 'holy_burst',
      anchor: 'target',
      cells: 1.8,
      mode: 'burst',
      playbackSpeed: 0.7,
      sparks: hitSparks(MINT),
    },
    shake: SHAKE_TAP,
  },
};

/**
 * 杂兵普攻。按兵种原型分四种语法，零件是自己的糙一套：
 * 近战抓挠 / 远程喷吐 / 突进抓挠 / 甲壳砸击。
 *
 * 第三章守军也走这里：它们是人形，但仍然是「小怪」，不该挥我方那把金橙刀。
 */
export const MOOK_ATTACK_VFX: Record<UnitKind, VfxRecipe> = {
  sword: {
    impact: {
      set: 'mook_claw',
      anchor: 'target',
      cells: 1.45,
      mode: 'aimed',
      playbackSpeed: 0.85,
      sparks: hitSparks(FERAL),
    },
    shake: SHAKE_TAP,
  },
  bow: {
    travel: {
      glowSet: 'mook_spit',
      cells: 0.7,
      speedPxPerSec: 280,
      minMs: 240,
      lingerMs: 50,
      noRotate: true,
      trail: trailSparks(FERAL),
      ribbon: ribbonGlow(FERAL, 5),
    },
    impact: {
      set: 'mook_puff',
      anchor: 'target',
      cells: 1.35,
      mode: 'burst',
      playbackSpeed: 0.9,
      sparks: hitSparks(FERAL),
    },
    shake: SHAKE_TAP,
  },
  cavalry: {
    pathBeam: pathGlow(FERAL, 'smooth', 10),
    impact: {
      set: 'mook_claw',
      anchor: 'target',
      cells: 1.5,
      mode: 'aimed',
      playbackSpeed: 0.85,
      sparks: hitSparks(FERAL, 0.9),
    },
    shake: SHAKE_TAP,
  },
  shield: {
    impact: {
      set: 'mook_thud',
      anchor: 'target',
      cells: 1.55,
      mode: 'burst',
      playbackSpeed: 0.85,
      sparks: hitSparks(FERAL),
    },
    shake: SHAKE_TAP,
  },
  mage: {
    travel: {
      glowSet: 'mook_spit',
      cells: 0.85,
      speedPxPerSec: 240,
      minMs: 280,
      lingerMs: 50,
      noRotate: true,
      trail: trailSparks(FERAL),
      ribbon: ribbonGlow(FERAL, 5),
    },
    impact: {
      set: 'mook_puff',
      anchor: 'target',
      cells: 1.4,
      mode: 'burst',
      playbackSpeed: 0.9,
      sparks: hitSparks(FERAL),
    },
    shake: SHAKE_TAP,
  },
  healer: {
    travel: {
      glowSet: 'mook_spit',
      cells: 0.75,
      speedPxPerSec: 260,
      minMs: 260,
      lingerMs: 50,
      noRotate: true,
      trail: trailSparks(FERAL),
      ribbon: ribbonGlow(FERAL, 5),
    },
    impact: {
      set: 'mook_puff',
      anchor: 'target',
      cells: 1.35,
      mode: 'burst',
      playbackSpeed: 0.9,
      sparks: hitSparks(FERAL),
    },
    shake: SHAKE_TAP,
  },
};

/** 第三章人形守军：剪影按英雄身高，攻击特效仍走杂兵通用件。 */
const CHAPTER3_MOOK_SETS = new Set([
  'fangtrooper',
  'wallbalist',
  'wallrider',
  'gatewarden',
]);

export function usesMookCombatVfx(animSet?: string): boolean {
  if (!animSet) return false;
  return isMookArt(animSet) || CHAPTER3_MOOK_SETS.has(animSet);
}

/** 回放查普攻配方：杂兵走糙的一套，其余走职业表。 */
export function attackRecipeFor(kind: UnitKind, animSet?: string): VfxRecipe {
  if (usesMookCombatVfx(animSet)) return MOOK_ATTACK_VFX[kind] ?? MOOK_ATTACK_VFX.sword;
  return ATTACK_VFX[kind] ?? ATTACK_VFX.sword;
}

/**
 * 技能特效，按 skillId 取。没登记的技能回退到 `skillFxKey` 的静态贴图。
 *
 * `cells` 要对齐技能的真实范围：`whirl` 是曼哈顿 1 环 = 3×3 格。特效比范围小会让玩家
 * 以为够不着，比范围大更糟——他会按特效的边界去站位然后发现打不到。
 */
export const SKILL_VFX: Record<string, VfxRecipe> = {
  // ══════════════ 剑士 · 金橙 ══════════════
  //
  // 四个形态互不重复（普攻在 ATTACK_VFX）：
  // 普攻=细月牙横扫 / 旋风斩=绕身刃环 / 重劈=垂直劈裂 / 破阵斩=交叉双斩。
  // 同族靠形态分，不靠尺寸——两条只是大小不同的弧，玩家分不出按的是哪个键。

  /**
   * 旋风斩：气先收到身上，再绕身扫一圈。`squareAoE r=1`，`cells=3` 正好盖满 3×3。
   *
   * 不再叠 `slashSweep`。原先它拿**同一套** `whirl` 图集先沿 360° 钉一圈残影、
   * 紧接着又居中整播一遍，玩家看到的是同一批刃光糊成一圈、然后再来一次。
   * `whirl` 本身就是九帧的绕身刃环，居中播一次就是「绕身扫一圈」的完整表达。
   */
  whirl: {
    windup: windupImplode(GOLD, 1.6, 300),
    impact: {
      set: 'whirl',
      anchor: 'caster',
      cells: 3,
      mode: 'burst',
      playbackSpeed: 0.75,
      sparks: skillSparks(GOLD),
    },
    /**
     * 斩残：残血目标身上补一记重劈的垂直劈裂。
     * 斩残原本就挂在重劈上，图集是现成的，而且和绕身刃环形态不撞——
     * 一个是圈、一个是砸，叠在同一个人身上正好是「扫到了，再补一刀」。
     */
    executeImpact: {
      set: 'cleave_slam',
      anchor: 'target',
      cells: 2.2,
      mode: 'burst',
      playbackSpeed: 0.62,
      sparks: skillSparks(GOLD),
    },
    shake: SHAKE_BLAST,
  },
  /**
   * 重劈：抬手蓄力，然后一记垂直劈裂砸在目标身上。
   *
   * 之前**没有配方**，退回 `displayKind` 的静态贴图 `shield_bash`——
   * 剑士的重劈闪出来的是一张盾牌图，而这种错不会报错，只有玩家看得见。
   * `mode='burst'` 不旋转：垂直下劈和目标在左边还是右边无关。
   */
  cleave: {
    windup: windupGather(GOLD, 1.2, 250),
    // 同一套逐帧刀影，但摆得更近、播得更慢（420ms vs 普攻 300ms）：
    // 一记「劈」而不是普攻那种「扫」。慢下来的这 120ms 就是重劈的重量
    slashSweep: {
      ...slashArc(GOLD, 1.45, 1.5, 'sword_swing'),
      durationMs: 420,
      thicknessPx: 14,
    },
    impact: {
      set: 'cleave_slam',
      anchor: 'target',
      cells: 2.3,
      mode: 'burst',
      playbackSpeed: 0.7,
      sparks: skillSparks(GOLD),
    },
    shake: SHAKE_HEAVY,
  },
  /**
   * 破阵斩：两刀交错划开。1.15 倍率 + 削攻，是剑士最重的一下。
   * 蓄力比重劈更长——它是「攒够了一次性交出去」，节奏上要压得住。
   * 同样原先没有配方。
   */
  blade_rush: {
    windup: windupGather(GOLD, 1.35, 300),
    castBurst: castBurst(GOLD, 1.2),
    impact: {
      set: 'blade_x',
      anchor: 'target',
      cells: 2.4,
      mode: 'burst',
      playbackSpeed: 0.62,
      sparks: skillSparks(GOLD),
    },
    shake: SHAKE_HEAVY,
  },

  // ══════════════ 弓手 · 青蓝 ══════════════
  //
  // 三种打法三种读法：普攻=一支箭 / 穿透=箭 + 贯穿光束打一条线 /
  // 速射=同样一支箭但**明显更快**，命中是前向穿刺而不是普攻的放射星芒。

  /** 穿透箭：飞箭 + 能量尾迹 + 光带，沿途每个目标依次中招 */
  pierce: {
    windup: windupGather(CYAN, 1.1, 230),
    travel: {
      // 破甲重箭，1.15 格：略高于角色身高，全场最长的一支，但还在「箭」的量级内。
      //
      // 这里**故意不照抄贴图的相对长度**。三支箭是同一张生图按同一比例画的，重箭的
      // 贴图长度是木箭的 2.46 倍，照抄就得给 1.53 格——那又回到「比人大一截」。
      // 压缩长度差之后「重」改由粗细承担：重箭贴图更修长（4.5:1，木箭 2.9:1），
      // 等比缩放下它在 1.15 格时的箭身厚度反而高于木箭在 0.62 格时的，看得出是重箭。
      sprite: 'proj_arrow_heavy',
      cells: 1.15,
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
    shake: SHAKE_HEAVY,
  },
  /**
   * 速射：这一招的全部性格是「快」，所以它花在参数上而不是新形状上。
   *
   * 蓄力只有 150ms（全表最短）、箭速 560 px/s（普攻 400、穿透 380）、箭也是最短的那支，
   * 最短飞行压到 170ms。命中用 `snap_hit` 的前向穿刺，和普攻 `arrow_hit` 的
   * 放射星芒分开——两招都是「一支箭打一个人」，不换命中形态就真的看不出区别。
   * 原先没有配方，退回的是静态 `arrow` 贴图。
   */
  snap: {
    windup: windupGather(CYAN, 0.9, 150),
    travel: {
      // 轻镖箭，0.5 格，全表最短——半个身高。配上 560px/s 的箭速，读作「一闪就到」
      sprite: 'proj_arrow_snap',
      cells: 0.5,
      speedPxPerSec: 560,
      minMs: 170,
      lingerMs: 50,
      trail: trailSparks(CYAN),
      ribbon: ribbonGlow(CYAN, 5),
    },
    impact: {
      set: 'snap_hit',
      anchor: 'target',
      cells: 2.0,
      mode: 'aimed',
      playbackSpeed: 0.95,
      sparks: hitSparks(CYAN, 0.7),
    },
    shake: SHAKE_LIGHT,
  },

  // ══════════════ 盾卫 · 银白 ══════════════
  //
  // 普攻=星芒 / 震击=脚下角状裂纹 / 铁锤=扁平砸地压波 + 崩块。
  // 三个都是钝器，靠「裂 / 压」的差别分，不靠亮度。

  /**
   * 震击：目标脚下地面开裂 + 减速。键是 **skillId**（bash），不是素材名（quake）。
   *
   * 锚点从 `caster` 改成 `target`，尺寸 3 → 2.2。原先是「以自己为圆心炸开 3 格地裂」，
   * 而这一招的形状是 `neighborPickFoe manhattan:1`——点名打**一个**邻格敌人。
   * 三格地裂配单体伤害，玩家会以为自己放了个 AoE 然后只看到一个伤害数字。
   * 裂纹落在被打的那个人脚下，反而正好讲出了「拖慢」：地开了，他走不动。
   */
  bash: {
    windup: windupGather(SILVER, 1.05, 220),
    impact: {
      set: 'quake',
      anchor: 'target',
      cells: 2.2,
      mode: 'burst',
      playbackSpeed: 0.72,
      sparks: skillSparks(SILVER),
    },
    shake: SHAKE_HEAVY,
  },
  /**
   * 铁锤：全表最重的一记单体。蓄力最长（320ms，重武器抬得慢），震动直接给爆炸档。
   * 原先没有配方，退回静态 `shield_bash` 贴图。
   */
  hammer: {
    windup: windupGather(SILVER, 1.4, 320),
    impact: {
      set: 'hammer_smash',
      anchor: 'target',
      cells: 2.5,
      mode: 'burst',
      playbackSpeed: 0.62,
      sparks: skillSparks(SILVER),
    },
    shake: SHAKE_BLAST,
  },

  // ══════════════ 骑兵 · 紫红 ══════════════
  //
  // 普攻=楔形前刺 / 冲锋=出手光环（被动）/ 长驱突刺=螺旋钻刺 / 践踏=离散蹄印环。
  // 突刺类两招都指向目标，所以靠「平面楔形」对「立体螺旋」分开。

  /**
   * 长驱突刺：同行同列 1～2 格点名，所以路径感是它的主角——
   * 拉长的 `thrust` 光路先连过去，落点才是螺旋钻刺。
   * 螺旋而不是再来一个楔形：普攻已经占了楔形（见 §4.4），
   * 同一个角色两招都是「一个向右的三角」等于没做区分。原先没有配方。
   */
  lance_thrust: {
    windup: windupGather(MAGENTA, 1.3, 260),
    // 30px（约 0.54 格）+ 420ms：比普攻更厚更留得住。这一招只点名 2 格外，
    // 路径本来就短，光路要是又细又快闪，屏幕上就几乎没有「冲过去」这段
    pathBeam: pathGlow(MAGENTA, 'smooth', 30, 'thrust', 420),
    impact: {
      set: 'lance_pierce',
      anchor: 'target',
      cells: 2.6,
      mode: 'aimed',
      playbackSpeed: 0.7,
      sparks: skillSparks(MAGENTA, 0.8),
    },
    /**
     * 贯枪：邻格扬尘。践踏那张图本来就不是环——八个蹄印加土，
     * 正好讲「周围的人也挨了」，和主目标的螺旋钻刺不撞形态。
     */
    splashImpact: {
      set: 'trample_dust',
      anchor: 'target',
      cells: 1.9,
      mode: 'burst',
      playbackSpeed: 0.72,
      sparks: skillSparks(MAGENTA),
    },
    shake: SHAKE_HEAVY,
  },
  /**
   * 铁蹄践踏：绕身一圈的离散蹄印 + 减速。
   *
   * 形态特意**不是环**。这个库里的环已经太多了——旋风刃环、地裂环、火环、
   * 咆哮环、冲锋光环，全都是「一圈东西向外扩」。再加一个环，玩家只会看到
   * 「又一个圈亮了」。八个分开的蹄印一个个落下来，是全库唯一一个不靠环讲的 AoE，
   * 而且它自己就说出了「被踩了一圈」和「所以你走不动」。原先没有配方。
   */
  trample: {
    windup: windupImplode(MAGENTA, 1.5, 280),
    // 3.3 格 + 0.6 倍速（约 750ms）。`trample_dust` 的峰值亮区只有 10.1%，
    // 是全库最稀的一张——八个分开的蹄印之间全是空隙，这是「离散而不是环」的
    // 形态代价（见上），但也让它在同样的 cells 下比别人少一大半墨。
    // 先靠放大和放慢补，如果还是读得薄，下一步是重生这张图、给每个蹄印垫一团扬尘。
    impact: {
      set: 'trample_dust',
      anchor: 'caster',
      cells: 3.3,
      mode: 'burst',
      playbackSpeed: 0.6,
      sparks: skillSparks(MAGENTA),
    },
    shake: SHAKE_BLAST,
  },
  // Boss · 底层狂暴战吼（未换皮时的结算 id 仍指向这里）
  savage_roar: {
    windup: windupImplode([0xfff0d0, 0xff8a2a, 0xc21f1f], 1.6, 300),
    shake: SHAKE_BLAST,
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
    windup: windupImplode([0xffe8e0, 0xff3a2a, 0x8b0000], 1.7, 320),
    shake: SHAKE_BLAST,
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
    windup: windupImplode([0xffd8e8, 0xc2185b, 0x8b0000], 1.8, 340),
    shake: SHAKE_BLAST,
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
   * 第三章 Boss 皮肤「破阵冲撞」：一条等宽贯穿线从施法者推出去，沿线逐个震地。
   *
   * 三个血牙 Boss 都是红色系，所以只能靠**形态**区分（见 §4.4）：
   * 咆哮是向外扩散的环、咒火是向上窜的柱、这一招是**一条贯穿线**。
   *
   * 和终章「灭世龙息」底层形状相同（都是 `lineBestRayAllFoes`），特效是玩家区分
   * 两者的唯一线索：那一招是从一点张开的锥，这一招粗细恒定、钝头，读成攻城槌。
   *
   * `impactPerHit` 必须开：一条线上穿三个人却只闪一下，玩家会以为只打到了一个。
   */
  bloodfang_breach: {
    windup: windupGather(BREACH, 1.4, 300),
    shake: SHAKE_HEAVY,
    cast: {
      set: 'bloodfang_breach',
      anchor: 'caster',
      cells: 3.2,
      mode: 'aimed',
      playbackSpeed: 0.75,
      sparks: skillSparks(BREACH),
    },
    pathBeam: pathGlow(BREACH, 'smooth', 12),
    impact: {
      set: 'bash_hit',
      anchor: 'target',
      cells: 2.1,
      mode: 'burst',
      playbackSpeed: 0.75,
      sparks: skillSparks(BREACH),
    },
    impactPerHit: true,
  },
  /**
   * 第四章 Boss 皮肤「腐沼瘟息」：贴地漫开的低伏浊雾。
   *
   * 全套 Boss 特效里唯一一张「填实的低雾」，其余四张都是「向外跑的边」或「有方向的推」。
   * 形态取「向下沉」这个还没人用过的方向，和机制是同一句话：这一章的地形本身在削你
   * （沼泽每回合 −5），这一招把「脚下的东西在害你」再放大一遍。
   *
   * `cells` 给到 4.4，是全表最大的 impact。因为形状是 `discAoE radius:2`——
   * 直径 5 格。前四个 Boss 的 AoE 都是半径 1，照抄它们的 3.2 会让特效明显小于
   * 实际打到的范围，而玩家是照着特效记范围的。
   */
  mirequeen_miasma: {
    windup: windupGather(MIASMA, 1.6, 340),
    shake: SHAKE_HEAVY,
    impact: {
      set: 'mirequeen_miasma',
      anchor: 'caster',
      cells: 4.4,
      mode: 'burst',
      playbackSpeed: 0.7,
      sparks: skillSparks(MIASMA),
    },
  },
  /**
   * 终章 Boss 皮肤「灭世龙息」：从口部张开的锥形吐息，沿线穿透。
   *
   * 它和上面的破阵冲撞**底层形状完全相同**（都是 `lineBestRayAllFoes`），
   * 所以这份配方是玩家区分两场 Boss 战招式的唯一线索，而且不能靠颜色——
   * 破阵已经占了红色系。区分落在**锥形**上：那个是等宽的贯穿线，这个越远越宽。
   * 环（咆哮）/ 柱（咒火）/ 线（破阵）/ 锥（龙息），四个形态维度到这里用满。
   *
   * 锥形挂在 `cast` 而不是 `impact`：它是「从他嘴里喷出来的那一下」，
   * 属于施法者身上的事件，`mode='aimed'` 让它转向目标（素材画成朝右，见
   * docs/prompt/vfx/drake_cataclysm.md）。命中复用 `ember_burst` 的热爆，
   * 是记了账的复用——这一招的辨识度全在锥形上，命中再做一张专属图收益很低。
   *
   * `impactPerHit` 必须开，同破阵：一条线穿三个人却只闪一下，玩家会以为只打到一个。
   */
  drake_cataclysm: {
    windup: windupImplode(DRAKEFIRE, 1.9, 360),
    shake: SHAKE_BLAST,
    cast: {
      set: 'drake_cataclysm',
      anchor: 'caster',
      // 3.6 格是全库最大的 cast，仅此一次：终章最后一招，锥形要真的盖住一条走廊
      cells: 3.6,
      mode: 'aimed',
      playbackSpeed: 0.72,
      sparks: skillSparks(DRAKEFIRE),
    },
    pathBeam: pathGlow(DRAKEFIRE, 'smooth', 14),
    impact: {
      set: 'ember_burst',
      anchor: 'target',
      cells: 2.1,
      mode: 'burst',
      playbackSpeed: 0.75,
      sparks: skillSparks(DRAKEFIRE),
    },
    impactPerHit: true,
  },
  // ══════════════ 杂兵技能：四件通用零件 + 章节色 ══════════════
  //
  // 和 Boss 那五招是两个档位：杂兵不需要被单独记住，所以四张图够用——
  // 抓挠 / 喷吐 / 砸击 / 喷散。原先借玩家旋风斩、火球、铁锤，屏幕上就是
  // 「对面也在放我的招」。零件共用，色相走章节色，认的是「有东西来了」和「哪一章」。

  /** 第二章 · 喷孢囊「孢子喷散」：贴身一圈脏雾。 */
  spore_spray: {
    windup: windupGather(BARK, 1.3, 240),
    shake: SHAKE_LIGHT,
    impact: {
      set: 'mook_puff',
      anchor: 'caster',
      cells: 2.8,
      mode: 'burst',
      playbackSpeed: 0.75,
      sparks: skillSparks(BARK),
    },
  },
  /** 第三章 · 巡墙狼骑「撞阵」：隔一格砸上去。 */
  wall_ram: {
    windup: windupGather(SIEGE, 1.2, 220),
    shake: SHAKE_HEAVY,
    pathBeam: pathGlow(SIEGE, 'smooth', 9),
    impact: {
      set: 'mook_thud',
      anchor: 'target',
      cells: 1.8,
      mode: 'burst',
      playbackSpeed: 0.85,
      sparks: skillSparks(SIEGE),
    },
  },
  /** 第四章 · 吹箭虫「淬毒吹箭」：一团脏液飞过去，不是弓。 */
  venom_dart: {
    windup: windupGather(MIASMA, 0.9, 170),
    travel: {
      glowSet: 'mook_spit',
      cells: 0.55,
      speedPxPerSec: 320,
      minMs: 200,
      lingerMs: 40,
      noRotate: true,
      trail: trailSparks(MIASMA),
      ribbon: ribbonGlow(MIASMA, 5),
    },
    impact: {
      set: 'mook_puff',
      anchor: 'target',
      cells: 1.4,
      mode: 'burst',
      playbackSpeed: 0.95,
      sparks: skillSparks(MIASMA),
    },
    shake: SHAKE_LIGHT,
  },
  /** 第四章 · 沼行鳄「毒沼撕咬」：邻格抓挠。 */
  mire_bite: {
    windup: windupGather(MIASMA, 1.0, 200),
    shake: SHAKE_HEAVY,
    impact: {
      set: 'mook_claw',
      anchor: 'target',
      cells: 1.7,
      mode: 'aimed',
      playbackSpeed: 0.85,
      sparks: skillSparks(MIASMA),
    },
  },
  /** 终章 · 熔岩块「爆裂」：贴身一圈喷散。 */
  magma_burst: {
    windup: windupImplode(DRAKEFIRE, 1.4, 260),
    shake: SHAKE_BLAST,
    impact: {
      set: 'mook_puff',
      anchor: 'caster',
      cells: 2.8,
      mode: 'burst',
      playbackSpeed: 0.75,
      sparks: skillSparks(DRAKEFIRE),
    },
  },
  /** 终章 · 火翼蝠「火星吐息」：小一团喷吐，不是奥莉的火球。 */
  cinder_breath: {
    windup: windupGather(DRAKEFIRE, 1.0, 180),
    travel: {
      glowSet: 'mook_spit',
      cells: 0.8,
      speedPxPerSec: 280,
      minMs: 220,
      lingerMs: 50,
      noRotate: true,
      trail: trailSparks(DRAKEFIRE),
      ribbon: ribbonGlow(DRAKEFIRE, 5),
    },
    impact: {
      set: 'mook_puff',
      anchor: 'target',
      cells: 1.45,
      mode: 'burst',
      playbackSpeed: 0.85,
      sparks: skillSparks(DRAKEFIRE),
    },
    shake: SHAKE_LIGHT,
  },
  /**
   * 终章 · 岩鳞龙兽「龙息冲刺」：隔一格抓过去。
   * 和狼骑「撞阵」同形，区分靠抓挠 vs 砸击，再加上章节色。
   */
  wyrm_dash: {
    windup: windupGather(DRAKEFIRE, 1.2, 220),
    shake: SHAKE_HEAVY,
    pathBeam: pathGlow(DRAKEFIRE, 'smooth', 10),
    impact: {
      set: 'mook_claw',
      anchor: 'target',
      cells: 1.7,
      mode: 'aimed',
      playbackSpeed: 0.8,
      sparks: skillSparks(DRAKEFIRE),
    },
  },
  /** 终章 · 灰烬甲虫「硬化」：自身一记闷响，不借盾墙。 */
  ash_harden: {
    windup: windupGather(SILVER, 1.1, 220),
    shake: SHAKE_LIGHT,
    impact: {
      set: 'mook_thud',
      anchor: 'caster',
      cells: 1.9,
      mode: 'burst',
      playbackSpeed: 0.8,
      sparks: skillSparks(SILVER),
    },
  },

  // ── 草原战线临时技能：四种完全不同的「零件」语言，禁止再做成同质环光 ──
  /**
   * 野草缠足：长草窜起来在敌人腿上打成一个结。
   *
   * 从 additive 改成**抠图 + 普通混合**。原先它是全库在草地上最看不清的一张：
   * 自身像素里有 **64%** 与草地色差 <60，基本等于没放特效。
   * 原因是双重的——additive 按亮度烘 alpha（暗部变透明），逼得草只能画成亮绿；
   * 而战场草地本身就是亮绿（RGB 202,225,54）。亮绿画在亮绿上，形状全丢。
   * 改成深色实体草之后是 3.3%。
   *
   * 顺带把连线从「拉长这张草图」改回程序光带：把一团草结沿施法者→目标拉长，
   * 出屏是一条被抹开的草污，而连线要传达的只是「这一发是冲他去的」。
   */
  temp_gl_snare: {
    windup: windupGather([0xe8ffe0, 0x5ecc3a, 0x1a6b18], 1.0, 200),
    shake: SHAKE_LIGHT,
    pathBeam: pathGlow([0xe8ffe0, 0x5ecc3a, 0x1a6b18], 'smooth', 8),
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
    windup: windupGather([0xf0fff4, 0x7effb0, 0x2a9b6a], 1.0, 220),
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
  /**
   * 惊扰蜂群：蜂团分头扑向每个敌人，落点炸开一圈虫云。
   *
   * 原先弹体是 `images/fx/proj_bees.png` **一张静图**，绕目标飞三圈。两处毛病：
   * 1. 单图运动。群体的信息量在个体的相对扰动里，而那正是单图丢掉的东西——
   *    和剑士从前拿一张剑的抠图沿弧线钉下去是同一种毛病。现在是 6 帧循环扰动。
   * 2. 蜜蜂**倒着飞**。`vfxProjectile` 从前写的是 `laps > 0 || !def.noRotate`，
   *    绕圈时强制跟着切线转、`noRotate` 被无条件覆盖，而绕圈 heading 每圈扫满 360°，
   *    三圈就是翻三个滚。这是那句「很奇怪」的主因，光换多帧治不好。
   *
   * 同时把 `temp_gl_swarm` 这张图集救活了。它是**为这一招生的**（九帧，蜜蜂从一点
   * 炸开成一圈离散虫影，正是 `discAoE` 该有的样子），生完之后配方改用了飞行弹体，
   * 于是它登记在 animSets 里、占着下载量、屏幕上从不出现。
   * 现在飞行段用蜂团、命中段用这圈虫云，两个部件各归其位。
   */
  temp_gl_swarm: {
    windup: windupGather([0xfff0c0, 0xffb020, 0xc45a00], 1.1, 220),
    shake: SHAKE_LIGHT,
    travel: {
      spriteSet: 'swarm_bees',
      // 1.05 格 ≈ 角色身高的 1.14 倍。虫云比人宽是对的（画的是一簇虫不是一件物），
      // 但原先的 1.5 格是身高的 1.63 倍，一团蜜蜂比人还大一截
      cells: 1.05,
      speedPxPerSec: 300,
      minMs: 240,
      trail: trailSparks([0xfff0c0, 0xffb020, 0xc45a00]),
      ribbon: ribbonGlow([0xfff0c0, 0xffb020, 0xc45a00], 6),
      orbitLaps: 3,
      // 团状弹体转了反而读不出朝向，而蜜蜂有明确的上下
      noRotate: true,
    },
    travelPerTarget: true,
    impact: {
      set: 'temp_gl_swarm',
      anchor: 'target',
      cells: 2.6,
      mode: 'burst',
      playbackSpeed: 0.7,
      sparks: hitSparks([0xfff0c0, 0xffb020, 0xc45a00]),
    },
  },
  // ══════════════ 法师 · 赤焰 / 霜 ══════════════
  //
  // 奥莉：普攻=小火球砸中 / 炎弹=大火球飞过去炸 / 爆炎纹章=落到再铺炎环。
  // 芙洛：霜环=选点冰圈（图集待重做，先冰蓝收束 + 星爆占位）。

  /** 炎弹：手上先攒出一团火，再抛出去，落到才炸。普攻只是小球砸中，不播这张爆炸 */
  ember: {
    windup: windupGather(FIRE, 1.2, 260),
    travel: {
      // 同普攻：不叠漫画描边的 proj_ember 抠图，理由见 mage
      glowSet: 'ember_orb',
      cells: 2.05,
      speedPxPerSec: 190,
      minMs: 480,
      lingerMs: 160,
      trail: trailSparks(FIRE),
      ribbon: ribbonGlow(FIRE, 7),
    },
    impact: {
      set: 'ember_burst',
      anchor: 'target',
      cells: 2.1,
      mode: 'burst',
      playbackSpeed: 0.65,
      sparks: hitSparks(FIRE, 0.9),
    },
    shake: SHAKE_BLAST,
  },
  /**
   * 炎环：选点爆炸，impact 锚在落点而不是自己脚下。
   * `cells: 3` 盖住 blastRadius 1（直径 3 格）；横扫把它摊到半径 2 时会略小，
   * 但比锚在施法者身上、火圈开在后排空地要诚实。
   */
  flame_ring: {
    windup: windupImplode(FIRE, 1.4, 280),
    impact: {
      set: 'flame_ring',
      anchor: 'target',
      cells: 3,
      mode: 'burst',
      playbackSpeed: 0.7,
      sparks: skillSparks(FIRE),
    },
    shake: SHAKE_BLAST,
  },
  /**
   * 炎弹「爆炎」：火球还是那一发，落到之后改铺炎环。
   *
   * 飞行段原样保留——玩家认的是那颗火球；命中换成 `flame_ring` cells=3，正好盖住
   * 切比雪夫 1 的周围八格。这是纹章的画面兑现，不是另做一套火。
   */
  ember_bloom: {
    windup: windupGather(FIRE, 1.2, 260),
    travel: {
      glowSet: 'ember_orb',
      cells: 2.05,
      speedPxPerSec: 190,
      minMs: 480,
      lingerMs: 160,
      trail: trailSparks(FIRE),
      ribbon: ribbonGlow(FIRE, 7),
    },
    impact: {
      set: 'flame_ring',
      anchor: 'target',
      cells: 3,
      mode: 'burst',
      playbackSpeed: 0.7,
      sparks: skillSparks(FIRE),
    },
    shake: SHAKE_BLAST,
  },
  /**
   * 霜环：形状同旧炎环，冰系图集还没做。
   *
   * 占位只用冰蓝收束 + 代码星爆，不穿 `flame_ring` 火舌——那张图已经给奥莉的爆炎了。
   */
  frost_ring: {
    windup: windupImplode(FROST, 1.4, 280),
    castBurst: castBurst(FROST, 2.2),
    hitBurst: hitBurst(FROST, 2.4),
    shake: SHAKE_BLAST,
  },
  // ══════════════ 祭司 · 青绿 ══════════════
  //
  // 三招都是「施法者 → 友军」，所以路径是共同点，落点形态是区分点：
  // 圣疗=十字光 / 守护祷言=盾轮廓撑开 / 战场祝福=四向升光。
  //
  // 三招原先都把**同一张图**同时用在 `cast` 和 `impact` 上（圣疗两端都是十字、
  // 守护两端都是盾）。出手端和落点端长得一样，读起来是「同一个东西闪了两次」，
  // 而且白占掉了本该给节奏的那一拍。现在出手端换成代码画的收束蓄力：
  // 形态不再重复，而且真的多出了「攒 → 送出去」这个落差。
  //
  // 全员不震：治疗和加 buff 不是打击。这里震一下会读成「友军被打了」。

  /** 圣疗：光在手上聚起来，沿路径送过去，在友军身上撑成十字 */
  heal_touch: {
    windup: windupGather(MINT, 1.0, 240),
    pathBeam: pathGlow(MINT, 'smooth', 12, 'heal_flash'),
    impact: {
      set: 'heal_flash',
      anchor: 'target',
      cells: 2.0,
      mode: 'burst',
      playbackSpeed: 0.7,
      sparks: skillSparks(MINT),
    },
  },
  /** 守护祷言：盾轮廓连过去再撑开。不复用圣疗十字、也不复用普攻光球 */
  ward_prayer: {
    windup: windupGather(MINT, 1.1, 270),
    pathBeam: pathGlow(MINT, 'smooth', 11, 'ward_aegis'),
    impact: {
      set: 'ward_aegis',
      anchor: 'target',
      cells: 2.2,
      mode: 'burst',
      playbackSpeed: 0.7,
      sparks: skillSparks(MINT),
    },
  },
  /**
   * 战场祝福：**友军**脚下四向升光。
   *
   * 锚点从 `caster` 改成 `target`。这一招的形状是 `neighborPickAlly manhattan:1`——
   * 加攻加速落在**被点的那个队友**身上，可光柱却从施法者脚下升起来。
   * 玩家点了一个人，光在另一个人身上亮，只能靠读飘字才知道谁吃到了 buff。
   * 顺手补上和另外两招同口径的连线：祭司这三招的共同点就是那条光路。
   */
  field_bless: {
    windup: windupGather(MINT, 1.15, 280),
    pathBeam: pathGlow(MINT, 'smooth', 11, 'bless_rays'),
    impact: {
      set: 'bless_rays',
      anchor: 'target',
      cells: 2.6,
      mode: 'burst',
      playbackSpeed: 0.72,
      sparks: skillSparks(MINT),
    },
  },
  /**
   * 盾墙震慑：同心六边环向外推。
   *
   * 和格隆同族的另外三招分工：普攻是单点星爆、震击是**贴地**裂纹、铁锤是落点重砸——
   * 三个都是「砸下去」。这一招是唯一一个「推开」，所以形态是向外扩张的环而不是落点爆，
   * 而且棱是直的（六边形）：圆环是祭司光环的形，有棱才读得出是盾。
   *
   * 环心留空是硬要求：施法者站在正中央，中心糊上光就看不见自己的单位在哪。
   */
  shield_wall: {
    windup: windupImplode(SILVER, 1.5, 300),
    impact: {
      set: 'shield_wall',
      anchor: 'caster',
      cells: 3.1,
      mode: 'burst',
      playbackSpeed: 0.85,
      sparks: skillSparks(SILVER),
    },
    shake: SHAKE_HEAVY,
  },
  /**
   * 破甲咒：菱形符印烙上去，停一拍，再从中间裂开。
   *
   * 这是**零伤害**技能，回放里连伤害数字都不飘。同族三招（箭星 / 贯穿 / 连射）全是命中闪，
   * 再配一个命中闪就等于「放了一发但什么都没发生」。所以形态换成**印记附着**，
   * 而「裂开」正好是破甲这个动词本身。
   *
   * `playbackSpeed` 压到 0.62（全库最慢）：零伤害技能最怕被当成放空，
   * 得让符印真的在敌人身上停住一会儿。
   */
  hex_mark: {
    windup: windupGather(CYAN, 1.2, 320),
    pathBeam: pathGlow(CYAN, 'jagged', 9),
    impact: {
      set: 'hex_mark',
      anchor: 'target',
      cells: 2.2,
      mode: 'burst',
      playbackSpeed: 0.62,
      sparks: skillSparks(CYAN),
    },
  },

  // ══════════════ 森林章临时技能 · 林绿 ══════════════
  //
  // 这四招原先**全都没有配方**，买到手放出来是 `displayKind` 的静态贴图。
  // 漏掉的原因和 `war_shout` 一样：只有「角色默认技能」被测试钉住了
  // （`vfxCatalog.test.ts` 那条「各职业的普攻和默认技能都有专属配方」），
  // 而商店卖的临时技能没人管。这一轮补上，并把守卫测试扩到「玩家拿得到的每一招」。
  //
  // 这四招现在各有专属图。原先是全部复用现成图集（当时的理由是「功能牌的美术预算该低于
  // 角色技能」），实际效果是：火把放出来是奥莉的炎环、绞缠是第一章缠足放大到 5 格、
  // 庇护和守林人共用祭司的圣光盾——**连它们俩之间都没分开**。
  // 「每章的专属第二技能」这个卖点，在屏幕上兑现成了别人的招。
  //
  // 四张图的形态刻意咬住四个不同的**动词**，而不是四个不同的色相：
  // 火把=点着（四簇离散火苗，不是环）、绞缠=收网（向内，全库唯一）、
  // 庇护=包裹（木甲片自下往上）、守林人=扎根（上下双段，唯一）。

  /**
   * 松脂火把：往四周点火。
   *
   * 不能是环。奥莉的炎环画的是一圈连续火墙**向外推**，而这一招的动作是
   * 「拿火把把四周的林地点着」——四团各自烧起来的火，中间是没着的。
   * 形状上的差别正好也是玩法上的差别：这一招改的是地形，不是打出一发伤害。
   * 中心必须留空，施法者站在那儿（`neighborAoE` 不含自己那一格，见 skillCatalog 的注释）。
   */
  temp_fo_torch: {
    windup: windupImplode(TORCH, 1.3, 260),
    impact: {
      set: 'temp_fo_torch',
      anchor: 'caster',
      cells: 3,
      mode: 'burst',
      // 0.62 倍速：点火要读成「烧起来了」，而不是「炸了一下」。
      // 九帧 18fps 拉到 800ms，比命中闪光长一倍多，因为它留下的是持续燃烧的地形
      playbackSpeed: 0.62,
      sparks: skillSparks(TORCH),
    },
    shake: SHAKE_LIGHT,
  },
  /**
   * 荆棘绞缠：正好 2 格外的一圈藤蔓向内收。
   *
   * 和「野草缠足」的分界不在锚点，在**方向**：缠足是贴身一格、原地缠住脚踝；
   * 这一招是从 2 格外**往里收网**，拦的是正在接近的那一波。
   * 全库只有这一张是向内收的，其余 AoE 一律向外扩——所以它一放就认得出来。
   * 藤上的尖刺是它和缠足那种细草叶的第二道分界。
   *
   * 和缠足一样走抠图：荆棘是木头，而深色木头在 additive 下显示不出来（暗部被烘成透明），
   * 只能画成亮绿，而亮绿在亮草地上看不见（实测 53% → 改抠图后 3.2%）。
   */
  temp_fo_thorn: {
    windup: windupImplode(BARK, 2.0, 300),
    impact: {
      set: 'temp_fo_thorn',
      anchor: 'caster',
      cells: 5,
      mode: 'burst',
      playbackSpeed: 0.68,
      sparks: skillSparks(BARK),
    },
    shake: SHAKE_LIGHT,
  },
  /**
   * 树皮庇护：木甲片自下往上包住友军。
   *
   * 和「守护祷言」是同一个动词（减伤），但**材质**不同：祭司那张是一层光罩下来，
   * 这一张是一片片带木纹的树皮长上来。同动词不同材质比同形状换色相好认得多——
   * 形状和材质永远比色相先被认出来。
   *
   * 走**抠图 + 普通混合**而不是黑底 additive：树皮不发光。这不只是写实的讲究——
   * additive 管线按亮度烘 alpha，暗部一律变透明，于是深色木头在 additive 下根本
   * 显示不出来，只能画成亮绿，而亮绿在亮草地上是看不见的（实测 63% 的像素与草地
   * 色差 <60）。改走抠图、让深色去和亮草地拉明度差之后是 0.9%。
   */
  temp_fo_bark: {
    windup: windupGather(BARK, 1.1, 260),
    pathBeam: pathGlow(BARK, 'smooth', 11),
    impact: {
      set: 'temp_fo_bark',
      anchor: 'target',
      // 这一招盖在**友军**身上，而「谁被保护了」是它唯一要传达的信息，
      // 所以不能挡人。additive 只加不减、天然挡不住人，改成普通混合后这条要自己保证。
      //
      // 试过用 `alpha` 和缩小尺寸去救，都不行：素材当时画的是一圈闭合的桶，
      // 前壁本身就比人高，缩到 0.95 格仍然糊住胸口（实测遮挡 73%）。
      // 真正的修法在美术侧——甲片改成只长在**左右两侧**、中间竖带留空，
      // 于是人从缝里露出来，遮挡 32%，而且「甲片从两侧夹上来」比一只桶更像护甲。
      // 中间留空还顺便和同章的守林人之姿分了轴：那张是上下留中带，这张是左右留中缝。
      cells: 1.9,
      mode: 'burst',
      playbackSpeed: 0.72,
      sparks: skillSparks(BARK),
    },
  },
  /**
   * 守林人之姿：脚下生根、头顶展冠。
   *
   * 和树皮庇护原先**共用同一张图**（连带祭司的守护祷言，三招一张），
   * 那是这一轮抓出来最糟的一处：同一章的两招连彼此都没分开。
   * 现在的分工是方向相反——庇护是向内包住别人，这一招是向外扎进地里。
   * 上下双段构图（根在下、冠在上、中间留空给自己的单位）是全库唯一的，
   * 而中间那条空带同时解决了「自身 buff 不能糊住自己」这个老问题。
   */
  temp_fo_warden: {
    windup: windupImplode(BARK, 1.4, 280),
    impact: {
      set: 'temp_fo_warden',
      anchor: 'caster',
      cells: 2.4,
      mode: 'burst',
      playbackSpeed: 0.7,
      sparks: skillSparks(BARK),
    },
  },

  // ══════════════ 要塞章临时技能 · 攻城土金 ══════════════

  /**
   * 撞城槌：一根包铁的木槌沿直线犁到底，沿途每个目标各挨一记钝击。
   *
   * 这一招原先三个部件全是借的，其中两处借错了对象：
   * 弹体是 `proj_spear`（一根**矛**——撞城槌不是刺的），
   * 尾迹是 `ember_wave`（**火系**素材，挂在攻城器械上完全不搭）。
   * 当时的理由是「把两个登记了却没人引用的死资产用起来」，那个理由本身是对的，
   * 但救活死资产不能靠把它塞进一个形态不符的招里——那只是把「看不见的浪费」
   * 换成「看得见的不搭」。`ember_wave` 现在退回待用状态（它只服务第四章）。
   *
   * 现在弹体是专门抠的 `prop_ram`：横向的槌身、三道铁箍、钝的槌头朝右。
   * 命中是 `temp_ft_ram`，钝力新月向前推 + 灰色石屑呈锥形飞散。
   *
   * `mode: 'aimed'` 而不是 `'burst'`：直线穿透的力是**有方向**的，
   * 命中图画的就是「往前推」，钉成朝右会让斜射的那一发力和箭道错开。
   * 这和法师普攻那次的教训不冲突——那次错在拿**弹体**当命中闪光（炸开没有方向），
   * 这次的命中图本身就是为「沿射线推」画的。
   */
  temp_ft_ram: {
    windup: windupGather(SIEGE, 1.4, 300),
    travel: {
      sprite: 'prop_ram',
      // 1.55 格 ≈ 角色身高的 1.7 倍。攻城槌是要几个人合抬的东西，比人长是对的，
      // 但槌身贴图本来就粗短（2.5:1），再放大就糊满整条走廊
      cells: 1.55,
      speedPxPerSec: 330,
      minMs: 280,
      lingerMs: 90,
      trail: trailSparks(SIEGE),
      ribbon: ribbonGlow(SIEGE, 9),
    },
    impact: {
      set: 'temp_ft_ram',
      anchor: 'target',
      cells: 2.1,
      mode: 'aimed',
      playbackSpeed: 0.8,
      sparks: hitSparks(SIEGE),
    },
    impactPerHit: true,
    shake: SHAKE_HEAVY,
  },
  /**
   * 压制号令：把一个敌人压下去。
   *
   * 原先借狂暴战吼的放射冲击环，方向正好是反的：**咆哮是向外的，压制是向下的**。
   * 现在是三重人字自上而下压 + 地面被压扁的一道弧。
   * 全库其余的招一律向外扩或向上长，只有这一张往下——所以「削攻击」这件事
   * 在屏幕上有了自己的读法，而不是又一个环。
   */
  temp_ft_suppress: {
    windup: windupGather(SIEGE, 1.1, 230),
    pathBeam: pathGlow(SIEGE, 'jagged', 10),
    impact: {
      set: 'temp_ft_suppress',
      anchor: 'target',
      cells: 2.2,
      mode: 'burst',
      playbackSpeed: 0.72,
      sparks: skillSparks(SIEGE),
    },
    shake: SHAKE_LIGHT,
  },
  /**
   * 攻城战旗：一面旗插在友军身边。
   *
   * 原先借祭司「战场祝福」的四向光。这一招走**号角那条配方**——
   * 玩家说号角有特点，特点来自那支看得见的号，不是它那圈光环。
   * 所以战旗也用抠图道具：旗杆插地、旗面往右展开、燕尾撕口。
   * 一个能叫出名字的东西比一团抽象的光好认得多，而且它和技能名严丝合缝。
   *
   * 只有 `propBurst` 没有 `impact`，和号角一样：道具本身就是全部的信息量，
   * 再叠一层环光只会把旗面糊住。
   */
  temp_ft_banner: {
    windup: windupGather(SIEGE, 1.15, 280),
    pathBeam: pathGlow(SIEGE, 'smooth', 11),
    propBurst: {
      sprite: 'prop_banner',
      anchor: 'target',
      cells: 1.5,
      scaleFrom: 0.5,
      scaleTo: 1.5,
      durationMs: 1000,
      // 旗是**实体**，不能走 additive：旗面是布，additive 会把它烧成一片透光的橙。
      // 号角走 add 是因为那张图本身就是黑底描线的发光轮廓，两者素材路线不同
      yOffsetCells: -0.7,
      sparks: skillSparks(SIEGE),
    },
  },
  /**
   * 飞爪钩索：钩爪甩出去咬住，绳索一绷把自己拽过去。
   *
   * 原先借骑兵冲锋的光环，理由是「同一件事（这个人变快了）复用同一张图」。
   * 那个理由经不起看：冲锋光环是**被动**触发的一层贴身辉光，
   * 而这一招是玩家主动花钱买、专门用来兑现「闸门开的那一刻」的时机牌，
   * 结果放出来和骑兵走路时的光一模一样。
   *
   * 现在是全库唯一一条**绳索**：钩爪往右上飞、绳子先松后绷直、绷紧那两帧沿绳
   * 打出回拉的人字纹。加速这件事由「绷紧」来表达，比一圈光环具体得多。
   */
  temp_ft_grapple: {
    windup: windupGather(SIEGE, 1.0, 200),
    impact: {
      set: 'temp_ft_grapple',
      anchor: 'caster',
      cells: 2.6,
      mode: 'burst',
      playbackSpeed: 0.85,
      sparks: skillSparks(SIEGE),
    },
  },

  /**
   * 战吼（通用，商店临时槽在卖）：环形扩散 + 群体削攻。
   *
   * 原先**没有配方**——它是 `reserved` 技能，所以从没进过任何角色的可学列表，
   * 但它照样在二至五章的商店里作为临时技能出售，买到手放出来就是一张静态贴图。
   * 「暂时没有主人」不等于「玩家碰不到」，这是漏掉它的原因。
   *
   * 直接复用 `roar`：它讲的就是「一声吼扩散出去」，和 Boss 的狂暴战吼同形同源，
   * 靠色相区分（这里偏暖白，Boss 是血红）。这不违反 §4.4——形态不能重复说的是
   * 「两招不同的招式不要长得一样」，而这两招本来就是同一件事。
   */
  war_shout: {
    windup: windupImplode([0xfff4e0, 0xffb85a, 0xc06a10], 1.5, 280),
    impact: {
      set: 'roar',
      anchor: 'caster',
      cells: 3,
      mode: 'burst',
      playbackSpeed: 0.72,
      sparks: skillSparks([0xfff4e0, 0xffb85a, 0xc06a10]),
    },
    shake: SHAKE_BLAST,
  },
  // 牧野号角：头顶号角光效放大淡出（additive，不是写实道具）
  /**
   * 冲锋号角：只有起手 + 一支越举越大的号，**故意没有命中闪**。
   *
   * 玩家点名说这一招「比较有特点」，而特点全部来自 `prop_horn` 那支看得见的号：
   * 一个能叫出名字的东西比一团抽象的光好认得多，也天然和技能名对得上。
   * 别再给它补环光——那正好是这一轮要消灭的同质零件。
   *
   * 曾经有一套 9 帧 `temp_gl_horn` 图集登记在册，但没有任何配方字段引用它，
   * 白占 60KB 下载、屏幕上从没画过（是 `vfxGrassContrast` 那条守卫抓出来的）。
   * 已摘掉登记，源图留在 `art/vfx-runs/temp_gl_horn/`。
   */
  temp_gl_horn: {
    windup: windupImplode([0xfff0c8, 0xffc040, 0xd47800], 1.3, 260),
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
/**
 * 中毒命中叠层：技能自己的斩 / 箭 / 火球照播，挨毒的那个身上再爆一团紫雾。
 *
 * 不写进各招配方，是因为毒来自词条（淬毒、贯钉、霜噬），配方是静态的。
 * 回放层看 `SkillHit.poisoned`，有就叠这一下。
 */
export const POISON_HIT_VFX: FlashDef = {
  set: 'poison_burst',
  anchor: 'target',
  cells: 2.35,
  mode: 'burst',
  playbackSpeed: 0.7,
  sparks: hitSparks(POISON),
};

export const CHARGE_VFX: VfxRecipe = {
  cast: {
    set: 'charge_aura',
    anchor: 'caster',
    cells: 2.3,
    mode: 'burst',
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
  if (recipe.executeImpact) ids.push(recipe.executeImpact.set);
  if (recipe.splashImpact) ids.push(recipe.splashImpact.set);
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
