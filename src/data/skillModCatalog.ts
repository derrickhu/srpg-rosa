import type {
  SkillCastAllyEffect,
  SkillCastFoeEffect,
  SkillCastSelfEffect,
  SkillSpec,
} from './skillCatalog';
import { UNIT_DEFS } from './unitDefs';

/**
 * 技能词条：局内三选一拿到的强化，直接改写「已经带着的技能」。
 *
 * 为什么不是独立的加成表，而是**改写技能规格**：所有技能结算（伤害、范围、冷却、
 * 附带效果）都只读一个 `SkillSpec`，所以只要在施放前把词条折进规格里，
 * 结算代码一行都不用改，也不会出现「某个技能忘了应用词条」这种只在特定职业上
 * 复现的漏洞。同一个套路见 `battle/effectiveUnit.ts`。
 *
 * 词条存档时按**角色**挂载（`run.skillMods[rosterId]`），施放前才折进那一刻带着的
 * **主技能**：攒了一路的加成不会因为中途换招而清零。展示时反过来说人话——
 * 部署面板把词条列在技能旁边，玩家读到的仍然是「旋风斩附带中毒」。
 *
 * ## 只强化主技能
 *
 * 临时技能（局内商店买的第二槽）**不吃词条**，见 `unitSkillSpec`。
 *
 * 早先是两槽都吃的，理由是「词条挂在人身上，这个人的技能都更强了」。破在展示上：
 * 三选一卡面只画得下一招，于是卡上写「惊扰蜂群 · 锋锐」，而实际吃到那 25% 的是
 * 主技能和临时技能两招——卡面在说一件和结算不一样的事。收敛到主技能之后，
 * 卡面画的那一招就是唯一被改的那一招，作用范围不需要额外一行字解释。
 *
 * 附带的好处是投入不被分摊：主技能始终是攒词条的去处，临时技能怎么买都变不成主力。
 *
 * ## 两层词条
 *
 * - **普通词条**（`scope.kind === 'generic'`）：任何过得了 `fits` 的技能都可能出。
 *   负责「每局都能攒到点什么」的下限。
 * - **专属词条**（`scope.kind === 'exclusive'`）：只在指定技能上出现，而且**只有一层**。
 *   它是质变而不是数值：破阵斩的「破军」把削攻从 4 抬到 10，重劈的「斩残」把它变成
 *   处决专家。玩家记住的构筑是这些，而不是「锋锐叠了三层」。
 *
 * 专属校验不写在每条 `fits` 里，而由目录统一合成进 `canApply`（见 `toDef`）。
 * 漏写一次的后果是「破军」跑到旋风斩上——那不是报错，是静默失衡。
 *
 * ## 什么技能吃什么词条
 *
 * 两道闸门，职责不能混：
 *
 * - **定位闸门**：`SkillSpec.role`（伤害 / 控制 / 辅助 / 被动）由技能作者声明，
 *   决定这一类词条**该不该出现**在它身上。输出向的七条（锋锐、汲取、溅射、处决、
 *   嗜血、不息、势不可挡）走 `isOutputSkill`，只投给 `role === 'damage'`。
 * - **机制闸门**：`isAoE` / `hasHeal` / `hasFoeDebuff` 这类结构谓词，决定挂上去
 *   **有没有东西可改**（给没有治疗的技能发「妙手」是死牌）。
 *
 * 只有机制闸门是不够的，这是踩过的坑：判断「是不是输出技能」曾经只有一句
 * `damage.kind !== 'none'`，而「惊扰蜂群」为了让飘字有东西可飘带了 8 点即时伤，
 * 于是被判成伤害技能，吃到「锋锐：伤害提升 25%」，把 8 抬成 10。
 * 定位是玩家读得出的东西，必须显式写，不能从字段结构反推。
 *
 * 反过来收得太紧会把候选池抽干，那个角色的三选一一路发药剂。下限由
 * `skillMods.test.ts` 守着（每个主槽技能至少 3 条）。「冲锋」正卡在线上——
 * 被动没有「施放」这个挂载点，一切挂在施放上的词条对它都是死牌。
 *
 * ## 加一条词条要做什么
 *
 * 1. 在 `GENERIC_SEEDS` 或 `EXCLUSIVE_SEEDS` 里加一条。**普通词条要配一张自己的
 *    `mod_*` 图标**（不许和别的普通词条共用，由 `skillMods.test.ts` 守着）；
 *    专属词条不写 `icon`，统一走 `EXCLUSIVE_ICON` 徽记。
 * 2. 只能读写 `SkillSpec` 上已有的字段。要新效果就先给 `SkillSpec` 加**通用**字段
 *    并在引擎实现（如 `executeBonus` / `splashRatio`），不要在词条里写特判。
 * 3. 输出向的效果要过 `isOutputSkill`，别只写 `isDamaging`。
 * 4. 新**主槽**技能必须配至少一条专属词条，由 `skillMods.test.ts` 守着。
 *    只进临时槽的技能（`temp_gl_*`）**不要**配专属词条：词条只强化主技能，
 *    那种内容连候选池都进不去，等于写了发不出来的牌。
 */
export type SkillModRarity = 'common' | 'rare' | 'epic';

/** 词条归属：普通词条进公共池，专属词条只在指定技能上出现且只生效于它 */
export type SkillModScope =
  | { kind: 'generic' }
  | { kind: 'exclusive'; skillIds: readonly string[] };

export interface SkillModDef {
  id: string;
  name: string;
  rarity: SkillModRarity;
  scope: SkillModScope;
  /**
   * 角色等级达到多少才可能抽到它（见 `ProgressManager.lootCandidatesFor`）。
   *
   * **只对专属纹章有意义。** 通用纹章恒为 1：它们按技能类型进池，不跟角色等级绑。
   * 不升级的人三选一里仍然有锋锐、淬毒这些；升级打开的是「这一招自己的招牌强化」。
   * 仍然是 run 级——解锁的是「能不能进三选一」，不是永久拥有。
   */
  minLevel: number;
  /** 卡片图标资源 key，见 `core/assetBundles` */
  icon: string;
  /**
   * 挂在这条技能上有没有意义。**已包含专属校验**，所以抽卡池、折算、界面
   * 三处都问这一个函数就够了。
   */
  canApply(spec: SkillSpec): boolean;
  /** 第 `stacks` 层时的描述，用于卡片正文与技能说明 */
  describe(stacks: number): string;
  /** 把 `stacks` 层的效果折进技能规格 */
  apply(spec: SkillSpec, stacks: number): SkillSpec;
  maxStacks: number;
}

/**
 * 目录里声明用的形态。和 `SkillModDef` 的区别只有两点：
 * `fits` 只管机制适用性（专属技能 id 写在 `only` 里由目录合成），`only` 可省。
 */
interface ModSeed {
  id: string;
  name: string;
  rarity: SkillModRarity;
  /** 普通词条必填，一条一张；专属词条留空，由 `toDef` 填 `EXCLUSIVE_ICON` */
  icon?: string;
  maxStacks: number;
  /** 只在这些技能上出现；缺省 = 普通词条 */
  only?: readonly string[];
  /** 覆盖自动档位。通用纹章不用写（恒为 1）；专属一般也不写，由 `exclusiveUnlockLevel` 错开 */
  minLevel?: number;
  fits(spec: SkillSpec): boolean;
  describe(stacks: number): string;
  apply(spec: SkillSpec, stacks: number): SkillSpec;
}

/**
 * 专属纹章的解锁台阶。第一条放在 2 级：升一级就能进三选一，养成立刻有感觉。
 * 后面隔 4 级一条。第四档 14 只给专属超过三条的招（岚骑），避免两条挤在同一级。
 */
const EXCLUSIVE_UNLOCK_STEPS = [2, 6, 10, 14] as const;

function exclusiveUnlockLevels(seeds: readonly ModSeed[]): Map<string, number> {
  const rank: Record<SkillModRarity, number> = { common: 0, rare: 1, epic: 2 };
  const bySkill = new Map<string, ModSeed[]>();
  for (const seed of seeds) {
    if (!seed.only) continue;
    for (const skillId of seed.only) {
      const list = bySkill.get(skillId) ?? [];
      list.push(seed);
      bySkill.set(skillId, list);
    }
  }
  const out = new Map<string, number>();
  for (const list of bySkill.values()) {
    const ordered = [...list].sort((a, b) =>
      rank[a.rarity] - rank[b.rarity] || seeds.indexOf(a) - seeds.indexOf(b),
    );
    ordered.forEach((seed, i) => {
      const lv = EXCLUSIVE_UNLOCK_STEPS[Math.min(i, EXCLUSIVE_UNLOCK_STEPS.length - 1)]!;
      out.set(seed.id, Math.min(out.get(seed.id) ?? lv, lv));
    });
  }
  return out;
}

/**
 * 全部专属词条共用的徽记。
 *
 * 不给专属词条画各自的图，是因为**卡面正中已经是那一招的技能图标了**——再配一张
 * 专属小图等于同一件事说两遍，而且 26px 上根本分不清十八张。徽记只回答
 * 「这是招牌强化」，「是哪一招的」交给旁边的技能大图。
 *
 * 算术上也只有这样才扛得住扩展：专属是一招一条，技能只会越加越多，一条一图意味着
 * 每加一个技能就欠一张新图。现在的成本是**新技能 0 张，新普通词条 1 张**。
 * 规则见《美术风格圣经》§6.1。
 */
const EXCLUSIVE_ICON = 'mod_signature';

// ── 适用性判定 ────────────────────────────────────────────────────────────

/** 这条技能会造成伤害吗。**机制**前提，不是定位判断 */
function isDamaging(spec: SkillSpec): boolean {
  return spec.damage.kind !== 'none';
}

/**
 * 输出向词条（锋锐 / 处决 / 溅射 / 汲取 / 嗜血 / 不息 / 势不可挡）的投放闸门。
 *
 * 两个条件都要：`role === 'damage'` 是**作者声明的定位**，`isDamaging` 是**机制前提**。
 * 只看 `isDamaging` 就是之前那个 bug——「惊扰蜂群」带 8 点飘字用的伤害，
 * 于是吃到「锋锐：技能伤害提升 25%」，把 8 抬成 10；只看 role 则挡不住
 * 「role 填成 damage 但忘了配伤害」这种数据错（那种由 `skillMods.test.ts` 另外守）。
 */
function isOutputSkill(spec: SkillSpec): boolean {
  return spec.role === 'damage' && isDamaging(spec);
}

/**
 * 会「施放」吗。被动（冲锋）永远不走 `cast*`，所以一切挂在施放上的效果
 * （自身 buff、附带 debuff）对它都是死牌——发出去只能被弃掉。
 */
function isActive(spec: SkillSpec): boolean {
  return spec.timing !== 'passive';
}

/** 环形/圆形/方形/选点 AoE（「横扫」类词条只对这几种有意义） */
function isAoE(spec: SkillSpec): boolean {
  return (
    spec.shape.type === 'neighborAoE' ||
    spec.shape.type === 'discAoE' ||
    spec.shape.type === 'squareAoE' ||
    spec.shape.type === 'groundPickAoE'
  );
}

/** 点名打一个敌人的形状（「溅射」把它变成小范围） */
function isSingleFoePick(spec: SkillSpec): boolean {
  return spec.shape.type === 'neighborPickFoe';
}

/** 近战三职业的专属技（嘲讽类词条只在他们身上是正收益） */
function isMeleeSkill(spec: SkillSpec): boolean {
  const p = spec.exclusiveProfession;
  return p === 'sword' || p === 'shield' || p === 'cavalry';
}

function hasFoeDebuff(spec: SkillSpec): boolean {
  return (spec.onCastFoeEffects?.length ?? 0) > 0;
}

function hasAllyBuff(spec: SkillSpec): boolean {
  return (spec.onCastAllyEffects ?? []).some((e) => e.kind !== 'heal');
}

function hasHeal(spec: SkillSpec): boolean {
  return (spec.onCastAllyEffects ?? []).some((e) => e.kind === 'heal');
}

function hasSelfTaunt(spec: SkillSpec): boolean {
  return (spec.onCastSelfEffects ?? []).some((e) => e.kind === 'taunt');
}

/**
 * 这一招的主人天生就在拉仇恨吗——即嘲讽类词条挂上去会不会是**空词条**。
 *
 * 盾卫 `strike.taunt` 恒为 true，而 `effectiveUnitDef` 算的是
 * `strikeTaunt || timedTauntActive`：给盾卫加嘲讽 buff，or 一下还是 true，什么都没变。
 * 卡面照样写「施放后吸引敌人攻击」，玩家没有任何办法看出这条是空的。
 *
 * 只拦**职业专属**技能。通用技能（如「牧野号角」）盾卫带着也是空转，
 * 但同一招剑士弓手带就是真效果，不能因为盾卫而对所有人关掉。
 */
function isInnateTaunter(spec: SkillSpec): boolean {
  const p = spec.exclusiveProfession;
  return p !== null && UNIT_DEFS[p].strike.taunt;
}

/** 命中后会推开谁（突进 / 击退）。「加大位移距离」类纹章的挂载前提 */
function hasDisplace(spec: SkillSpec): boolean {
  return spec.onHitDisplace !== undefined;
}

/** 有射程上限的射线技能。「加射程」类纹章的挂载前提 */
function hasRayRange(spec: SkillSpec): boolean {
  return spec.shape.type === 'lineBestRayAllFoes' && spec.shape.range !== undefined;
}

// ── 规格改写 ──────────────────────────────────────────────────────────────

/** 按倍率放大技能伤害；`flat` / `percentTargetMaxHp` 也一并支持 */
function scaleDamage(spec: SkillSpec, mul: number): SkillSpec {
  const d = spec.damage;
  switch (d.kind) {
    case 'scaledAtk':
      return { ...spec, damage: { ...d, atkMul: d.atkMul * mul } };
    case 'flat':
      return { ...spec, damage: { ...d, amount: Math.round(d.amount * mul) } };
    case 'percentTargetMaxHp':
      return { ...spec, damage: { ...d, ratio: d.ratio * mul } };
    default:
      return spec;
  }
}

/** 把环形 AoE 摊成覆盖到 `radius` 的整片区域 */
function widenAoE(spec: SkillSpec, plus: number): SkillSpec {
  const s = spec.shape;
  if (s.type === 'neighborAoE') {
    return { ...spec, shape: { type: 'discAoE', radius: s.manhattan + plus } };
  }
  if (s.type === 'discAoE') {
    return { ...spec, shape: { type: 'discAoE', radius: s.radius + plus } };
  }
  /*
   * 方形摊开后退回**曼哈顿**整片圆，而不是更大的方形：方形 radius 2 是 24 格，
   * 半张图，「横扫」不该是这个量级。曼哈顿 radius 2（12 格）完整包含方形 radius 1，
   * 所以这仍是严格扩大，而且和旋风斩改形状之前吃「横扫」的结果一模一样——
   * 换尺子只该修好斜角，不该顺手动到词条的平衡。
   */
  if (s.type === 'squareAoE') {
    return { ...spec, shape: { type: 'discAoE', radius: s.radius + plus } };
  }
  if (s.type === 'groundPickAoE') {
    return { ...spec, shape: { ...s, blastRadius: s.blastRadius + plus } };
  }
  return spec;
}

function cutCooldown(spec: SkillSpec, n: number): SkillSpec {
  return { ...spec, cooldown: Math.max(1, spec.cooldown - n) };
}

function addLifesteal(spec: SkillSpec, ratio: number): SkillSpec {
  return { ...spec, lifestealRatio: (spec.lifestealRatio ?? 0) + ratio };
}

function addSplash(spec: SkillSpec, ratio: number, ring: 'ortho' | 'square' = 'ortho'): SkillSpec {
  return {
    ...spec,
    splashRatio: (spec.splashRatio ?? 0) + ratio,
    splashChebyshev: spec.splashChebyshev || ring === 'square',
  };
}

/** 处决线取更宽的那条，倍率相乘（两条处决词条撞在一起时才有的情况） */
function withExecute(spec: SkillSpec, belowHpRatio: number, mul: number): SkillSpec {
  const cur = spec.executeBonus;
  return {
    ...spec,
    executeBonus: cur
      ? { belowHpRatio: Math.max(cur.belowHpRatio, belowHpRatio), mul: cur.mul * mul }
      : { belowHpRatio, mul },
  };
}

/**
 * 同类效果**相加**地并进去。
 *
 * 不能简单 push：引擎侧 `applySkillCast*Effects` 对同类效果是「新盖旧」，
 * 所以给本来就带「攻 -4」的破阵斩再 push 一条「攻 -4」，结果是 -4 而不是 -8——
 * 词条看着挂上了却毫无作用，这种失效在战斗里根本看不出来。
 */
function mergeFoe(spec: SkillSpec, e: SkillCastFoeEffect): SkillSpec {
  const list = spec.onCastFoeEffects ?? [];
  let merged = e;
  for (const x of list) {
    if (x.kind === 'atkDown' && e.kind === 'atkDown') {
      merged = { kind: 'atkDown', subAtk: x.subAtk + e.subAtk, rounds: Math.max(x.rounds, e.rounds) };
    } else if (x.kind === 'spdDown' && e.kind === 'spdDown') {
      merged = { kind: 'spdDown', subSpd: x.subSpd + e.subSpd, rounds: Math.max(x.rounds, e.rounds) };
    } else if (x.kind === 'poison' && e.kind === 'poison') {
      merged = {
        kind: 'poison',
        dmgPerRound: x.dmgPerRound + e.dmgPerRound,
        rounds: Math.max(x.rounds, e.rounds),
        // 淬毒叠到霜噬上时按中毒算：描述和紫雾都跟「中毒」走
        theme: x.theme === 'frost' && e.theme === 'frost' ? 'frost' : undefined,
      };
    }
  }
  return { ...spec, onCastFoeEffects: [...list.filter((x) => x.kind !== e.kind), merged] };
}

function mergeSelf(spec: SkillSpec, e: SkillCastSelfEffect): SkillSpec {
  const list = spec.onCastSelfEffects ?? [];
  let merged = e;
  for (const x of list) {
    if (x.kind === 'atkBonus' && e.kind === 'atkBonus') {
      merged = { kind: 'atkBonus', addAtk: x.addAtk + e.addAtk, rounds: Math.max(x.rounds, e.rounds) };
    } else if (x.kind === 'spdBonus' && e.kind === 'spdBonus') {
      merged = { kind: 'spdBonus', addSpd: x.addSpd + e.addSpd, rounds: Math.max(x.rounds, e.rounds) };
    } else if (x.kind === 'taunt' && e.kind === 'taunt') {
      merged = { kind: 'taunt', rounds: Math.max(x.rounds, e.rounds) };
    }
  }
  return { ...spec, onCastSelfEffects: [...list.filter((x) => x.kind !== e.kind), merged] };
}

function mergeAlly(spec: SkillSpec, e: SkillCastAllyEffect): SkillSpec {
  const list = spec.onCastAllyEffects ?? [];
  let merged = e;
  for (const x of list) {
    if (x.kind === 'atkBonus' && e.kind === 'atkBonus') {
      merged = { kind: 'atkBonus', addAtk: x.addAtk + e.addAtk, rounds: Math.max(x.rounds, e.rounds) };
    } else if (x.kind === 'spdBonus' && e.kind === 'spdBonus') {
      merged = { kind: 'spdBonus', addSpd: x.addSpd + e.addSpd, rounds: Math.max(x.rounds, e.rounds) };
    } else if (x.kind === 'heal' && e.kind === 'heal') {
      merged = { kind: 'heal', amount: x.amount + e.amount };
    }
  }
  return { ...spec, onCastAllyEffects: [...list.filter((x) => x.kind !== e.kind), merged] };
}

/** 直接改写同类效果（专属词条的「质变」用这个，不是相加） */
function setFoe(spec: SkillSpec, e: SkillCastFoeEffect): SkillSpec {
  const rest = (spec.onCastFoeEffects ?? []).filter((x) => x.kind !== e.kind);
  return { ...spec, onCastFoeEffects: [...rest, e] };
}

function setSelf(spec: SkillSpec, e: SkillCastSelfEffect): SkillSpec {
  const rest = (spec.onCastSelfEffects ?? []).filter((x) => x.kind !== e.kind);
  return { ...spec, onCastSelfEffects: [...rest, e] };
}

function setAlly(spec: SkillSpec, e: SkillCastAllyEffect): SkillSpec {
  const rest = (spec.onCastAllyEffects ?? []).filter((x) => x.kind !== e.kind);
  return { ...spec, onCastAllyEffects: [...rest, e] };
}

/** 所有敌方减益延长 `plus` 回合 */
function extendFoeRounds(spec: SkillSpec, plus: number): SkillSpec {
  const list = spec.onCastFoeEffects;
  if (!list?.length) return spec;
  return { ...spec, onCastFoeEffects: list.map((e) => ({ ...e, rounds: e.rounds + plus })) };
}

/** 友方增益数值 +`add`、持续 +`plusRounds`（即时治疗不受影响，它没有回合数） */
function boostAllyBuff(spec: SkillSpec, add: number, plusRounds: number): SkillSpec {
  const list = spec.onCastAllyEffects;
  if (!list?.length) return spec;
  return {
    ...spec,
    onCastAllyEffects: list.map((e) => {
      if (e.kind === 'atkBonus') {
        return { kind: 'atkBonus', addAtk: e.addAtk + add, rounds: e.rounds + plusRounds };
      }
      if (e.kind === 'spdBonus') {
        return { kind: 'spdBonus', addSpd: e.addSpd + Math.max(1, Math.round(add / 3)), rounds: e.rounds + plusRounds };
      }
      return e;
    }),
  };
}

/** 治疗量 +`plus` */
function boostHeal(spec: SkillSpec, plus: number): SkillSpec {
  const list = spec.onCastAllyEffects;
  if (!list?.length) return spec;
  return {
    ...spec,
    onCastAllyEffects: list.map((e) =>
      e.kind === 'heal' ? { kind: 'heal', amount: e.amount + plus } : e,
    ),
  };
}

// ── 普通词条 ──────────────────────────────────────────────────────────────

/**
 * 顺序有讲究：**先加效果，后调整已有效果**。
 *
 * 「顽疾」把减益延长 1 回合、「恩泽」抬高友方增益，它们读的是**这一步之前**攒出来的
 * 规格。放在「淬毒」前面的话，同时拿到两条时毒的持续不会被延长——玩家从描述上
 * 完全推不出这个结果。所以这三条改写型的词条一律排在最后。
 */
const GENERIC_SEEDS: readonly ModSeed[] = [
  {
    id: 'sharpen',
    name: '锋锐',
    rarity: 'common',
    icon: 'mod_sharpen',
    maxStacks: 3,
    fits: isOutputSkill,
    describe: (n) => `技能伤害提升 ${25 * n}%`,
    apply: (spec, n) => scaleDamage(spec, 1 + 0.25 * n),
  },
  {
    id: 'quick_cast',
    name: '迅捷',
    rarity: 'common',
    icon: 'mod_quick',
    maxStacks: 2,
    // 冷却 1 的技能已经几乎每回合能放，再减没有可感知的变化。
    fits: (spec) => spec.cooldown >= 2,
    describe: (n) => `技能冷却缩短 ${n} 回合`,
    apply: (spec, n) => cutCooldown(spec, n),
  },
  {
    id: 'rout',
    name: '挫锐',
    rarity: 'common',
    icon: 'mod_rout',
    maxStacks: 2,
    fits: (spec) => isDamaging(spec) && isActive(spec),
    describe: (n) => `命中后目标攻击 -${4 * n}，持续 2 回合`,
    apply: (spec, n) => mergeFoe(spec, { kind: 'atkDown', subAtk: 4 * n, rounds: 2 }),
  },
  {
    id: 'hobble',
    name: '迟滞',
    rarity: 'common',
    icon: 'mod_hobble',
    maxStacks: 2,
    fits: (spec) => isDamaging(spec) && isActive(spec),
    describe: (n) => `命中后目标速度 -${2 * n}，持续 2 回合`,
    apply: (spec, n) => mergeFoe(spec, { kind: 'spdDown', subSpd: 2 * n, rounds: 2 }),
  },
  {
    id: 'guard_stance',
    name: '护阵',
    rarity: 'common',
    icon: 'mod_guard',
    maxStacks: 1,
    // 只给近战：嘲讽对弓手是把自己送到前排，那不是强化而是陷阱牌。
    // 再排掉已带嘲讽的、以及天生就在拉仇恨的（盾卫）——那两种挂上去是空词条。
    fits: (spec) =>
      isActive(spec) && isMeleeSkill(spec) && !hasSelfTaunt(spec) && !isInnateTaunter(spec),
    describe: () => '施放后吸引敌人攻击，持续 2 回合',
    apply: (spec) => mergeSelf(spec, { kind: 'taunt', rounds: 2 }),
  },
  {
    id: 'venom',
    name: '淬毒',
    rarity: 'rare',
    icon: 'mod_venom',
    maxStacks: 3,
    fits: (spec) => isDamaging(spec) && isActive(spec),
    describe: (n) => `命中后中毒，每回合 -${3 * n} 血，持续 2 回合`,
    apply: (spec, n) => mergeFoe(spec, { kind: 'poison', dmgPerRound: 3 * n, rounds: 2 }),
  },
  {
    id: 'siphon',
    name: '汲取',
    rarity: 'rare',
    icon: 'mod_siphon',
    maxStacks: 2,
    fits: isOutputSkill,
    describe: (n) => `技能伤害的 ${30 * n}% 回复自身`,
    apply: (spec, n) => addLifesteal(spec, 0.3 * n),
  },
  {
    id: 'battle_fury',
    name: '战意',
    rarity: 'rare',
    icon: 'mod_fury',
    maxStacks: 2,
    fits: isActive,
    describe: (n) => `施放后自身攻击 +${5 * n}，持续 2 回合`,
    apply: (spec, n) => mergeSelf(spec, { kind: 'atkBonus', addAtk: 5 * n, rounds: 2 }),
  },
  {
    id: 'haste',
    name: '疾风',
    rarity: 'rare',
    icon: 'mod_haste',
    maxStacks: 2,
    fits: isActive,
    describe: (n) => `施放后自身速度 +${2 * n}，持续 2 回合`,
    apply: (spec, n) => mergeSelf(spec, { kind: 'spdBonus', addSpd: 2 * n, rounds: 2 }),
  },
  {
    id: 'wide_swing',
    name: '横扫',
    rarity: 'rare',
    icon: 'mod_wide',
    maxStacks: 1,
    fits: isAoE,
    describe: () => '作用范围扩大到周围 2 格',
    apply: (spec) => widenAoE(spec, 1),
  },
  {
    id: 'splash',
    name: '溅射',
    rarity: 'rare',
    icon: 'mod_splash',
    maxStacks: 2,
    fits: (spec) => isSingleFoePick(spec) && isOutputSkill(spec),
    describe: (n) => `对目标周围的敌人造成 ${35 * n}% 伤害`,
    apply: (spec, n) => addSplash(spec, 0.35 * n),
  },
  {
    id: 'execute',
    name: '处决',
    rarity: 'rare',
    icon: 'mod_execute',
    maxStacks: 2,
    fits: isOutputSkill,
    describe: (n) => `目标血量低于 40% 时，伤害提升 ${35 * n}%`,
    apply: (spec, n) => withExecute(spec, 0.4, 1 + 0.35 * n),
  },
  {
    id: 'overwhelm',
    name: '势不可挡',
    rarity: 'epic',
    icon: 'mod_overwhelm',
    maxStacks: 1,
    fits: (spec) => isAoE(spec) && isOutputSkill(spec),
    describe: () => '范围扩大到 2 格，且伤害提升 40%',
    apply: (spec) => scaleDamage(widenAoE(spec, 1), 1.4),
  },
  {
    id: 'bloodthirst',
    name: '嗜血',
    rarity: 'epic',
    icon: 'mod_bloodthirst',
    maxStacks: 1,
    fits: isOutputSkill,
    describe: () => '伤害提升 30%，并回复其中 40%',
    apply: (spec) => addLifesteal(scaleDamage(spec, 1.3), 0.4),
  },
  {
    id: 'relentless',
    name: '不息',
    rarity: 'epic',
    icon: 'mod_relentless',
    maxStacks: 1,
    fits: (spec) => isOutputSkill(spec) && spec.cooldown >= 2,
    describe: () => '冷却缩短 1 回合，且伤害提升 25%',
    apply: (spec) => scaleDamage(cutCooldown(spec, 1), 1.25),
  },
  // ↓ 改写「已有效果」的三条，必须排在加效果的词条之后
  {
    id: 'lasting',
    name: '顽疾',
    rarity: 'common',
    icon: 'mod_lasting',
    maxStacks: 2,
    fits: (spec) => hasFoeDebuff(spec) && isActive(spec),
    describe: (n) => `技能施加的减益延长 ${n} 回合`,
    apply: (spec, n) => extendFoeRounds(spec, n),
  },
  {
    id: 'blessing',
    name: '恩泽',
    rarity: 'common',
    icon: 'mod_blessing',
    maxStacks: 2,
    fits: (spec) => hasAllyBuff(spec) && isActive(spec),
    describe: (n) => `给友方的增益数值 +${3 * n}，并延长 ${n} 回合`,
    apply: (spec, n) => boostAllyBuff(spec, 3 * n, n),
  },
  {
    id: 'mend',
    name: '妙手',
    rarity: 'common',
    icon: 'mod_mend',
    maxStacks: 2,
    fits: (spec) => hasHeal(spec) && isActive(spec),
    describe: (n) => `治疗量提升 ${8 * n}`,
    apply: (spec, n) => boostHeal(spec, 8 * n),
  },
];

// ── 专属词条 ──────────────────────────────────────────────────────────────

/**
 * 一招一条（或几条），`maxStacks` 一律 1。
 *
 * 专属词条的定位是**改变这招怎么用**，所以数值给得比普通词条狠，但不许叠：
 * 允许叠层的话它就只是一条数值更大的普通词条，玩家的构筑记忆又回到「叠满锋锐」。
 */
const EXCLUSIVE_SEEDS: readonly ModSeed[] = [
  {
    id: 'ex_whirl_momentum',
    name: '旋势',
    rarity: 'rare',
    maxStacks: 1,
    only: ['whirl'],
    fits: () => true,
    describe: () => '旋风斩：施放后自身攻击 +6（2 回合），并回复伤害的 25%',
    apply: (spec) => addLifesteal(mergeSelf(spec, { kind: 'atkBonus', addAtk: 6, rounds: 2 }), 0.25),
  },
  {
    id: 'ex_pierce_pin',
    name: '贯钉',
    rarity: 'rare',
    maxStacks: 1,
    only: ['pierce'],
    fits: () => true,
    describe: () => '穿透箭：线上敌人速度 -3，并中毒每回合 -4 血（2 回合）',
    apply: (spec) =>
      mergeFoe(mergeFoe(spec, { kind: 'spdDown', subSpd: 3, rounds: 2 }), {
        kind: 'poison',
        dmgPerRound: 4,
        rounds: 2,
      }),
  },
  /**
   * 射程这条线是穿透箭独有的成长维度。
   *
   * 它原本**没有上限**——一路射到出界，7×9 的棋盘上等于整行整列全覆盖，
   * 于是「希尔该站哪」这个弓手唯一的决策不存在。收到 5 格之后射程本身成了
   * 值得投资的东西：先花一条纹章买到 7 格，终局那条把上限整个拿掉，
   * 而拿掉的那一刻玩家能立刻感觉到棋盘变小了。
   */
  {
    id: 'ex_pierce_longshot',
    name: '远眺',
    rarity: 'rare',
    maxStacks: 1,
    only: ['pierce'],
    fits: hasRayRange,
    describe: () => '穿透箭：射程由 5 格延长到 7 格',
    apply: (spec) => ({ ...spec, shape: { type: 'lineBestRayAllFoes', range: 7 } }),
  },
  {
    id: 'ex_pierce_endless',
    name: '洞穿',
    rarity: 'epic',
    maxStacks: 1,
    only: ['pierce'],
    fits: hasRayRange,
    describe: () => '穿透箭：射程不再有上限，一路贯穿到墙或战场边缘',
    apply: (spec) => ({ ...spec, shape: { type: 'lineBestRayAllFoes' } }),
  },
  /**
   * 「冲锋」曾经是骑兵占着一个技能位的**被动技**：不施放、不选目标，只是把移动后的
   * 普攻打得更狠。作为一招它有个结构性毛病——被动没有「施放」这个挂载点，
   * 一切挂在施放上的纹章对它都是死牌，带它的角色三选一常年开天窗。
   *
   * 降成纹章之后两头都通了：岚骑有了一招真正的招牌技（长驱突刺），
   * 而冲锋回到它本来的样子——一个装上去就改变打法的强化。
   * 引擎侧零改动，`basicAttack` 读的本来就是过完纹章的主技能规格。
   */
  {
    id: 'ex_lance_charge',
    name: '冲锋',
    rarity: 'rare',
    maxStacks: 1,
    only: ['lance_thrust'],
    fits: () => true,
    describe: () => '长驱突刺：本回合移动过后，普攻伤害提升 35%',
    apply: (spec) => ({ ...spec, passiveBasicAttackMulIfMoved: 1.35 }),
  },
  /**
   * 践地必须排在冲锋**后面**：它是在冲锋的基础上再加一档。
   * `DEFS` 按数组顺序应用，两条都拿到时结果是 1.35 + 0.55；
   * 反过来的话冲锋的 `apply` 会把践地加的那 0.55 直接覆盖掉。
   */
  {
    id: 'ex_charge_trample',
    name: '践地',
    rarity: 'epic',
    maxStacks: 1,
    only: ['lance_thrust'],
    fits: () => true,
    describe: () => '长驱突刺：移动后的普攻伤害再提升 55%（需先有冲锋）',
    apply: (spec) => ({
      ...spec,
      passiveBasicAttackMulIfMoved: (spec.passiveBasicAttackMulIfMoved ?? 1) + 0.55,
    }),
  },
  {
    id: 'ex_lance_farcharge',
    name: '长驱',
    rarity: 'rare',
    maxStacks: 1,
    only: ['lance_thrust'],
    fits: hasDisplace,
    describe: () => '长驱突刺：突进距离改为穿到目标身后 3 格',
    apply: (spec) => ({
      ...spec,
      onHitDisplace: { who: 'self', cells: 3 },
    }),
  },
  {
    id: 'ex_bash_dread',
    name: '镇怖',
    rarity: 'rare',
    maxStacks: 1,
    only: ['bash'],
    fits: () => true,
    // 原本是「嘲讽延长到 4 回合 + 削攻」，而嘲讽那一半是**死效果**：
    // 震击是盾卫专属，盾卫 `strike.taunt` 恒为 true（见 `skillCatalog` 里 bash 的说明）。
    // 一条稀有词条有一半写在不生效的机制上，玩家读卡面时完全看不出来。
    // 改成加深减速。冷却不能收到 1：底招已经是 2 回合，减到 1 再配 2 回合减益
    // 等于盯谁锁谁，格隆的身份就从「拖慢」变成「永久关禁闭」。
    describe: () => '震击：减速改为 -4（2 回合）',
    apply: (spec) => setFoe(spec, { kind: 'spdDown', subSpd: 4, rounds: 2 }),
  },
  {
    id: 'ex_bash_hurl',
    name: '冲垒',
    rarity: 'epic',
    maxStacks: 1,
    only: ['bash'],
    fits: hasDisplace,
    describe: () => '震击：击退距离改为 3 格',
    apply: (spec) => ({ ...spec, onHitDisplace: { who: 'target', cells: 3 } }),
  },
  /**
   * 原本挂在「重劈」上。重劈一人一招之后转给了敌方剑兵，这条处决就跟着搬到
   * 雷恩现在的招牌旋风斩上——内容一个字没改，只是换了主人。
   * 挂在 AoE 上时处决是逐个目标判的（见 `hitModNote`），所以「一刀清掉一圈残血」
   * 这个读法照样成立，而且比在单体上更像雷恩会做的事。
   * 残血目标身上会再叠一记重劈的垂直劈裂（`cleave_slam`），刃环和斩杀分得开。
   */
  {
    id: 'ex_cleave_reap',
    name: '斩残',
    rarity: 'epic',
    maxStacks: 1,
    only: ['whirl'],
    fits: () => true,
    describe: () => '旋风斩：对血量低于 50% 的敌人，伤害提升 80%',
    apply: (spec) => withExecute(spec, 0.5, 1.8),
  },
  {
    id: 'ex_blade_rush_break',
    name: '破军',
    rarity: 'epic',
    maxStacks: 1,
    only: ['blade_rush'],
    fits: () => true,
    describe: () => '破阵斩：削攻改为 -10（3 回合），且伤害提升 35%',
    apply: (spec) => scaleDamage(setFoe(spec, { kind: 'atkDown', subAtk: 10, rounds: 3 }), 1.35),
  },
  /**
   * 邻格扬尘走配方的 splashImpact（践踏蹄印），见 vfxCatalog.lance_thrust。
   */
  {
    id: 'ex_lance_pierce',
    name: '贯枪',
    rarity: 'rare',
    maxStacks: 1,
    only: ['lance_thrust'],
    fits: () => true,
    describe: () => '长驱突刺：伤害提升 20%，并对目标周围造成 50% 伤害',
    apply: (spec) => addSplash(scaleDamage(spec, 1.2), 0.5),
  },
  {
    id: 'ex_shield_wall_bulwark',
    name: '铁壁',
    rarity: 'rare',
    maxStacks: 1,
    only: ['shield_wall'],
    fits: () => true,
    // 同样去掉了嘲讽那一段（盾卫专属技能的自嘲讽不生效），换成范围从环扩成整片区域：
    // 「铁壁」要的是站在人堆里同时压住所有人，扩范围比延长一个死 buff 贴切得多。
    describe: () => '盾墙震慑：范围扩大到 2 格，削攻改为 -8，自身攻击 +4',
    apply: (spec) =>
      mergeSelf(widenAoE(setFoe(spec, { kind: 'atkDown', subAtk: 8, rounds: 2 }), 2), {
        kind: 'atkBonus',
        addAtk: 4,
        rounds: 2,
      }),
  },
  /**
   * 原本挂在「铁锤」上。铁锤转给敌方重装之后搬到震击上，方向一致——
   * 盾卫打不死人，但能让被他盯上的那个既打不疼人也追不上人。
   * 用 `mergeFoe` 而不是 `setFoe`：震击自带 -2 速，直接改写会把它顶掉，
   * 结果是「装了削速纹章，速度惩罚反而只多了 1」。
   */
  {
    id: 'ex_hammer_bonebreak',
    name: '碎骨',
    rarity: 'rare',
    maxStacks: 1,
    only: ['bash'],
    fits: () => true,
    describe: () => '震击：额外使目标攻击 -6，且减速加深到 -5（2 回合）',
    apply: (spec) =>
      mergeFoe(setFoe(spec, { kind: 'atkDown', subAtk: 6, rounds: 2 }), {
        kind: 'spdDown',
        subSpd: 3,
        rounds: 2,
      }),
  },
  {
    id: 'ex_war_shout_dominate',
    name: '威压',
    rarity: 'rare',
    maxStacks: 1,
    only: ['war_shout'],
    fits: () => true,
    describe: () => '战吼：范围扩大到 2 格，且目标攻击 -5',
    apply: (spec) => mergeFoe(widenAoE(spec, 1), { kind: 'atkDown', subAtk: 5, rounds: 2 }),
  },
  {
    id: 'ex_hex_spread',
    name: '蔓延',
    rarity: 'epic',
    maxStacks: 1,
    only: ['hex_mark'],
    fits: () => true,
    describe: () => '破甲咒：改为对 2 格内所有敌人生效',
    apply: (spec) => ({ ...spec, shape: { type: 'discAoE', radius: 2 } }),
  },
  {
    id: 'ex_field_bless_grace',
    name: '泽被',
    rarity: 'epic',
    maxStacks: 1,
    only: ['field_bless'],
    fits: () => true,
    describe: () => '战场祝福：额外治疗 12，且增益同时给自己',
    apply: (spec) =>
      mergeSelf(
        mergeSelf(mergeAlly(spec, { kind: 'heal', amount: 12 }), {
          kind: 'atkBonus',
          addAtk: 4,
          rounds: 2,
        }),
        { kind: 'spdBonus', addSpd: 1, rounds: 2 },
      ),
  },
  /**
   * 炎弹的画面质变：火球打中之后再铺一圈火舌。放在连爆 / 燃尽前面，
   * 升到 2 级就能进三选一——这条的卖点就是战斗里立刻看得出升级。
   */
  {
    id: 'ex_ember_bloom',
    name: '爆炎',
    rarity: 'rare',
    maxStacks: 1,
    only: ['ember'],
    fits: () => true,
    describe: () => '炎弹：命中后对周围八格造成 25% 伤害',
    apply: (spec) => ({ ...addSplash(spec, 0.25, 'square'), vfxId: 'ember_bloom' }),
  },
  /** 原本是速射的「连珠」。速射转给敌方弓兵之后，这条搬到炎弹上当奥莉的出手频率强化 */
  {
    id: 'ex_snap_volley',
    name: '连爆',
    rarity: 'rare',
    maxStacks: 1,
    only: ['ember'],
    fits: () => true,
    describe: () => '炎弹：冷却缩短 1 回合，且伤害提升 20%',
    apply: (spec) => scaleDamage(cutCooldown(spec, 1), 1.2),
  },
  {
    id: 'ex_ember_reap',
    name: '燃尽',
    rarity: 'rare',
    maxStacks: 1,
    only: ['ember'],
    fits: () => true,
    describe: () => '炎弹：目标血量低于 50% 时，伤害提升 80%',
    apply: (spec) => withExecute(spec, 0.5, 1.8),
  },
  {
    id: 'ex_flame_ignite',
    name: '霜噬',
    rarity: 'rare',
    maxStacks: 1,
    only: ['frost_ring'],
    fits: () => true,
    describe: () => '霜环：命中后附加冻伤，每回合 -4 血（2 回合）',
    apply: (spec) => mergeFoe(spec, { kind: 'poison', dmgPerRound: 4, rounds: 2, theme: 'frost' }),
  },
  {
    id: 'ex_heal_spring',
    name: '涌泉',
    rarity: 'rare',
    maxStacks: 1,
    only: ['heal_touch'],
    fits: () => true,
    describe: () => '圣疗：治疗量提升 16，且目标速度 +2（2 回合）',
    apply: (spec) => mergeAlly(boostHeal(spec, 16), { kind: 'spdBonus', addSpd: 2, rounds: 2 }),
  },
  /**
   * 弥尔的终局纹章。圣疗原本是纯抬血，抬完那个人下一回合照样会被打回去；
   * 减伤把「救回来」变成「救得住」，这是治疗职业真正的天花板。
   */
  {
    id: 'ex_heal_aegis',
    name: '庇佑',
    rarity: 'epic',
    maxStacks: 1,
    only: ['heal_touch'],
    fits: () => true,
    describe: () => '圣疗：目标额外获得 40% 减伤，持续 3 回合',
    apply: (spec) => setAlly(spec, { kind: 'guard', reduceRatio: 0.4, rounds: 3 }),
  },
  {
    id: 'ex_ward_aegis',
    name: '圣盾',
    rarity: 'rare',
    maxStacks: 1,
    only: ['ward_prayer'],
    fits: () => true,
    describe: () => '守护祷言：减伤改为 50%，持续 3 回合',
    apply: (spec) => setAlly(spec, { kind: 'guard', reduceRatio: 0.5, rounds: 3 }),
  },
];

/**
 * 应用顺序 = 这个数组的顺序：**专属在前，普通在后**。
 *
 * 专属是质变（`set*` 直接改写数值），普通是加成（`merge*` 往上加）。反过来的话，
 * 「破军」会把刚加上的「挫锐」抹掉——玩家两张牌都选了，只有一张起作用。
 */
const EXCLUSIVE_LEVELS = exclusiveUnlockLevels(EXCLUSIVE_SEEDS);
const DEFS: SkillModDef[] = [...EXCLUSIVE_SEEDS, ...GENERIC_SEEDS].map(toDef);

function toDef(seed: ModSeed): SkillModDef {
  const scope: SkillModScope = seed.only
    ? { kind: 'exclusive', skillIds: seed.only }
    : { kind: 'generic' };
  return {
    id: seed.id,
    name: seed.name,
    rarity: seed.rarity,
    scope,
    minLevel: seed.minLevel ?? (seed.only ? (EXCLUSIVE_LEVELS.get(seed.id) ?? 2) : 1),
    icon: seed.icon ?? EXCLUSIVE_ICON,
    maxStacks: seed.maxStacks,
    describe: seed.describe,
    apply: seed.apply,
    // 专属校验在这里统一合成：抽卡池、折算、界面问的都是同一个函数，
    // 所以「换掉技能后专属词条自动休眠」是免费的，不需要额外一处判断。
    canApply: (spec) =>
      (scope.kind === 'generic' || scope.skillIds.includes(spec.id)) && seed.fits(spec),
  };
}

const BY_ID = new Map(DEFS.map((d) => [d.id, d]));

export function getSkillMod(id: string): SkillModDef | undefined {
  const remapped = id === 'ex_arcane_starfire' ? 'ex_flame_ignite' : id;
  return BY_ID.get(remapped);
}

export function allSkillMods(): SkillModDef[] {
  return DEFS;
}

export function isExclusiveMod(def: SkillModDef): boolean {
  return def.scope.kind === 'exclusive';
}

/**
 * 这条技能的**专属**纹章，按解锁等级排好序。
 *
 * 角色页解锁链只读这个：升级打开的是招牌强化，通用纹章不在这条链上。
 */
export function exclusiveChainForSkill(spec: SkillSpec): SkillModDef[] {
  return exclusiveModsForSkill(spec.id).sort((a, b) =>
    a.minLevel - b.minLevel || a.name.localeCompare(b.name),
  );
}

/**
 * 这条技能能吃到的全部纹章（含通用）。抽卡池用 `canApply`，不要走这条。
 */
export function modChainForSkill(spec: SkillSpec): SkillModDef[] {
  const rank: Record<SkillModRarity, number> = { common: 0, rare: 1, epic: 2 };
  return DEFS.filter((d) => d.canApply(spec)).sort((a, b) =>
    a.minLevel - b.minLevel
    || Number(isExclusiveMod(b)) - Number(isExclusiveMod(a))
    || rank[a.rarity] - rank[b.rarity]
    || a.name.localeCompare(b.name),
  );
}

/** 这条技能有哪些专属词条（供测试与图鉴类界面用） */
export function exclusiveModsForSkill(skillId: string): SkillModDef[] {
  const id = skillId === 'arcane_pulse' || skillId === 'flame_ring' ? 'frost_ring' : skillId;
  return DEFS.filter((d) => d.scope.kind === 'exclusive' && d.scope.skillIds.includes(id));
}

/**
 * 抽卡权重的基数。稀有度以前只是卡框颜色——池子是均匀抽的，「史诗」和「普通」
 * 出现的概率一模一样，那这个标签就是在骗玩家。
 */
const RARITY_WEIGHT: Record<SkillModRarity, number> = {
  common: 100,
  rare: 42,
  epic: 13,
};

/**
 * 专属词条的权重加成。
 *
 * 每招只有一两条专属，而普通词条一招能挂七八条，均匀抽的话专属基本见不到，
 * 玩家一整局也遇不上一次「这招的招牌强化」。乘个系数把它拉回可感知的频率。
 */
const EXCLUSIVE_WEIGHT_BONUS = 1.8;

/** 越深的节点，稀有/史诗权重涨得越快 */
const DEPTH_GROWTH: Record<SkillModRarity, number> = {
  common: 0,
  rare: 0.12,
  epic: 0.22,
};

/**
 * 某条词条在第 `depth` 个节点的抽取权重。
 *
 * 放在目录里而不是 `rollLoot` 里，是因为它是**词条自身的属性**（稀有度、是否专属）
 * 决定的；抽卡那边只负责按权重取一个。
 */
export function modRollWeight(def: SkillModDef, depth: number): number {
  const d = Math.max(0, depth);
  const grow = 1 + DEPTH_GROWTH[def.rarity] * d;
  const ex = isExclusiveMod(def) ? EXCLUSIVE_WEIGHT_BONUS : 1;
  return RARITY_WEIGHT[def.rarity] * grow * ex;
}

/**
 * 把词条折进技能规格。`modIds` 里同一个 id 出现几次就是几层。
 *
 * 层数是一次性算好再 `apply` 的，不是逐层套用：「伤害 +25%」叠三层要的是 +75%，
 * 逐层相乘会变成 +95%，越叠偏得越多。
 */
export function effectiveSkillSpec(spec: SkillSpec, modIds: readonly string[] | undefined): SkillSpec {
  if (!modIds?.length) return spec;

  const stacks = new Map<string, number>();
  for (const id of modIds) stacks.set(id, (stacks.get(id) ?? 0) + 1);

  // 必须先拷一份：没有任何词条能挂上时（比如给纯 debuff 技能塞了「伤害 +」），
  // 下面的 `out.mods = ...` 会直接写进 SPECS 里那个共享对象，污染所有单位。
  let out: SkillSpec = { ...spec };
  const applied: string[] = [];
  // 按目录顺序应用，保证同一组词条产出的规格与拿到的先后无关。
  for (const def of DEFS) {
    const n = stacks.get(def.id);
    if (!n) continue;
    // 判定读的是**原始**规格：否则「顽疾」会因为「淬毒」刚加的毒而挂上，
    // 卡片上却写着「技能施加的减益延长」——玩家看不到那条毒是词条带来的。
    if (!def.canApply(spec)) continue;
    out = def.apply(out, Math.min(n, def.maxStacks));
    applied.push(def.id);
  }
  out.mods = applied;
  return out;
}

/** 这条技能上某词条已叠的层数 */
export function modStacks(modIds: readonly string[] | undefined, modId: string): number {
  if (!modIds) return 0;
  let n = 0;
  for (const id of modIds) if (id === modId) n += 1;
  return n;
}
