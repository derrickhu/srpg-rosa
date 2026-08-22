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
  /**
   * 以自身为心、边长 2r+1 的**方形**内所有敌人（切比雪夫 <= r），含四个斜角，不含自身格。
   *
   * 为什么不能拿前两个凑：曼哈顿距离认为斜角邻居（距离 2）和隔一格的正对面一样远，
   * 所以 `neighborAoE manhattan:1` 和 `discAoE radius:1` 打到的是**同一批人**
   * ——都只有正交四格，斜角一律漏掉。
   *
   * 环形/扩散型特效（旋风斩的刃环、咆哮的冲击波、践踏的尘环）画的是整个 3×3，
   * 配上面任何一个形状都会「特效比范围大」：玩家照着特效边界站到斜角，以为安全，
   * 结果这一招有时候算有时候不算。改特效等于把旋风斩画成一个十字，那不叫旋风，
   * 所以改的是尺子。`radius:1` 就是标准的「贴身一圈八格」。
   */
  | { type: 'squareAoE'; radius: number }
  /** 四向射线穿透；玩家点方向，AI 才按策略挑一条线 */
  | { type: 'lineBestRayAllFoes' }
  /**
   * 选**一个**敌人。点谁由玩家或 AI 决定，技能只规定够得着哪里。
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
      reach?: 'exact' | 'within';
    }
  /**
   * 选**一个**友方（不含自身）。`reach` 和 `neighborPickFoe` 同口径：
   * 缺省 `exact` 是环，`within` 是半径内整片（圣疗这类远程治疗要用）。
   */
  | {
      type: 'neighborPickAlly';
      manhattan: number;
      reach?: 'exact' | 'within';
    }
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
  | { kind: 'spdBonus'; addSpd: number; rounds: number }
  /** 减伤：受到的攻击/技能伤害 ×(1 - `reduceRatio`)，见 `TimedBattleEffect` 的 `guard` */
  | { kind: 'guard'; reduceRatio: number; rounds: number };

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
  | { kind: 'heal'; amount: number }
  /** 减伤，同 `SkillCastSelfEffect` 的 `guard`：护人和护自己走同一套结算 */
  | { kind: 'guard'; reduceRatio: number; rounds: number };

/**
 * 技能对**格子**做的事，作用于技能范围内的每一格。
 *
 * 和 foe/ally 效果的区别是它不需要范围里有单位：一片空森林也能烧掉，
 * 「先拆掉掩体再进攻」才成立。
 */
export type SkillCastTerrainEffect =
  /** 点燃范围内所有可燃地形（`TerrainSpec.ignitesTo`） */
  | { kind: 'ignite' };

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
  /**
   * **只给敌人用**：不进商店池、不在任何可学列表、玩家侧不配可学图标。
   * 玩家看到的名字/图标一律走 `enemySkillCatalog` 的皮肤。
   *
   * 和 `reserved` 的区别是「永远不给」对「暂时没主人」：预留技能等的是一个角色上线，
   * 这些则是 Boss 招式，给玩家就等于把 Boss 的压力手段变成玩家的数值升级。
   *
   * 之前这件事是靠 `allPlayerSkillSpecs()` 里一句 `s.id !== 'savage_roar'` 的黑名单做的。
   * 加第二个 Boss 技能时漏改那一行不会报错，只会让它悄悄出现在玩家技能图标校验里
   * （然后为了让测试变绿，有人去给它配一张玩家图标）。改成自己声明，加招时想漏也漏不掉。
   */
  enemyOnly?: true;
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
  /**
   * 施放后对**作用范围内的格子**做什么（点燃可燃地形）。见 `skills.applyCastTerrainEffects`。
   *
   * 只能挂在 AoE 形状的技能上：单体点名技能的作用范围是整个瞄准环，
   * 拿它当点燃范围会烧掉一整圈。改地形的词条在 `canApply` 里守这条。
   */
  onCastTerrainEffects?: SkillCastTerrainEffect[];
  /** 已挂载的词条 id（由 `effectiveSkillSpec` 填充，仅供 UI 展示，不参与结算） */
  mods?: string[];
}

const SPECS: Record<string, SkillSpec> = {
  /**
   * 剑士默认：绕身一圈全部砍到。
   *
   * 形状是 `discAoE radius:1` 而不是 `neighborAoE manhattan:1`，因为后者打的是
   * **正好 1 格外的环**——也就是只有上下左右四格，贴在斜角的敌人挨不到。
   * 一记「旋风斩」放过站在斜对面的人，机制上说不通，而特效那边画的又是绕身
   * 360° 的刃环、`cells=3` 盖满 3×3，正好撞上《特效圣经》§4.6 明令禁止的那种错：
   * 特效比实际范围大，玩家会照着特效的边界走位，然后发现打不到。
   *
   * 两边只能改一边。改特效等于把旋风斩画成一个十字，那不叫旋风；所以改形状。
   * 用 `squareAoE`（切比雪夫，含斜角）而不是 `discAoE`：后者的半径 1 量的还是曼哈顿，
   * 打到的和 `neighborAoE manhattan:1` 是同一批人，换过去等于什么都没改。
   * 倍率从 0.45 压到 0.40 抵掉多出来的四个斜角格。
   * 展示文案不变——`itemText` / `skillText` 都把贴身一圈读作「邻格全体敌人」。
   * 词条「横扫」也照样工作（`widenAoE` 把它摊到 radius 2）。
   */
  whirl: {
    id: 'whirl',
    name: '旋风斩',
    cooldown: 3,
    exclusiveProfession: 'sword',
    timing: 'beforeMove',
    role: 'damage',
    displayKind: 'whirlwind',
    shape: { type: 'squareAoE', radius: 1 },
    damage: { kind: 'scaledAtk', atkMul: 0.4 },
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
    shape: { type: 'neighborPickFoe', manhattan: 1 },
    damage: { kind: 'scaledAtk', atkMul: 0.7 },
    onCastFoeEffects: [{ kind: 'spdDown', subSpd: 2, rounds: 2 }],
  },
  /** 剑士进阶：邻格单体高倍率 + 削攻，和重劈的纯伤害点杀分开 */
  blade_rush: {
    id: 'blade_rush',
    name: '破阵斩',
    cooldown: 3,
    exclusiveProfession: 'sword',
    timing: 'beforeMove',
    role: 'damage',
    displayKind: 'singleBash',
    shape: { type: 'neighborPickFoe', manhattan: 1 },
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
    shape: { type: 'neighborPickFoe', manhattan: 2 },
    damage: { kind: 'scaledAtk', atkMul: 0.9 },
    shopPrice: 7,
  },
  /**
   * 骑兵主动：绕身一圈踏过去 + 减速，反集群。
   * 形状同「旋风斩」改成 `squareAoE radius:1`：马绕身踏过一圈却漏掉斜角说不通。
   * 倍率 0.5 → 0.45 抵掉多出来的四格。
   */
  trample: {
    id: 'trample',
    name: '铁蹄践踏',
    cooldown: 3,
    exclusiveProfession: 'cavalry',
    timing: 'beforeMove',
    role: 'damage',
    displayKind: 'whirlwind',
    shape: { type: 'squareAoE', radius: 1 },
    damage: { kind: 'scaledAtk', atkMul: 0.45 },
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
   *
   * 形状同「旋风斩」改成 `squareAoE radius:1`：一声咆哮向外扩散却漏掉斜角，
   * 而特效 `cells=3.2` 画的是盖满 3×3 的环——玩家躲到斜角以为安全，
   * 下一场换个 Boss 又被打到，这种「有时候算有时候不算」比单纯难更劝退。
   * 倍率 0.6 → 0.52 让期望伤害基本不变。
   */
  savage_roar: {
    id: 'savage_roar',
    name: '狂暴战吼',
    cooldown: 3,
    exclusiveProfession: null,
    timing: 'beforeMove',
    role: 'damage',
    enemyOnly: true,
    displayKind: 'whirlwind',
    shape: { type: 'squareAoE', radius: 1 },
    damage: { kind: 'scaledAtk', atkMul: 0.52 },
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
    shape: { type: 'neighborPickFoe', manhattan: 1 },
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
    shape: { type: 'neighborPickFoe', manhattan: 3, reach: 'within' },
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
    shape: { type: 'neighborPickFoe', manhattan: 1 },
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
   * `reserved`：等一个控制路线的弓手角色。希尔是输出路线（穿透箭 / 速射）。
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
    shape: { type: 'neighborPickFoe', manhattan: 2 },
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
    shape: { type: 'neighborPickFoe', manhattan: 1 },
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
    shape: { type: 'neighborPickAlly', manhattan: 1 },
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
   * ── 密林深处专属临时技能（`temp_fo_*`）────────────────────────────
   *
   * 口径继承 `temp_gl_*` 那三条（主打功能不主打伤害 / 不吃伤害词条 / 认得出是林地），
   * 第二章另外加一条：**这一组要把「森林可燃」教会**。
   *
   * 森林在第一章只是一块「站上去减伤 25%」的地形，玩家学到的是躲进去。第二章要把它
   * 变成一个可以被拆掉的东西，于是掩体不再是无条件的答案——这是同一块地形在两章里
   * 长出两种读法，比再发明一种新地形划算得多。
   *
   * 四招的分工刻意不重叠，一组临时技能最容易犯的错是四张牌都在「打得更疼」上：
   * 火把改地形、绞缠改移动、庇护护别人、守林人自己站前面。
   */
  temp_fo_torch: {
    id: 'temp_fo_torch',
    name: '松脂火把',
    cooldown: 3,
    exclusiveProfession: null,
    timing: 'beforeMove',
    role: 'control',
    displayKind: 'whirlwind',
    /**
     * 用邻格环而不是半径 1 的圆盘：圆盘含施法者**自己那一格**，站在林子里放火把
     * 会把自己脚下点着。那不是有趣的取舍，是玩家买了这一招、用了一次、然后觉得被坑。
     * 环形只烧四周，「往外点火」这个动作和它的画面也对得上。
     */
    shape: { type: 'neighborAoE', manhattan: 1 },
    // 6 点即时伤只为让飘字有东西可飘（同「惊扰蜂群」）：真正的输出是烧起来之后
    // 每回合 8 点的地形掉血。不吃克制和地形，免得一个「主要拿来改地形」的招
    // 因为站位不同打出三种数字，反而让人以为这招的重点是伤害。
    damage: { kind: 'flat', amount: 6, applyCounter: false, applyTerrain: false },
    shopPrice: 8,
    onCastTerrainEffects: [{ kind: 'ignite' }],
  },
  temp_fo_thorn: {
    id: 'temp_fo_thorn',
    name: '荆棘绞缠',
    cooldown: 2,
    exclusiveProfession: null,
    timing: 'beforeMove',
    role: 'control',
    displayKind: 'whirlwind',
    /**
     * 距离**正好 2** 的一圈，不是贴身环。它拦的是**正在接近**的那一波：
     * 已经贴上来的敌人绞不到，这是它的代价，也让它和「野草缠足」（贴身黏住一个突进的）
     * 分成两件事。和「松脂火把」的贴身环叠起来正好是内外两层。
     *
     * 带 5 点伤而不是纯 debuff：无伤害的群体 debuff 会被
     * `skillTargeting.test.ts` 那条「纯敌方无伤必须点单体」挡下来。那条规则是对的——
     * 无伤 AoE 在回放里几乎看不出发生了什么，而这一招本来就该有荆棘划伤的感觉。
     */
    shape: { type: 'neighborAoE', manhattan: 2 },
    damage: { kind: 'flat', amount: 5, applyCounter: false, applyTerrain: false },
    shopPrice: 7,
    onCastFoeEffects: [{ kind: 'spdDown', subSpd: 3, rounds: 2 }],
  },
  temp_fo_bark: {
    id: 'temp_fo_bark',
    name: '树皮庇护',
    cooldown: 3,
    exclusiveProfession: null,
    timing: 'beforeMove',
    role: 'support',
    displayKind: 'whirlwind',
    shape: { type: 'neighborPickAlly', manhattan: 1 },
    damage: { kind: 'none' },
    shopPrice: 8,
    // 全游戏第一个减伤技能。挂在临时槽先跑一遍，是因为减伤这个动词的手感
    // （35% / 2 回合合不合适）得在真实对局里量过，再决定要不要给某个职业当看家本领。
    onCastAllyEffects: [{ kind: 'guard', reduceRatio: 0.35, rounds: 2 }],
  },
  temp_fo_warden: {
    id: 'temp_fo_warden',
    name: '守林人之姿',
    cooldown: 3,
    exclusiveProfession: null,
    timing: 'beforeMove',
    role: 'support',
    displayKind: 'whirlwind',
    shape: { type: 'selfCast' },
    damage: { kind: 'none' },
    shopPrice: 7,
    /**
     * 和草原「牧野号角」都是自身嘲讽，但那个配增攻、这个配减伤——一个是拿自己当诱饵
     * 换输出，一个是拿自己当墙。配上火把就是这一章的组合拳：烧掉隘口的林子，
     * 再把敌人钉在火边上耗。
     */
    onCastSelfEffects: [
      { kind: 'taunt', rounds: 2 },
      { kind: 'guard', reduceRatio: 0.25, rounds: 2 },
    ],
  },
  /**
   * ── 要塞攻防专属临时技能（`temp_ft_*`）────────────────────────────
   *
   * 口径继承前两组（主打功能不主打伤害 / 不吃伤害词条 / 认得出是要塞）。
   * 这一组的分工原则和前两组一样是「四张牌不许都在打得更疼上」，但这里还多一条约束：
   * **四个动词必须是前两章没用过的**，否则玩家花钱买到的是换了名字的旧招。
   *
   * 已被占掉的：减速（缠足、绞缠）、治疗（敷治）、中毒（蜂群）、自身嘲讽（号角、守林人）、
   * 点燃（火把）、护友减伤（庇护）。
   * 这一组拿的是四个新的：**直线穿透**、**削敌攻击**、**给友方加攻速**、**自身加速**。
   *
   * 四招都咬着这一章的几何——城墙和闸门把战场切成走廊：
   * 撞城槌吃走廊的对齐，压制号令对付墙后的远程，战旗和钩索都是为了
   * 「闸门开的那一刻冲进去」——这一章的题目是时机，所以要有招去兑现时机。
   */
  temp_ft_ram: {
    id: 'temp_ft_ram',
    name: '撞城槌',
    cooldown: 3,
    exclusiveProfession: null,
    timing: 'beforeMove',
    role: 'damage',
    displayKind: 'lineShot',
    /**
     * 全游戏第一个走直线穿透的**临时**技能。选这个形状是因为它的价值完全由地形决定：
     * 空旷地图上一条线通常只穿到一个人，而这一章的城墙和闸门把敌人挤进走廊，
     * 同一招在这里能穿三个。技能强度随「玩家读懂了这张图」变化，这正是想要的。
     *
     * 倍率 0.6 且**吃**克制与地形（和其它临时技能相反）：这一招是纯输出定位，
     * 不像火把那样「主要拿来改地形」，所以它应该像普通伤害技能一样奖励站位。
     */
    shape: { type: 'lineBestRayAllFoes' },
    damage: { kind: 'scaledAtk', atkMul: 0.6 },
    shopPrice: 9,
  },
  temp_ft_suppress: {
    id: 'temp_ft_suppress',
    name: '压制号令',
    cooldown: 2,
    exclusiveProfession: null,
    timing: 'beforeMove',
    role: 'control',
    displayKind: 'whirlwind',
    /**
     * `reach: 'within'`：要塞里最疼的是墙后的远程和盾卫，它们通常不在贴脸格。
     * 「正好 2 格」的环会在敌人贴上来之后失效——那时候更需要它。
     *
     * 削攻击是全游戏第一次把 `atkDown` 用在临时技能上。这一章的伤害压力
     * 主要来自「你在开门，他在射你」，减少挨的那一下比多打一下更解决问题。
     */
    shape: { type: 'neighborPickFoe', manhattan: 2, reach: 'within' },
    damage: { kind: 'none' },
    shopPrice: 7,
    onCastFoeEffects: [{ kind: 'atkDown', subAtk: 6, rounds: 2 }],
  },
  temp_ft_banner: {
    id: 'temp_ft_banner',
    name: '攻城战旗',
    cooldown: 3,
    exclusiveProfession: null,
    timing: 'beforeMove',
    role: 'support',
    displayKind: 'whirlwind',
    /**
     * 给**友方**同时加攻和加速。前两章的友方招是治疗和减伤，都是让人活下来；
     * 这一招是让人打进去——闸门开启的那一回合，把突进的那个人推上去。
     *
     * 加速比加攻重要：这一章的机关要押一个人一整回合，队伍等于少一个输出，
     * 光加攻补不回来；速度让另一个人在同一回合里既走得更远又更早动手。
     */
    shape: { type: 'neighborPickAlly', manhattan: 1 },
    damage: { kind: 'none' },
    shopPrice: 8,
    onCastAllyEffects: [
      { kind: 'atkBonus', addAtk: 5, rounds: 2 },
      { kind: 'spdBonus', addSpd: 3, rounds: 2 },
    ],
  },
  temp_ft_grapple: {
    id: 'temp_ft_grapple',
    name: '飞爪钩索',
    cooldown: 3,
    exclusiveProfession: null,
    timing: 'beforeMove',
    role: 'support',
    displayKind: 'whirlwind',
    shape: { type: 'selfCast' },
    damage: { kind: 'none' },
    shopPrice: 7,
    /**
     * 自身加速，全游戏第一个。它存在的理由是这一章的**代价结构**：
     * 开闸门要押一个人站机关，那个回合队伍就是三打四。
     * 钩索让押上去的人能更快回到战线，把「按机关」的代价从一整回合压回半个回合。
     *
     * 不给嘲讽也不给减伤（那是守林人和庇护的位置）：这一招只管一件事——挪得更快。
     */
    onCastSelfEffects: [{ kind: 'spdBonus', addSpd: 5, rounds: 2 }],
  },
  /**
   * 通用：邻格选一友（不含自身），纯 buff。
   *
   * `reserved` 指的是**没人能把它学进主槽**（第一章六个角色全是输出路线），
   * 不等于用不上——它仍在二至五章的临时技能池里卖，走第二槽。
   * 主槽要等一个辅助路线的角色。
   */
  /**
   * 第二章 Boss 专属：邻格 AoE + **点燃打到的林地**。
   *
   * 整章都在教玩家拿火把烧掉敌人的掩体，这一招把同一个动词交到 Boss 手上：
   * 玩家贴近祭坛用的那几片林子，会在他脚下烧起来。学到的东西因此从
   * 「火能拆掉掩体」升级成「掩体本身是有风险的」——同一个机制的第二层读法，
   * 比再发明一种新地形划算。
   *
   * 倍率压在 0.55（低于血牙咆哮的 0.6）：真正的压力来自烧起来之后的地形掉血
   * 和被迫离开掩体，即时伤再高就会变成「一发 AoE 秒掉后排」。
   */
  wild_burn: {
    id: 'wild_burn',
    name: '燎原咒火',
    cooldown: 3,
    exclusiveProfession: null,
    timing: 'beforeMove',
    role: 'damage',
    enemyOnly: true,
    displayKind: 'whirlwind',
    shape: { type: 'neighborAoE', manhattan: 1 },
    damage: { kind: 'scaledAtk', atkMul: 0.55 },
    onCastTerrainEffects: [{ kind: 'ignite' }],
  },
  /**
   * 第三章 Boss 专属：一条直线犁到底。
   *
   * 和玩家在这一章商店里买的「撞城槌」是**同一个形状**，这是故意的，
   * 沿用第二章那条思路（火把教「火能拆掉掩体」，Boss 的咒火教「掩体本身有风险」）：
   * 玩家先学会拿直线穿透吃走廊的对齐，然后在 Boss 关发现**走廊对双方都成立**——
   * 自己挤在闸门通道里排成一列，正是这一招最想看到的站位。
   *
   * 同一个机制的第二层读法，比再发明一种新招划算。
   *
   * 倍率 0.65 高于前两个 Boss（0.6 / 0.55），因为它有明确的**解法**：
   * 散开就穿不到几个人。有解的高伤是压力，无解的高伤才是惩罚。
   */
  warlord_breach: {
    id: 'warlord_breach',
    name: '破阵冲撞',
    cooldown: 3,
    exclusiveProfession: null,
    timing: 'beforeMove',
    role: 'damage',
    enemyOnly: true,
    displayKind: 'lineShot',
    shape: { type: 'lineBestRayAllFoes' },
    damage: { kind: 'scaledAtk', atkMul: 0.65 },
  },
  /**
   * 法师默认：3 格内点杀。和弓手「速射」同形，差在职业和倍率；
   * 点谁由玩家或 AI 决定，不写进技能。
   */
  ember: {
    id: 'ember',
    name: '炎弹',
    cooldown: 2,
    exclusiveProfession: 'mage',
    timing: 'afterMove',
    role: 'damage',
    displayKind: 'lineShot',
    shape: { type: 'neighborPickFoe', manhattan: 3, reach: 'within' },
    damage: { kind: 'scaledAtk', atkMul: 0.75 },
    shopPrice: 7,
  },
  /**
   * 法师进阶：正好 2 格外的炎环。贴脸反而漏，和炎弹的「3 格内点名」互为另一头。
   * 奥莉是炎系法师，两招都是火；冰系等以后另开角色，不要在她身上混元素。
   */
  flame_ring: {
    id: 'flame_ring',
    name: '炎环',
    cooldown: 3,
    exclusiveProfession: 'mage',
    timing: 'beforeMove',
    role: 'damage',
    displayKind: 'whirlwind',
    shape: { type: 'neighborAoE', manhattan: 2 },
    damage: { kind: 'scaledAtk', atkMul: 0.5 },
    shopPrice: 8,
  },
  /**
   * 祭司默认：2 格内点一名友军，纯治疗。`reach: 'within'` 才能贴脸也救到人。
   * 普攻仍是打敌人的弱远程，治疗只走这一招（有冷却），不会每回合白抬血。
   */
  heal_touch: {
    id: 'heal_touch',
    name: '圣疗',
    cooldown: 2,
    exclusiveProfession: 'healer',
    timing: 'beforeMove',
    role: 'support',
    displayKind: 'whirlwind',
    shape: { type: 'neighborPickAlly', manhattan: 2, reach: 'within' },
    damage: { kind: 'none' },
    shopPrice: 7,
    onCastAllyEffects: [{ kind: 'heal', amount: 28 }],
  },
  /**
   * 祭司进阶：邻格点一名友军，小治疗 + 减伤。
   * 和圣疗的分工是「2 格内大抬」对「贴身护盾」，不是自动点谁。
   */
  ward_prayer: {
    id: 'ward_prayer',
    name: '守护祷言',
    cooldown: 3,
    exclusiveProfession: 'healer',
    timing: 'beforeMove',
    role: 'support',
    displayKind: 'whirlwind',
    shape: { type: 'neighborPickAlly', manhattan: 1 },
    damage: { kind: 'none' },
    shopPrice: 8,
    onCastAllyEffects: [
      { kind: 'heal', amount: 10 },
      { kind: 'guard', reduceRatio: 0.3, rounds: 2 },
    ],
  },
  /**
   * 通用辅助：邻格点一名友军加攻加速。弥尔可学；仍在二至五章商店临时槽卖。
   */
  field_bless: {
    id: 'field_bless',
    name: '战场祝福',
    cooldown: 4,
    exclusiveProfession: null,
    timing: 'beforeMove',
    role: 'support',
    displayKind: 'whirlwind',
    shape: { type: 'neighborPickAlly', manhattan: 1 },
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
  mage: 'ember',
  healer: 'heal_touch',
};

/** 奥莉从「奥术脉冲」收成炎系「炎环」之前的存档 id */
const LEGACY_SKILL_IDS: Record<string, string> = {
  arcane_pulse: 'flame_ring',
};

export function remapLegacySkillId(id: string): string {
  return LEGACY_SKILL_IDS[id] ?? id;
}

export function getSkillSpec(id: string): SkillSpec | undefined {
  return SPECS[remapLegacySkillId(id)];
}

/**
 * 玩家有可能带上场的全部技能（主槽可学 + 商店临时槽）。
 *
 * 敌方专属技能（`enemyOnly`）排除在外：它们不进商店池也不在可学列表里，
 * 玩家侧展示一律走 `enemySkillCatalog` 的皮肤，不要在这里给它们配玩家图标。
 */
export function allPlayerSkillSpecs(): SkillSpec[] {
  return Object.values(SPECS).filter((s) => !s.enemyOnly);
}

/**
 * 技能表全体，**含敌方专属**。给「所有技能都得满足的规则」用（形状/词条自审）。
 *
 * 这些规则对 Boss 招式同样成立，漏掉它们等于 Boss 技能没人校验；
 * 而拿 `allPlayerSkillSpecs()` 再手动 push 回来那几个（原先的做法），
 * 每加一个敌方技能就得记得改一处审计代码。
 */
export function allSkillSpecs(): SkillSpec[] {
  return Object.values(SPECS);
}

/** 各职业开局默认携带的技能 id */
export function defaultSkillId(kind: UnitKind): string {
  return DEFAULT_SKILL_ID_BY_KIND[kind];
}

export function skillDefForId(id: string): SkillDef | undefined {
  const s = SPECS[remapLegacySkillId(id)];
  if (!s) return undefined;
  return { id: s.id, name: s.name, cooldown: s.cooldown, kind: s.displayKind };
}

/** 某职业是否允许学习/携带该技能（通用技 exclusiveProfession === null 恒为 true） */
export function canProfessionEquipSkill(profession: UnitKind, skillId: string): boolean {
  const s = SPECS[remapLegacySkillId(skillId)];
  if (!s) return false;
  if (s.exclusiveProfession === null) return true;
  return s.exclusiveProfession === profession;
}
