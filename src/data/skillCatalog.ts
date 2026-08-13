import type { SkillDef, SkillKind, UnitKind } from '@/battle/types';

/** 技能触发时机 */
export type SkillTiming = 'beforeMove' | 'afterMove' | 'passive';

/**
 * 技能定位：这一招**在队伍里是干什么用的**。由作者声明，不从字段结构反推。
 *
 * 有两个用处，都很硬：
 *
 * 1. **词条投放**。之前判断「是不是输出技能」只有一句 `damage.kind !== 'none'`，
 *    于是「惊扰蜂群」——主功能是群体中毒、那 8 点即时伤只是为了让飘字有东西可飘——
 *    被判成伤害技能，三选一给它发「锋锐：技能伤害提升 25%」，把 8 点抬成 10 点。
 *    机制上合法，玩家读起来荒谬。
 * 2. **角色技能路线**。一个角色能学的技能定位必须全都一样
 *    （`CharacterDef.skillRoute`），否则换主技能会跨定位，攒了一路的词条批量休眠。
 *
 * 和另外两个维度的分工要划清楚，混了就会得出自相矛盾的分类：
 * - `role` 是**干什么用的**，管词条投放和路线归属。
 * - `timing` 是**怎么触发的**（`passive` 不走施放）。「冲锋」的定位是输出，
 *   触发方式是被动——早先把它的 role 写成 `passive`，结果骑兵的默认技能和
 *   可学技能定位对不上，路线自己跟自己打架。
 * - `isAoE` / `hasHeal` / `hasFoeDebuff` 这些结构谓词管**挂上去有没有东西可改**。
 */
export type SkillRole =
  /** 输出：伤害是它存在的理由。**只有这一档吃伤害类词条** */
  | 'damage'
  /** 控制：减益、减速、群体压制。可能带一点伤害，但那不是它的卖点 */
  | 'control'
  /** 辅助：治疗、给友方增益、拉嘲讽保人 */
  | 'support';

/**
 * 技能施放时的作用范围/形状（与普攻射程 `UnitDef.range` 无关）。
 * 具体数值由各技能在 `SPECS` 中配置。
 */
export type SkillShape =
  /** 曼哈顿距离 = d 的环上所有敌人（含多目标） */
  | { type: 'neighborAoE'; manhattan: number }
  /**
   * 曼哈顿距离 <= r 的**整片**区域内所有敌人。
   *
   * 和 `neighborAoE` 的区别是环 vs 圆：把 `neighborAoE` 的 manhattan 从 1 调到 2，
   * 打到的是「正好 2 格外」的一圈，贴脸的敌人反而漏掉了——那是位移不是扩大。
   * 词条「横扫」要的是真的覆盖更多格，所以单开这个形状。
   */
  | { type: 'discAoE'; radius: number }
  /** 同上环内选一个敌人（默认最低血量） */
  | { type: 'neighborPickLowest'; manhattan: number }
  /** 四向射线穿透，取「线上敌人总血量」最大的一条（弓系） */
  | { type: 'lineBestRayAllFoes' }
  /**
   * 选**一个**敌人。`manhattan` 配合 `reach` 决定够得着谁：
   *
   * - `reach: 'exact'`（缺省）：距离**正好等于** d 的环上。近战突刺型要的就是这个——
   *   「长驱突刺」取 2 表示得隔着一格才捅得到，贴脸反而不行，这是它的代价。
   * - `reach: 'within'`：距离 <= d 的整片区域内，含贴脸格。远程点杀要的是这个——
   *   弓手站 3 格外能射、被贴脸了也能射，射程是个范围而不是一条环。
   *
   * 缺省留在 `exact` 是因为先有近战突刺才有远程点杀，改默认值会静默挪动
   * 「长驱突刺」和「野草缠足」的可打范围。
   */
  | {
      type: 'neighborPickFoe';
      manhattan: number;
      pick: 'lowestHp' | 'highestHp';
      reach?: 'exact' | 'within';
    }
  /** 曼哈顿距离 = d 的环上选一个友方（不含自身），用于 buff */
  | { type: 'neighborPickAlly'; manhattan: number; pick: 'lowestHp' | 'highestHp' }
  /**
   * 只对自身生效（嘲讽 / 自 buff）。
   * 不要拿 `neighborAoE` + `damage: none` 冒充——那会逼玩家点敌人，还飘出 0 伤害。
   */
  | { type: 'selfCast' };

/**
 * 技能成功施放时对自身施加的限时效果（与是否造成伤害独立；无合法目标未施放时不触发）。
 * 回合数以战局 `round` 计，在每轮开始递减，见 `tickTimedBattleEffects`。
 */
export type SkillCastSelfEffect =
  | { kind: 'taunt'; rounds: number }
  | { kind: 'atkBonus'; addAtk: number; rounds: number }
  | { kind: 'spdBonus'; addSpd: number; rounds: number };

/** 对选中敌方单位施加的限时 debuff（成功施放且命中目标后） */
export type SkillCastFoeEffect =
  | { kind: 'atkDown'; subAtk: number; rounds: number }
  | { kind: 'spdDown'; subSpd: number; rounds: number }
  /** 中毒：每轮开始扣血，无视克制与地形，见 `tickTimedBattleEffects` */
  | { kind: 'poison'; dmgPerRound: number; rounds: number };

/** 对选中友方单位施加的限时 buff（成功施放且命中目标后） */
export type SkillCastAllyEffect =
  | { kind: 'atkBonus'; addAtk: number; rounds: number }
  | { kind: 'spdBonus'; addSpd: number; rounds: number }
  /** 即时回血（不是限时效果，命中当场结算，见 `pushAllyHeal`） */
  | { kind: 'heal'; amount: number };

/**
 * 技能对「单个目标」的伤害规则（由 `computeSkillHitDamage` 解析）。
 * - 扩展：使用 `{ kind: 'custom', id, params }` 并在运行时 `registerSkillDamageCalculator(id, fn)` 注册。
 */
export type SkillDamageSpec =
  | { kind: 'scaledAtk'; atkMul: number }
  | {
      kind: 'flat';
      amount: number;
      /** 默认 true：乘三角克制 */
      applyCounter?: boolean;
      /** 默认 true：乘攻击方高地倍率 */
      applyTerrain?: boolean;
    }
  | {
      kind: 'percentTargetMaxHp';
      ratio: number;
      applyCounter?: boolean;
      applyTerrain?: boolean;
    }
  | { kind: 'none' }
  | { kind: 'custom'; id: string; params?: Record<string, number> };

/** 单条技能：独立范围、时机、数值与职业限制 */
export interface SkillSpec {
  id: string;
  name: string;
  cooldown: number;
  /**
   * 职业限制：`null` = 通用（任意职业可学/可携带）；非 null = 仅该职业专属
   */
  exclusiveProfession: UnitKind | null;
  timing: SkillTiming;
  /**
   * 这一招干什么用的，决定它吃哪一类词条、属于哪条角色路线。必填——可选字段会被漏写，
   * 而漏写的默认值无论取哪个都会静默投错词条。
   */
  role: SkillRole;
  /**
   * 已实现但**当前没有角色能学**：在等这条 `role` 路线的角色上线。
   *
   * 需要这个标记，是因为「技能没主人」和「技能配错了」在数据上长得一模一样。
   * 破甲咒 / 盾墙震慑 / 战场祝福都是完整可用的招，只是第一章六个角色全是输出路线，
   * 给他们塞一招控制或辅助会让换主技能跨定位、词条批量休眠（见 `CharacterDef.skillRoute`）。
   *
   * 标出来之后两件事都守得住：可学列表里出现预留技能是**错误**（`characterCatalog.test.ts`），
   * 而它们的专属词条允许存在、不算死牌（`skillMods.test.ts`）。
   */
  reserved?: true;
  /** 回放/UI 高亮色类 */
  displayKind: SkillKind;
  shape: SkillShape;
  /** 对单目标伤害规则；见 `battle/skillDamage` */
  damage: SkillDamageSpec;
  /** 仅 passive：本回合若已沿路径移动，则普攻伤害再乘此倍率 */
  passiveBasicAttackMulIfMoved?: number;
  /** 商店技能报价，默认 7 */
  shopPrice?: number;
  /** 成功施放后对自身生效的限时 buff（含嘲讽）；缺省无 */
  onCastSelfEffects?: SkillCastSelfEffect[];
  /** 对技能选中的敌方单位施加的 debuff；需配合可选敌形状（如 `neighborPickFoe`） */
  onCastFoeEffects?: SkillCastFoeEffect[];
  /** 对技能选中的友方单位施加的 buff；需配合 `neighborPickAlly` */
  onCastAllyEffects?: SkillCastAllyEffect[];
  /** 吸血：本次技能造成的总伤害 × 该比例回复施法者（不超过上限血量）；缺省 0 */
  lifestealRatio?: number;
  /**
   * 处决：目标当前血量比例低于 `belowHpRatio` 时，本次伤害再乘 `mul`。
   *
   * 阈值判定放伤害公式里而不是词条里，是因为它要读**结算那一刻**的目标血量：
   * AoE 打第二个目标时第一个已经掉血了，词条侧算不到这个。
   */
  executeBonus?: { belowHpRatio: number; mul: number };
  /**
   * 溅射：单体技能额外对**主目标邻格**的敌人按此比例造成伤害；缺省 0。
   *
   * 只溅伤害不溅 debuff。「减速溅射」听起来更强，但那等于把单体控制变成群控，
   * 一条词条就把「点谁」这个决策抹平了——单体技能的取舍本来就在选目标上。
   */
  splashRatio?: number;
  /** 已挂载的词条 id（由 `effectiveSkillSpec` 填充，仅供 UI 展示，不参与结算） */
  mods?: string[];
}

const SPECS: Record<string, SkillSpec> = {
  whirl: {
    id: 'whirl',
    name: '旋风斩',
    cooldown: 3,
    exclusiveProfession: 'sword',
    timing: 'beforeMove',
    role: 'damage',
    displayKind: 'whirlwind',
    shape: { type: 'neighborAoE', manhattan: 1 },
    damage: { kind: 'scaledAtk', atkMul: 0.45 },
  },
  pierce: {
    id: 'pierce',
    name: '穿透箭',
    cooldown: 3,
    exclusiveProfession: 'bow',
    timing: 'afterMove',
    role: 'damage',
    displayKind: 'lineShot',
    shape: { type: 'lineBestRayAllFoes' },
    damage: { kind: 'scaledAtk', atkMul: 0.55 },
  },
  charge: {
    id: 'charge',
    name: '冲锋',
    cooldown: 0,
    exclusiveProfession: 'cavalry',
    timing: 'passive',
    // 定位是输出（它干的事是把普攻打得更狠），被动只是触发方式，写在 timing 上
    role: 'damage',
    displayKind: 'passiveCharge',
    shape: { type: 'neighborAoE', manhattan: 1 },
    damage: { kind: 'none' },
    passiveBasicAttackMulIfMoved: 1.35,
  },
  /**
   * 盾卫基础：**短冷却拖慢**，靠出手频率而不是单发伤害。
   *
   * 这一招原本挂 `taunt` 自 buff，而那是个**死效果**：盾卫 `strike.taunt` 恒为 true，
   * `effectiveUnitDef` 里算的是 `strikeTaunt || timedTauntActive`，本来就一直在拉仇恨。
   * 而 bash / hammer 都是盾卫专属，谁也享受不到这个 buff。
   * 死效果一去掉，两招就只剩 0.85 vs 0.9 的倍率差、同为 3 回合冷却、同一个价钱——
   * 「铁锤」是「震击」的纯升级，可学列表里摆两个等于没得选。
   *
   * 所以两招按**频率 / 爆发**分开：震击每 2 回合就能出手，减速让对面永远差一步；
   * 「铁锤」（见下）三回合一发重击 + 削攻。盾卫自己慢（spd 3），
   * 让对面更慢是它唯一能主动创造的位置优势。
   */
  bash: {
    id: 'bash',
    name: '震击',
    cooldown: 2,
    exclusiveProfession: 'shield',
    timing: 'beforeMove',
    role: 'damage',
    displayKind: 'singleBash',
    shape: { type: 'neighborPickLowest', manhattan: 1 },
    damage: { kind: 'scaledAtk', atkMul: 0.7 },
    onCastFoeEffects: [{ kind: 'spdDown', subSpd: 2, rounds: 2 }],
  },
  /** 剑士进阶：单体高倍率 + 削攻，打最高血目标（与 cleave 收割型区分） */
  blade_rush: {
    id: 'blade_rush',
    name: '破阵斩',
    cooldown: 3,
    exclusiveProfession: 'sword',
    timing: 'beforeMove',
    role: 'damage',
    displayKind: 'singleBash',
    shape: { type: 'neighborPickFoe', manhattan: 1, pick: 'highestHp' },
    damage: { kind: 'scaledAtk', atkMul: 1.15 },
    shopPrice: 8,
    onCastFoeEffects: [{ kind: 'atkDown', subAtk: 4, rounds: 2 }],
  },
  /** 骑兵主动：2 格外单体突刺，弥补骑兵只有被动的问题 */
  lance_thrust: {
    id: 'lance_thrust',
    name: '长驱突刺',
    cooldown: 2,
    exclusiveProfession: 'cavalry',
    timing: 'beforeMove',
    role: 'damage',
    displayKind: 'singleBash',
    shape: { type: 'neighborPickFoe', manhattan: 2, pick: 'lowestHp' },
    damage: { kind: 'scaledAtk', atkMul: 0.9 },
    shopPrice: 7,
  },
  /** 骑兵主动：邻格 AoE + 减速，反集群 */
  trample: {
    id: 'trample',
    name: '铁蹄践踏',
    cooldown: 3,
    exclusiveProfession: 'cavalry',
    timing: 'beforeMove',
    role: 'damage',
    displayKind: 'whirlwind',
    shape: { type: 'neighborAoE', manhattan: 1 },
    damage: { kind: 'scaledAtk', atkMul: 0.5 },
    shopPrice: 8,
    onCastFoeEffects: [{ kind: 'spdDown', subSpd: 2, rounds: 2 }],
  },
  /**
   * 盾卫进阶：邻格 AoE 群体削攻，纯坦装。
   * 自嘲讽和 `bash` / `hammer` 一样删掉——盾卫专属技能给自己加嘲讽是死效果。
   * `reserved`：等一个控制路线的盾卫角色。格隆是输出路线（震击 / 铁锤），
   * 塞给他会让换主技能跨定位。
   */
  shield_wall: {
    id: 'shield_wall',
    name: '盾墙震慑',
    cooldown: 3,
    exclusiveProfession: 'shield',
    timing: 'beforeMove',
    role: 'control',
    reserved: true,
    displayKind: 'whirlwind',
    shape: { type: 'neighborAoE', manhattan: 1 },
    damage: { kind: 'scaledAtk', atkMul: 0.4 },
    shopPrice: 8,
    onCastFoeEffects: [{ kind: 'atkDown', subAtk: 4, rounds: 2 }],
  },
  /**
   * Boss 专属（血牙酋长）：邻格 AoE + 自身攻击提升。
   * exclusiveProfession 为 null 仅为通过施放校验；不进任何商店池/可学列表，玩家拿不到。
   */
  savage_roar: {
    id: 'savage_roar',
    name: '狂暴战吼',
    cooldown: 3,
    exclusiveProfession: null,
    timing: 'beforeMove',
    role: 'damage',
    displayKind: 'whirlwind',
    shape: { type: 'neighborAoE', manhattan: 1 },
    damage: { kind: 'scaledAtk', atkMul: 0.6 },
    onCastSelfEffects: [{ kind: 'atkBonus', addAtk: 6, rounds: 2 }],
  },
  cleave: {
    id: 'cleave',
    name: '重劈',
    cooldown: 2,
    exclusiveProfession: 'sword',
    timing: 'beforeMove',
    role: 'damage',
    displayKind: 'singleBash',
    shape: { type: 'neighborPickLowest', manhattan: 1 },
    damage: { kind: 'scaledAtk', atkMul: 0.88 },
    shopPrice: 7,
  },
  /**
   * 弓手进阶：**3 格内点名单体**，和「穿透箭」的整条线群伤是两种打法。
   *
   * 原本它和穿透箭同为 `lineBestRayAllFoes`、同样打线上所有敌人，区别只有
   * 0.52 / 冷却 2 对 0.55 / 冷却 3——换招换到的是一次几乎看不见的数值微调。
   * 现在分工是「几个敌人排成一条线」对「那一个必须现在死的敌人」：
   * 线上站着 2 个人时穿透箭总伤更高，落单的残血靠速射一发带走。
   *
   * `reach: 'within'` 而不是缺省的 `exact`：射程该是一片区域，
   * 被贴脸了也得能射，否则近身反而成了弓手的无解格。
   */
  snap: {
    id: 'snap',
    name: '速射',
    cooldown: 2,
    exclusiveProfession: 'bow',
    timing: 'afterMove',
    role: 'damage',
    displayKind: 'lineShot',
    shape: { type: 'neighborPickFoe', manhattan: 3, pick: 'lowestHp', reach: 'within' },
    damage: { kind: 'scaledAtk', atkMul: 0.8 },
    shopPrice: 7,
  },
  /**
   * 盾卫进阶：**低频重击 + 削攻**，和「震击」的高频拖慢互为另一头。
   * 自嘲讽同样删掉（对盾卫是死效果，理由见 `bash`）。削攻的方向和它的专属词条
   * 「碎骨」（攻 -6 / 速 -3）一致：盾卫打不死人，但能让被它盯上的那个打不疼人。
   */
  hammer: {
    id: 'hammer',
    name: '铁锤',
    cooldown: 3,
    exclusiveProfession: 'shield',
    timing: 'beforeMove',
    role: 'damage',
    displayKind: 'singleBash',
    shape: { type: 'neighborPickLowest', manhattan: 1 },
    damage: { kind: 'scaledAtk', atkMul: 1.15 },
    shopPrice: 7,
    onCastFoeEffects: [{ kind: 'atkDown', subAtk: 4, rounds: 2 }],
  },
  /**
   * 通用技能：任意职业可买可带，走**临时槽**（局内商店），不进任何角色的可学列表。
   *
   * 它当过一段时间「所有人都能学的第三招」，但那个位置它填不了：0.32 的邻格 AoE
   * 对剑士是弱一档的旋风斩（0.45）、对骑兵是没有减速的践踏（0.5），
   * 对弓手更是要贴到脸上才放得出——**对每个职业都是劣化选项**。
   * 可学列表里放一个人人都不该选的东西，等于把「换主技能」这个决策变成一道送分题。
   *
   * 定位改成 `control` 之后它反而找回了位置：临时技能的口径是
   * 「主打功能而不是伤害」（见下方 `temp_gl_*` 的说明），而它原先是 `damage`,
   * 恰好是那条口径明确不要的东西——两个伤害技能抢同一个每回合施放额度，
   * 玩家只会每回合挑倍率大的那个。低伤害 + 群体削攻才是它该干的事。
   *
   * `reserved`：等一个控制路线的角色。作为临时技能它照样在商店卖，
   * `reserved` 只管主槽可学列表。
   */
  war_shout: {
    id: 'war_shout',
    name: '战吼',
    cooldown: 3,
    exclusiveProfession: null,
    timing: 'beforeMove',
    role: 'control',
    reserved: true,
    displayKind: 'whirlwind',
    shape: { type: 'neighborAoE', manhattan: 1 },
    damage: { kind: 'scaledAtk', atkMul: 0.32 },
    shopPrice: 8,
    onCastFoeEffects: [{ kind: 'atkDown', subAtk: 3, rounds: 2 }],
  },
  /**
   * 弓系：环上选一敌，纯 debuff。
   * `reserved`：等一个控制路线的弓手角色。希尔 / 温都是输出路线（穿透箭 / 速射）。
   */
  hex_mark: {
    id: 'hex_mark',
    name: '破甲咒',
    cooldown: 3,
    exclusiveProfession: 'bow',
    timing: 'beforeMove',
    role: 'control',
    reserved: true,
    displayKind: 'lineShot',
    shape: { type: 'neighborPickFoe', manhattan: 2, pick: 'lowestHp' },
    damage: { kind: 'none' },
    shopPrice: 7,
    onCastFoeEffects: [{ kind: 'atkDown', subAtk: 5, rounds: 3 }],
  },
  /**
   * ── 草原战线专属临时技能（`temp_gl_*`）────────────────────────────
   *
   * 只在第一章商店出现，装进**临时槽**，任何职业都能带（`exclusiveProfession: null`）。
   * 设计口径有三条，偏离哪一条都会出问题：
   *
   * 1. **主打功能而不是伤害。** 临时技能和主技能共用每回合一次的施放额度，
   *    如果它也是「打一发伤害」，那玩家每回合就是在两个伤害技能里挑大的，
   *    临时槽退化成一次静默的数值升级。做成控制/治疗/群体减益，
   *    它才有「主技能进冷却时我还能干点别的」这个存在理由。
   * 2. **不吃伤害类词条。** 由 `role`（`control` / `support`）保证，不靠 `damage: none`——
   *    「惊扰蜂群」为了让飘字有东西可飘带了 8 点即时伤，光看 damage 字段就会被判成
   *    伤害技能，然后吃到「锋锐」。定位必须是声明出来的。
   *    更根本的一层是**词条只作用于主技能**（见 `unitSkillSpec`），
   *    所以临时技能怎么都变不成主力，主技能始终是投入的去处。
   * 3. **名字和效果要认得出是草原。** 场景专属技能的意义就在这——
   *    玩家换章节时应该从技能名上就感觉到「这里不一样」。
   */
  temp_gl_snare: {
    id: 'temp_gl_snare',
    name: '野草缠足',
    cooldown: 2,
    exclusiveProfession: null,
    timing: 'beforeMove',
    role: 'control',
    displayKind: 'whirlwind',
    // 邻格而不是 2 格环：`neighborPickFoe` 的距离是**正好等于**，取 2 的话
    // 贴到脸上的敌人反而缠不住，而那恰恰是最需要缠住的那个。
    // 已有的 lance_thrust / hex_mark 是 2 格环，那两个是「够得着远处」的定位，不一样。
    shape: { type: 'neighborPickFoe', manhattan: 1, pick: 'highestHp' },
    damage: { kind: 'none' },
    shopPrice: 6,
    onCastFoeEffects: [{ kind: 'spdDown', subSpd: 4, rounds: 2 }],
  },
  temp_gl_salve: {
    id: 'temp_gl_salve',
    name: '草药敷治',
    cooldown: 3,
    exclusiveProfession: null,
    timing: 'beforeMove',
    role: 'support',
    displayKind: 'whirlwind',
    shape: { type: 'neighborPickAlly', manhattan: 1, pick: 'lowestHp' },
    damage: { kind: 'none' },
    shopPrice: 7,
    onCastAllyEffects: [{ kind: 'heal', amount: 14 }],
  },
  temp_gl_swarm: {
    id: 'temp_gl_swarm',
    name: '惊扰蜂群',
    cooldown: 3,
    exclusiveProfession: null,
    timing: 'beforeMove',
    role: 'control',
    displayKind: 'whirlwind',
    shape: { type: 'discAoE', radius: 1 },
    // 即时伤要能看见飘字；主功能仍是随后两回合毒（每跳 3）
    damage: { kind: 'flat', amount: 8, applyCounter: false, applyTerrain: false },
    shopPrice: 8,
    onCastFoeEffects: [{ kind: 'poison', dmgPerRound: 3, rounds: 2 }],
  },
  temp_gl_horn: {
    id: 'temp_gl_horn',
    name: '牧野号角',
    cooldown: 3,
    exclusiveProfession: null,
    timing: 'beforeMove',
    role: 'support',
    displayKind: 'whirlwind',
    shape: { type: 'selfCast' },
    damage: { kind: 'none' },
    shopPrice: 7,
    onCastSelfEffects: [{ kind: 'taunt', rounds: 2 }, { kind: 'atkBonus', addAtk: 5, rounds: 2 }],
  },
  /**
   * 通用：邻格选一友（不含自身），纯 buff。
   *
   * `reserved` 指的是**没人能把它学进主槽**（第一章六个角色全是输出路线），
   * 不等于用不上——它仍在二至五章的临时技能池里卖，走第二槽。
   * 主槽要等一个辅助路线的角色。
   */
  field_bless: {
    id: 'field_bless',
    name: '战场祝福',
    cooldown: 4,
    exclusiveProfession: null,
    timing: 'beforeMove',
    role: 'support',
    reserved: true,
    displayKind: 'whirlwind',
    shape: { type: 'neighborPickAlly', manhattan: 1, pick: 'lowestHp' },
    damage: { kind: 'none' },
    shopPrice: 8,
    onCastAllyEffects: [
      { kind: 'atkBonus', addAtk: 4, rounds: 2 },
      { kind: 'spdBonus', addSpd: 1, rounds: 2 },
    ],
  },
};

const DEFAULT_SKILL_ID_BY_KIND: Record<UnitKind, string> = {
  sword: 'whirl',
  bow: 'pierce',
  cavalry: 'charge',
  shield: 'bash',
};

export function getSkillSpec(id: string): SkillSpec | undefined {
  return SPECS[id];
}

/**
 * 玩家有可能带上场的全部技能。
 *
 * Boss 专属的 `savage_roar` 排除在外：它不进商店池也不在可学列表里。
 * 玩家侧展示走敌方皮肤（第一章「血牙咆哮」），不要在这里加玩家可学图标。
 */
export function allPlayerSkillSpecs(): SkillSpec[] {
  return Object.values(SPECS).filter((s) => s.id !== 'savage_roar');
}

/** 各职业开局默认携带的技能 id */
export function defaultSkillId(kind: UnitKind): string {
  return DEFAULT_SKILL_ID_BY_KIND[kind];
}

export function skillDefForId(id: string): SkillDef | undefined {
  const s = SPECS[id];
  if (!s) return undefined;
  return { id: s.id, name: s.name, cooldown: s.cooldown, kind: s.displayKind };
}

/** 某职业是否允许学习/携带该技能（通用技 exclusiveProfession === null 恒为 true） */
export function canProfessionEquipSkill(profession: UnitKind, skillId: string): boolean {
  const s = SPECS[skillId];
  if (!s) return false;
  if (s.exclusiveProfession === null) return true;
  return s.exclusiveProfession === profession;
}
