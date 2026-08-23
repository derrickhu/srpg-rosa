/** 参与三角克制、出现在关卡刷怪表里的四兵种 */
export type TroopKind = 'sword' | 'bow' | 'cavalry' | 'shield';

/** 兵种标识。法师 / 祭司不参与三角克制，也不进关卡刷怪表 */
export type UnitKind = TroopKind | 'mage' | 'healer';

export type Faction = 'player' | 'enemy';

export interface Vec2 {
  x: number;
  y: number;
}

export type SkillKind = 'whirlwind' | 'lineShot' | 'singleBash' | 'passiveCharge';

export interface SkillDef {
  id: string;
  name: string;
  /** 释放后冷却：每回合开始 -1，至 0 可再放 */
  cooldown: number;
  kind: SkillKind;
  /**
   * 展示用图标 key（敌方技能皮肤会覆写）。缺省按 `skill_${id}` 取。
   * 结算不读这个字段——伤害形状只认 `id` → SkillSpec。
   */
  iconKey?: string;
  /**
   * `SKILL_VFX` 查找键（敌方技能皮肤会覆写）。缺省 = `id`。
   * 同样只影响表现，不影响结算。
   */
  vfxId?: string;
}

/** 兵种 / 人物「基础」面板（精华等只应加成此项） */
export interface UnitBaseBlock {
  maxHp: number;
  atk: number;
  spd: number;
  move: number;
}

/**
 * 战斗内限时效果（技能施放、将来道具等）。
 * `roundsLeft` 在战局每轮开始（engine 里 `round` 事件前）统一 -1，至 0 移除。
 */
export type TimedBattleEffect =
  | { kind: 'taunt'; roundsLeft: number }
  | { kind: 'poison'; dmgPerRound: number; roundsLeft: number; theme?: 'poison' | 'frost' }
  | { kind: 'atkBonus'; addAtk: number; roundsLeft: number }
  | { kind: 'atkDown'; subAtk: number; roundsLeft: number }
  | { kind: 'spdDown'; subSpd: number; roundsLeft: number }
  | { kind: 'spdBonus'; addSpd: number; roundsLeft: number }
  /**
   * 减伤：本次受到的攻击/技能伤害 ×(1 - `reduceRatio`)。
   *
   * 这是整套效果词汇里**唯一**的防御动词。在它之前，友方增益只有增攻、增速、
   * 治疗三种——全是「打得更多」或「打完再补」，玩家没有任何「这一下我扛住」的手段。
   * 而地形早就有 `defMul` 了，所以「减伤」这个概念对玩家并不新，只是技能侧一直缺。
   *
   * 用比例而不是固定减值：固定减值对小怪的一刀（15 点）和 Boss 的一刀（40 点）
   * 效果差一个量级，抬到能扛住 Boss 就等于让小怪完全打不动。
   */
  | { kind: 'guard'; reduceRatio: number; roundsLeft: number };

/** 普攻相关（射程、远程规则、普攻嘲讽）；与 `SkillSpec.shape` 无关 */
export interface UnitStrikeBlock {
  range: number;
  isRanged: boolean;
  taunt: boolean;
}

/** 兵种表一行：基础 + 普攻拆分 */
export interface UnitArchetypeDef {
  id: UnitKind;
  name: string;
  base: UnitBaseBlock;
  strike: UnitStrikeBlock;
}

/** 战斗用合并面板（由 `effectiveUnitDef` 从 archetype + 状态算出） */
export interface UnitDef {
  id: UnitKind;
  name: string;
  maxHp: number;
  atk: number;
  spd: number;
  move: number;
  range: number;
  isRanged: boolean;
  /** 自动索敌用：普攻 `strike.taunt` 或限时 `taunt` 效果，见 `effectiveUnitDef` */
  taunt: boolean;
  /**
   * 作为**目标**时的伤害倍率，由限时 `guard` 效果算出；无减伤时为 1。
   *
   * 必填而不是可选：这个面板只有 `effectiveUnitDef` 一个正经生产者，而它一旦漏算，
   * 表现是减伤静默失效——技能放了、飘字有了、伤害没变。让编译器盯着，
   * 比等玩家发现「这个盾好像没用」要好。
   *
   * 放在 `UnitDef` 而不是在结算时读 `UnitState`，是为了让 AI 的伤害预估自动跟上：
   * AI 全程通过 `effectiveUnitDef` 看人，所以它会知道套了盾的目标更难杀，
   * 从而改去打别人——不然玩家的减伤只是在数值上生效，在 AI 眼里根本不存在。
   */
  damageTakenMul: number;
  skill?: SkillDef;
  /** 第二技能槽，见 `UnitState.tempSkill` */
  tempSkill?: SkillDef;
}

export interface UnitState {
  uid: string;
  defId: UnitKind;
  faction: Faction;
  hp: number;
  pos: Vec2;
  /** 主技能剩余冷却，0 表示可用 */
  skillCd: number;
  /** 本回合是否已沿路径移动过（骑兵普攻加成） */
  movedInTurn: boolean;
  /** 本场覆盖兵种表上的主技能（布阵配置） */
  battleSkill?: SkillDef;
  /**
   * 临时技能（第二槽，局内商店购买）。和主技能**共用**每回合一次的施放额度，
   * 所以它加的是「多一个选项」而不是「多一次出手」——后者会直接改变行动经济，
   * 整条难度曲线都要重调。
   */
  tempSkill?: SkillDef;
  /** 临时技能剩余冷却；两槽冷却各自独立计时 */
  tempSkillCd?: number;
  /**
   * 本场生效的技能词条 id（战前由 `run.skillMods` 烘焙进来，见 `unitSkillSpec`）。
   *
   * 存在单位上而不是让引擎去读 run 状态：引擎不认识 run，敌方单位也能挂词条（Boss 强化），
   * 且模拟器可以直接构造带词条的单位跑数值。
   */
  skillMods?: string[];
  /** 精华等：仅加成「基础」atk/spd/move（部署累计） */
  bonusAtk?: number;
  bonusSpd?: number;
  bonusMove?: number;
  /** 佣兵系统：稳定 id / 显示名 */
  rosterId?: string;
  displayName?: string;
  /** Boss：战场放大体型 + 头顶显示专名 */
  boss?: boolean;
  /**
   * 覆盖动画集 id（缺省用 defId）。Boss/精英复用职业 defId 拿数值与克制关系，
   * 但要走自己的美术，见 src/view/animSets.ts。
   */
  animSet?: string;
  /** 覆盖兵种基础面板 */
  mercMaxHp?: number;
  mercAtk?: number;
  mercSpd?: number;
  mercMove?: number;
  /** 覆盖普攻面板 */
  mercRange?: number;
  mercIsRanged?: boolean;
  mercTaunt?: boolean;
  /** 战斗中限时 buff/debuff（含技能施放产生的嘲讽等） */
  timedBattleEffects?: TimedBattleEffect[];
}

export type TerrainId =
  | 'plain'
  | 'high'
  | 'forest'
  | 'river'
  | 'swamp'
  | 'wall'
  | 'abyss'
  // 机关与闸门：关卡底图直接摆，闸门初始是 gate_closed
  | 'lever'
  | 'gate_closed'
  | 'gate_open'
  // 以下是战斗中由地形转移产生的**中间态**，关卡底图一般不直接摆（见 terrainSpec 的转移边）
  | 'burning'
  | 'scorched';

/** 地形发生转移的原因，只用于回放飘字选词 */
export type TerrainChangeReason = 'ignite' | 'burnout' | 'gate';

export interface CellTerrain {
  terrain: TerrainId;
}

export type SkillHit = {
  target: string;
  damage: number;
  hpLeft: number;
  /** 该目标所站地形对这一下的影响，如「森林 -25%」；无影响时缺省。逐目标记录，AoE 里每格可能不同 */
  defTerrainNote?: string;
  /**
   * 词条在这一击上**条件触发**了什么，如「处决」。逐目标记录：同一次 AoE 里
   * 只有残血的那个吃到处决。
   *
   * 条件触发的词条不飘字就等于不存在——玩家看到的只是一个更大的数字，
   * 而他没有「没触发时是多少」可以比。纯数值型的词条（锋锐）不进这里，
   * 它每次都生效，飘一行「锋锐」只是噪音。
   */
  modNote?: string;
  /** 该目标身上限时减伤对这一下的影响，如「减伤 -25%」；逐目标记录，同 `defTerrainNote` */
  guardNote?: string;
  /**
   * 这一击给目标挂上了中毒。回放层据此叠紫雾，不事后再去读规格——
   * 溅射只溅伤害不溅 debuff，溅射 hit 不会带这个。
   */
  poisoned?: true;
  /**
   * 溅射命中（不是主目标）。回放层据此叠「周围伤」闪光，
   * 主目标只播技能自己的命中，避免主目标身上两套特效糊在一起。
   */
  splash?: true;
};

export type BattleEvent =
  | { type: 'round'; round: number }
  /**
   * 某个单位的回合开始。人工模式下视图靠它切到「等玩家下指令」，并高亮行动者。
   *
   * 敌方回合也发。回放层原来是从 `moveRange` 反推当前行动者的，但不移动的单位不发
   * 那个事件，于是「现在轮到谁」这件事时有时无——行动顺序条要靠它，缺一次就会指错人。
   */
  | { type: 'turnStart'; uid: string; faction: Faction }
  /** 移动前：本回合单位可达格（与程序决策相同 BFS 规则） */
  | { type: 'moveRange'; uid: string; cells: Vec2[] }
  | { type: 'moveStep'; uid: string; from: Vec2; to: Vec2 }
  /**
   * 技能造成的**强制位移**：长驱突刺的突进（移动的是施法者）、震击的击退（移动的是目标）。
   *
   * 和 `moveStep` 分开是因为这两件事在每一层都不一样：
   * - 结算上它不花移动力、不受 `move` 上限约束、可以把人推到本来走不到的格子上；
   * - 回放上它是一次**整段滑行**而不是逐格走，脚步动画也不该播；
   * - 引擎里它会让 `pending.startPos` 失效（见 `engine.applyDisplacements`）。
   *
   * `from` / `to` 都写全而不是只写终点：回放层要拿它插值，而它拿到这个事件时
   * 单位的 `pos` 早已是终点了（自动模式先跑完整场再逐条播）。
   */
  | { type: 'displace'; uid: string; from: Vec2; to: Vec2; reason: 'dash' | 'knockback' }
  | {
      type: 'skillCast';
      uid: string;
      skillId: string;
      skillName: string;
      kind: SkillKind;
      /** 施放前展示的技能作用/瞄准范围（格子坐标） */
      rangeCells: Vec2[];
      /**
       * 选点 AoE 的爆炸中心。回放层拿它锚特效，而不是锚第一个被打到的人——
       * 空地点火时根本没有 hit，不写这个字段特效会落到施法者脚上。
       */
      aimCell?: Vec2;
      /**
       * 词条改过特效键时写在这里（如炎弹「爆炎」→ `ember_bloom`）。
       * 回放层优先读它，不要事后再去折规格——自动模式整场跑完再播，那时再算会偏。
       */
      vfxId?: string;
      hits: SkillHit[];
      /** 施法者所站地形对伤害的影响，如「高地 +25%」；无影响时缺省 */
      atkTerrainNote?: string;
    }
  | {
      type: 'attack';
      attacker: string;
      target: string;
      damage: number;
      hpLeft: number;
      /** 回放/UI 用，如「普攻」；缺省仍可按普攻处理 */
      attackLabel?: string;
      /**
       * 这一下吃到了冲锋的移动加成（骑兵被动）。回放层据此加播速度光环。
       *
       * 为什么走事件而不是回放时读 `movedInTurn`：自动模式下 `runToEnd` 会把整场跑完
       * 再逐条播，那时候单位状态早就不是这一击发生时的状态了。
       */
      charged?: boolean;
      /**
       * 地形归因文案，由引擎从 `terrainSpec` 现算（见 `damage.terrainAttackNote`）。
       * 回放层只负责把它飘出来，不要在视图里另写一份百分比，否则调地形数值时两边会飘。
       */
      atkTerrainNote?: string;
      defTerrainNote?: string;
      /**
       * 目标身上限时减伤的归因文案（见 `damage.guardNote`）。
       *
       * 和地形减伤分开两个字段，因为两者会同时生效（森林里的人又套了盾），
       * 合成一句就说不清少掉的伤害该记在哪一层——而玩家要判断的恰恰是
       * 「这个盾值不值得占一次施放」。
       */
      guardNote?: string;
    }
  | { type: 'death'; uid: string }
  /** 敌人倒下时掉在死亡格上的药剂（无尽试炼） */
  | { type: 'drop'; pos: Vec2; potionId: string }
  /** 走到掉落格上待机后拾取 */
  | { type: 'pickup'; uid: string; pos: Vec2; potionId: string }
  /**
   * 轮首持续伤害（中毒 / 沼泽等）。
   *
   * 以前这类扣血只改 `hp` 不发事件，表现是血条无缘无故短一截，玩家对不上原因。
   * 「淬毒」词条要是也这样，就完全看不出选它有什么用。
   */
  | { type: 'dot'; uid: string; damage: number; hpLeft: number; source: 'poison' | 'terrain' }
  /** 治疗（药剂、吸血等）：单个目标回复 */
  | { type: 'heal'; target: string; amount: number; hpLeft: number }
  /**
   * 限时增益/减益刚挂上时的飘字（药剂攻、迟缓等）。
   * 只改 `timedBattleEffects` 不发事件的话，玩家会以为药没用。
   */
  | { type: 'statusNote'; target: string; text: string; tone: 'buff' | 'debuff' }
  /** 玩家在战斗中使用药剂（回放显示用） */
  | { type: 'potion'; potionId: string; name: string }
  /**
   * 一格地形变了（森林被点燃、燃烧烧尽成焦土……）。
   *
   * 走事件而不是让回放层去 diff 地形矩阵：自动模式下 `runToEnd` 会把整场跑完再逐条播，
   * 那时候地形早就是终局状态了，diff 不出中间过程。而地形转移恰恰是要**看见因果**的
   * ——玩家得看到自己那一发火点着了哪几格，否则「烧掉掩体」这件事和凭空掉血没区别。
   */
  | {
      type: 'terrain';
      x: number;
      y: number;
      from: TerrainId;
      to: TerrainId;
      reason: TerrainChangeReason;
    }
  | { type: 'end'; winner: Faction };

export interface BattleReport {
  events: BattleEvent[];
  winner: Faction;
  rounds: number;
}
