import { describe, expect, it } from 'vitest';
import { mainSlotSkillIds } from '@/data/characterCatalog';
import { allPlayerSkillSpecs, getSkillSpec } from '@/data/skillCatalog';
import {
  allSkillMods,
  effectiveSkillSpec,
  exclusiveModsForSkill,
  getSkillMod,
  isExclusiveMod,
  modRollWeight,
} from '@/data/skillModCatalog';

const whirl = () => getSkillSpec('whirl')!;
const hex = () => getSkillSpec('hex_mark')!;

function atkMul(spec: ReturnType<typeof whirl>): number {
  return spec.damage.kind === 'scaledAtk' ? spec.damage.atkMul : NaN;
}

describe('词条折进技能规格', () => {
  it('不带词条时原样返回', () => {
    const s = effectiveSkillSpec(whirl(), undefined);
    expect(atkMul(s)).toBe(atkMul(whirl()));
    expect(s.mods).toBeUndefined();
  });

  it('锋锐按层数线性叠加，不是逐层相乘', () => {
    const base = atkMul(whirl());
    const three = effectiveSkillSpec(whirl(), ['sharpen', 'sharpen', 'sharpen']);
    // +75%，而不是 1.25³ = +95%
    expect(atkMul(three)).toBeCloseTo(base * 1.75, 6);
  });

  it('超过上限的层数被截断', () => {
    const base = atkMul(whirl());
    const many = effectiveSkillSpec(whirl(), Array(9).fill('sharpen'));
    expect(atkMul(many)).toBeCloseTo(base * 1.75, 6);
  });

  it('横扫把邻格整片摊成「2 格以内全覆盖」', () => {
    // 旋风斩本身是 `squareAoE radius:1`（贴身八格含斜角，因为它的特效画的是
    // 盖满 3×3 的刃环，见 skillCatalog.whirl 的说明）。注意**不能**写成
    // `discAoE radius:1`：那个半径量的是曼哈顿距离，打到的和正交四格的环一模一样。
    expect(whirl().shape).toEqual({ type: 'squareAoE', radius: 1 });
    // 横扫摊开后退回曼哈顿整片圆（12 格）而不是更大的方形（24 格，半张图）。
    // 这也保证换尺子没有顺手改掉词条本身的强度——这一行的结果和改形状之前一致。
    const s = effectiveSkillSpec(whirl(), ['wide_swing']);
    expect(s.shape).toEqual({ type: 'discAoE', radius: 2 });
  });

  it('横扫对选点 AoE 扩大爆炸半径而不是改成绕身', () => {
    const ring = getSkillSpec('flame_ring')!;
    expect(ring.shape).toEqual({ type: 'groundPickAoE', castRange: 3, blastRadius: 1 });
    expect(effectiveSkillSpec(ring, ['wide_swing']).shape).toEqual({
      type: 'groundPickAoE',
      castRange: 3,
      blastRadius: 2,
    });
  });

  it('淬毒挂上中毒效果，且层数只体现在每回合伤害上', () => {
    const one = effectiveSkillSpec(whirl(), ['venom']);
    expect(one.onCastFoeEffects).toContainEqual({ kind: 'poison', dmgPerRound: 3, rounds: 2 });

    const two = effectiveSkillSpec(whirl(), ['venom', 'venom']);
    const poisons = (two.onCastFoeEffects ?? []).filter((e) => e.kind === 'poison');
    expect(poisons).toHaveLength(1);
    expect(poisons[0]).toEqual({ kind: 'poison', dmgPerRound: 6, rounds: 2 });
  });

  it('挂不上的词条被跳过，而不是产出一个坏规格', () => {
    // 破甲咒是纯 debuff，没有伤害，「伤害 +25%」对它无意义。
    expect(hex().damage.kind).toBe('none');
    const s = effectiveSkillSpec(hex(), ['sharpen']);
    expect(s.damage).toEqual(hex().damage);
    expect(s.mods).toEqual([]);
  });

  it('折算结果与拿到词条的先后无关', () => {
    const a = effectiveSkillSpec(whirl(), ['venom', 'sharpen', 'wide_swing']);
    const b = effectiveSkillSpec(whirl(), ['wide_swing', 'venom', 'sharpen']);
    expect(a.damage).toEqual(b.damage);
    expect(a.shape).toEqual(b.shape);
    expect(a.onCastFoeEffects).toEqual(b.onCastFoeEffects);
  });

  it('不污染技能表里的共享规格对象', () => {
    const before = JSON.stringify(whirl());
    effectiveSkillSpec(whirl(), ['sharpen', 'venom', 'overwhelm']);
    effectiveSkillSpec(hex(), ['sharpen']);
    expect(JSON.stringify(whirl())).toBe(before);
  });

  it('迅捷不会把冷却压到 0（0 冷却等于每回合白嫖）', () => {
    const s = effectiveSkillSpec(getSkillSpec('lance_thrust')!, ['quick_cast', 'quick_cast']);
    expect(s.cooldown).toBe(1);
  });
});

describe('词条适用性', () => {
  it('横扫只挂 AoE，不挂单体和直线', () => {
    const wide = getSkillMod('wide_swing')!;
    expect(wide.canApply(whirl())).toBe(true);
    expect(wide.canApply(getSkillSpec('cleave')!)).toBe(false);
    expect(wide.canApply(getSkillSpec('pierce')!)).toBe(false);
  });

  // 现在所有技能冷却都 >= 2，所以只能拿一份改过冷却的规格来验闸门本身。
  // 不验的话，哪天加了一招 CD 1 的技能，「迅捷」会变成一张什么都不改的死牌。
  it('迅捷不挂冷却已经压到 1 的技能', () => {
    const quick = getSkillMod('quick_cast')!;
    const bash = getSkillSpec('bash')!;
    expect(quick.canApply(bash)).toBe(true);
    expect(quick.canApply({ ...bash, cooldown: 1 })).toBe(false);
  });

  it('汲取只挂有伤害的技能', () => {
    const siphon = getSkillMod('siphon')!;
    expect(siphon.canApply(whirl())).toBe(true);
    expect(siphon.canApply(getSkillSpec('field_bless')!)).toBe(false);
  });

  /**
   * 被动技能（原「冲锋」）已经不存在了：它占着一个技能位，却因为不走 `cast*`
   * 而对所有「施放后……」的词条免疫，那个角色的三选一常年开天窗。
   * 现在它是长驱突刺的一条专属纹章，闸门反过来由这里守——
   * 被动效果必须是**纹章**给的，不能再有技能拿 `timing: 'passive'` 进主槽。
   */
  it('没有被动技能进得了主槽', () => {
    for (const id of mainSlotSkillIds()) {
      const spec = getSkillSpec(id)!;
      expect(spec.timing, `「${spec.name}」是被动技能，词条挂不上去`).not.toBe('passive');
    }
  });

  it('冲锋降级成纹章之后，践地仍叠在它上面', () => {
    const lance = getSkillSpec('lance_thrust')!;
    expect(lance.passiveBasicAttackMulIfMoved).toBeUndefined();
    expect(effectiveSkillSpec(lance, ['ex_lance_charge']).passiveBasicAttackMulIfMoved)
      .toBeCloseTo(1.35, 6);
    // 践地排在冲锋之后，两条都拿到时是 1.35 + 0.55；顺序反了会被冲锋覆盖掉
    expect(
      effectiveSkillSpec(lance, ['ex_charge_trample', 'ex_lance_charge'])
        .passiveBasicAttackMulIfMoved,
    ).toBeCloseTo(1.9, 6);
  });

  it('嘲讽类词条不挂弓手技能（那是陷阱牌不是强化）', () => {
    const guard = getSkillMod('guard_stance')!;
    expect(guard.canApply(whirl())).toBe(true);
    expect(guard.canApply(getSkillSpec('pierce')!)).toBe(false);
    // 盾卫 strike.taunt 恒为 true，给它的专属技能挂嘲讽等于什么都没加。
    // 这条闸门原先靠「震击自带自嘲讽」拦住，而那个自嘲讽本身就是死效果、后来删了——
    // 判据必须是「主人天生拉不拉仇恨」，不是「这一招有没有写过嘲讽」。
    expect(guard.canApply(getSkillSpec('bash')!)).toBe(false);
    expect(guard.canApply(getSkillSpec('hammer')!)).toBe(false);
  });
});

describe('同类效果相加而不是互相顶掉', () => {
  // 引擎侧 applySkillCastFoeEffects 对同类是「新盖旧」，所以词条侧必须先合成好，
  // 否则给本来带「攻 -4」的破阵斩挂「挫锐」，结果还是 -4：卡选了，战斗里毫无变化。
  it('挫锐叠在自带削攻的技能上是 4+4', () => {
    const s = effectiveSkillSpec(getSkillSpec('blade_rush')!, ['rout']);
    const downs = (s.onCastFoeEffects ?? []).filter((e) => e.kind === 'atkDown');
    expect(downs).toHaveLength(1);
    expect(downs[0]).toEqual({ kind: 'atkDown', subAtk: 8, rounds: 2 });
  });

  it('顽疾延长的是「折算到这一步为止」的全部减益，包括词条加的毒', () => {
    const s = effectiveSkillSpec(getSkillSpec('trample')!, ['venom', 'lasting']);
    for (const e of s.onCastFoeEffects ?? []) {
      expect(e.rounds, `${e.kind} 没被延长`).toBe(3);
    }
  });

  it('妙手抬治疗量，恩泽抬友方增益', () => {
    const salve = effectiveSkillSpec(getSkillSpec('temp_gl_salve')!, ['mend', 'mend']);
    expect(salve.onCastAllyEffects).toContainEqual({ kind: 'heal', amount: 14 + 16 });

    const bless = effectiveSkillSpec(getSkillSpec('field_bless')!, ['blessing']);
    expect(bless.onCastAllyEffects).toContainEqual({ kind: 'atkBonus', addAtk: 7, rounds: 3 });
  });
});

describe('专属词条', () => {
  it('只在它指名的那一招上生效，落到别的技能上就是空的', () => {
    // 斩残原本挂在重劈上；重劈转给敌方之后它搬到了雷恩现在的招牌旋风斩上
    const reap = getSkillMod('ex_cleave_reap')!;
    expect(reap.canApply(whirl())).toBe(true);
    expect(reap.canApply(getSkillSpec('pierce')!)).toBe(false);

    const onPierce = effectiveSkillSpec(getSkillSpec('pierce')!, ['ex_cleave_reap']);
    expect(onPierce.executeBonus).toBeUndefined();
    expect(onPierce.mods).toEqual([]);
    const onWhirl = effectiveSkillSpec(whirl(), ['ex_cleave_reap']);
    expect(onWhirl.executeBonus).toEqual({ belowHpRatio: 0.5, mul: 1.8 });
  });

  /**
   * 位移类专属（长驱 / 冲垒）必须挂在**真有位移**的技能上。
   * 挂错的话卡面写着「突进距离改为 3 格」，而那一招根本不推人——
   * 这种空词条在战斗里没有任何提示，玩家只会以为自己看错了。
   */
  it('加位移距离的专属只挂带位移的技能', () => {
    const far = getSkillMod('ex_lance_farcharge')!;
    expect(far.canApply(getSkillSpec('lance_thrust')!)).toBe(true);
    expect(effectiveSkillSpec(getSkillSpec('lance_thrust')!, ['ex_lance_farcharge']).onHitDisplace)
      .toEqual({ who: 'self', cells: 3 });

    const hurl = getSkillMod('ex_bash_hurl')!;
    expect(effectiveSkillSpec(getSkillSpec('bash')!, ['ex_bash_hurl']).onHitDisplace)
      .toEqual({ who: 'target', cells: 3 });
    expect(hurl.canApply(whirl())).toBe(false);
  });

  /** 射程类专属同理：技能没有射程上限时，「延长到 7 格」是把它**削弱**了 */
  it('加射程的专属只挂有射程上限的射线技能', () => {
    const longshot = getSkillMod('ex_pierce_longshot')!;
    const pierce = getSkillSpec('pierce')!;
    expect(longshot.canApply(pierce)).toBe(true);
    expect(effectiveSkillSpec(pierce, ['ex_pierce_longshot']).shape)
      .toEqual({ type: 'lineBestRayAllFoes', range: 7 });
    // 洞穿之后上限整个消失
    expect(effectiveSkillSpec(pierce, ['ex_pierce_endless']).shape)
      .toEqual({ type: 'lineBestRayAllFoes' });
    expect(longshot.canApply({ ...pierce, shape: { type: 'lineBestRayAllFoes' } })).toBe(false);
  });

  /**
   * 范围是**主槽技能**，不是 `allPlayerSkillSpecs()`。
   *
   * 词条只强化主技能，所以给只进临时槽的 `temp_gl_*` 配专属词条等于写永远发不出来的
   * 内容——它连候选池都进不去。反过来主槽少一条专属，那个角色一整局都遇不上
   * 「这招的招牌强化」，而这正是加技能时最容易漏的一步。
   */
  it('每个能进主槽的技能都至少有一条专属词条', () => {
    for (const id of mainSlotSkillIds()) {
      const spec = getSkillSpec(id)!;
      const own = exclusiveModsForSkill(id);
      expect(own.length, `技能「${spec.name}」还没有专属词条`).toBeGreaterThan(0);
      for (const m of own) {
        expect(m.canApply(spec), `专属词条「${m.name}」挂不上它自己的技能`).toBe(true);
      }
    }
  });

  /**
   * 允许挂在**预留**技能上（`SkillSpec.reserved`）：破甲咒 / 盾墙震慑 / 战吼
   * 现在没角色能学，但对应路线的角色一上线就用得上，那批专属词条不算死牌。
   * 挡的是另一种：挂在只进临时槽的 `temp_gl_*` 上——词条只强化主技能，
   * 那种内容永远进不了候选池。战场祝福已由祭司弥尔学，不再算预留。
   */
  it('专属词条只挂在进得了主槽的技能上（含预留技能）', () => {
    const reachable = new Set(mainSlotSkillIds());
    for (const spec of allPlayerSkillSpecs()) {
      if (spec.reserved) reachable.add(spec.id);
    }
    for (const m of allSkillMods()) {
      if (m.scope.kind !== 'exclusive') continue;
      for (const id of m.scope.skillIds) {
        expect(reachable.has(id), `专属词条「${m.name}」挂在永远进不了主槽的 ${id} 上`).toBe(true);
      }
    }
  });

  it('一律只有一层：专属是质变，不是数值更大的普通词条', () => {
    for (const m of allSkillMods()) {
      if (!isExclusiveMod(m)) continue;
      expect(m.maxStacks, `专属词条「${m.name}」允许叠层`).toBe(1);
    }
  });

  it('专属先应用、普通后叠加，两张牌都算数', () => {
    // 破军把削攻改写为 -10，挫锐再往上加 4；顺序反了的话挫锐会被抹掉
    const s = effectiveSkillSpec(getSkillSpec('blade_rush')!, ['ex_blade_rush_break', 'rout']);
    expect(s.onCastFoeEffects).toContainEqual({ kind: 'atkDown', subAtk: 14, rounds: 3 });
  });

  it('改形状的专属把单体 debuff 变成群体', () => {
    const s = effectiveSkillSpec(hex(), ['ex_hex_spread']);
    expect(s.shape).toEqual({ type: 'discAoE', radius: 2 });
    expect(s.onCastFoeEffects).toEqual(hex().onCastFoeEffects);
  });
});

/**
 * 技能定位是**声明出来的**，词条按定位投放。
 *
 * 这一组存在的原因是一个真实的翻车：「惊扰蜂群」主功能是群体中毒，为了让飘字有东西可飘
 * 带了 8 点即时伤，于是 `damage.kind !== 'none'` 判它是伤害技能，三选一给它发
 * 「锋锐：技能伤害提升 25%」，把 8 点抬成 10 点。机制合法，玩家读起来荒谬。
 */
describe('技能定位与词条投放', () => {
  /** 只有 `role === 'damage'` 才该吃的那几条 */
  const OUTPUT_MODS = ['sharpen', 'siphon', 'splash', 'execute', 'bloodthirst', 'relentless', 'overwhelm'];

  it('输出向词条只投给定位是伤害的技能', () => {
    for (const id of mainSlotSkillIds()) {
      const spec = getSkillSpec(id)!;
      if (spec.role === 'damage') continue;
      for (const modId of OUTPUT_MODS) {
        expect(
          getSkillMod(modId)!.canApply(spec),
          `「${spec.name}」定位是 ${spec.role}，不该吃「${getSkillMod(modId)!.name}」`,
        ).toBe(false);
      }
    }
  });

  it('惊扰蜂群这类「带一点飘字伤害的控制技」不吃锋锐', () => {
    const swarm = getSkillSpec('temp_gl_swarm')!;
    // 它确实有伤害——所以光靠 isDamaging 是挡不住的，这正是要 role 的理由
    expect(swarm.damage.kind).not.toBe('none');
    expect(swarm.role).toBe('control');
    expect(getSkillMod('sharpen')!.canApply(swarm)).toBe(false);
    // 但控制向的词条该给它：毒技能加毒、加减速都读得通
    expect(getSkillMod('venom')!.canApply(swarm)).toBe(true);
    expect(getSkillMod('lasting')!.canApply(swarm)).toBe(true);
  });

  /**
   * 「冲锋」的伤害不在 `damage` 字段上，它靠 `passiveBasicAttackMulIfMoved` 放大普攻——
   * 定位仍然是输出，只是触发方式是被动。所以这里认两种伤害来源。
   */
  it('定位写成伤害的技能必须真有伤害来源，否则闸门是空的', () => {
    for (const id of mainSlotSkillIds()) {
      const spec = getSkillSpec(id)!;
      if (spec.role !== 'damage') continue;
      const dealsDamage =
        spec.damage.kind !== 'none' || spec.passiveBasicAttackMulIfMoved !== undefined;
      expect(dealsDamage, `「${spec.name}」定位是伤害却没有任何伤害来源`).toBe(true);
    }
  });

  /**
   * 收紧闸门最容易的副作用是把某一招的候选池收干：那个角色的三选一会一路发药剂。
   * 三条是下限——够凑出一屏不重复的三选一。
   *
   * 「冲锋」正卡在这条线上（蓄势 ×2 + 践地），因为被动没有「施放」这个挂载点，
   * 一切挂在施放上的词条对它都是死牌。骑兵拿满三层之后就只能出药剂了，
   * 补法是给被动系加杠杆或加专属词条，不是放宽这里的下限。
   */
  it('每个主槽技能都还有至少 3 条词条可拿，不会开天窗', () => {
    for (const id of mainSlotSkillIds()) {
      const spec = getSkillSpec(id)!;
      const usable = allSkillMods().filter((m) => m.canApply(spec));
      expect(usable.length, `「${spec.name}」只剩 ${usable.length} 条词条可拿`).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('抽卡权重', () => {
  const w = (id: string, depth = 0) => modRollWeight(getSkillMod(id)!, depth);

  it('稀有度决定基础权重，越稀有越难出', () => {
    expect(w('sharpen')).toBeGreaterThan(w('venom'));
    expect(w('venom')).toBeGreaterThan(w('overwhelm'));
  });

  it('专属词条同稀有度下权重更高（每招只有一两条，不加权基本见不到）', () => {
    // 两条都是稀有：只差在专属加权上
    expect(w('ex_whirl_momentum')).toBeGreaterThan(w('venom'));
  });

  it('节点越深，史诗相对普通越常见', () => {
    const shallow = w('overwhelm', 0) / w('sharpen', 0);
    const deep = w('overwhelm', 5) / w('sharpen', 5);
    expect(deep).toBeGreaterThan(shallow);
  });
});

describe('词条描述', () => {
  it('每一层都说得出具体数值，且层数不同描述不同', () => {
    for (const m of allSkillMods()) {
      for (let n = 1; n <= m.maxStacks; n += 1) {
        expect(m.describe(n).length, `词条「${m.name}」第 ${n} 层没有描述`).toBeGreaterThan(0);
      }
      if (m.maxStacks > 1) {
        expect(
          m.describe(1) !== m.describe(m.maxStacks),
          `词条「${m.name}」叠满和一层描述一样，玩家看不出叠了有什么用`,
        ).toBe(true);
      }
    }
  });

  it('词条 id 不重复', () => {
    const ids = allSkillMods().map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
