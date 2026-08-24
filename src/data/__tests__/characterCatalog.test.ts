import { describe, expect, it } from 'vitest';
import { CHARACTER_DEFS, canCharacterUseSkill, characterArtKey, mainSlotSkillIds } from '@/data/characterCatalog';
import { canProfessionEquipSkill, getSkillSpec } from '@/data/skillCatalog';
import { hasAnimSet } from '@/view/animSets';

/**
 * 一人一招：每个角色有且只有一个招牌技能，路线标签必须和它对得上。
 *
 * 曾经每个角色还带一条「可学技能列表」，在布阵页免费轮换。那套东西和纹章系统
 * 有个解不开的矛盾——纹章按角色存、按当前主技能判定生效，中途换招会让攒了一路的
 * 专属纹章批量静默休眠。当时用「同路线内定位一致」去压，压不住：专属纹章咬的是
 * 具体机制（AoE 才有横扫、点杀才有处决），同定位的两招照样互不兼容。
 * 收成一招之后矛盾从根上没了，`skillRoute` 退化成一个身份标签，
 * 它唯一的职责就是在数据表和技能表对不上时立刻报错。
 */
describe('角色招牌技能', () => {
  it('招牌技能存在，且定位等于角色路线', () => {
    for (const c of CHARACTER_DEFS) {
      const spec = getSkillSpec(c.defaultSkillId);
      expect(spec, `${c.name} 的招牌技能 ${c.defaultSkillId} 不在技能表里`).toBeDefined();
      expect(
        spec!.role,
        `${c.name} 路线是 ${c.skillRoute}，招牌技能「${spec!.name}」却是 ${spec!.role}`,
      ).toBe(c.skillRoute);
    }
  });

  it('角色外观图集已注册，同职业两人不能共用一张脸', () => {
    const seen = new Map<string, string>();
    for (const c of CHARACTER_DEFS) {
      const key = characterArtKey({ rosterId: c.id, profession: c.profession });
      expect(hasAnimSet(key), `${c.name} 的外观 ${key} 没登记`).toBe(true);
      const prev = seen.get(key);
      expect(prev, `${c.name} 和 ${prev} 共用外观 ${key}`).toBeUndefined();
      seen.set(key, c.name);
    }
  });

  it('招牌技能这个职业带得动', () => {
    for (const c of CHARACTER_DEFS) {
      expect(
        canProfessionEquipSkill(c.profession, c.defaultSkillId),
        `${c.name}（${c.profession}）带不了 ${c.defaultSkillId}`,
      ).toBe(true);
    }
  });

  /**
   * `reserved` 的意思是「已实现但当前没有主人」。它同时出现在某个角色的招牌位上，
   * 说明有人把一招从别人身上摘下来时忘了把标记撤掉——而这不报错，
   * 只会让那一招同时处于「在等新角色」和「已经有角色了」两种状态。
   */
  it('招牌技能不能是预留技能或敌方专属技能', () => {
    for (const c of CHARACTER_DEFS) {
      const spec = getSkillSpec(c.defaultSkillId)!;
      expect(spec.reserved ?? false, `${c.name} 的招牌「${spec.name}」还标着 reserved`).toBe(false);
      expect(spec.enemyOnly ?? false, `${c.name} 的招牌「${spec.name}」标了 enemyOnly`).toBe(false);
    }
  });

  it('主槽技能池就是每个角色的招牌技能，不含预留技能', () => {
    const ids = mainSlotSkillIds();
    expect(ids).toHaveLength(CHARACTER_DEFS.length);
    for (const id of ids) {
      expect(getSkillSpec(id)!.reserved ?? false, `${id} 标了 reserved 却进了主槽池`).toBe(false);
    }
  });
});

/**
 * 角色之间必须有**结构**差异，不能只差数值。
 *
 * 这条纪律原先守的是「同一个角色的可学列表里不要摆两个数值档」——「震击」和「铁锤」
 * 就那么并存过很久：同为邻格点杀、同为 3 回合冷却、同样挂一个（对盾卫无效的）自嘲讽，
 * 区别只有 0.85 对 0.9 的倍率，价钱还一样。那不叫两个选择，叫一个升级。
 *
 * 一人一招之后，同一个角色内部已经没有「两招」可比了，这条纪律该守的东西整个平移到
 * **角色之间**，而且变得更硬：招牌技能就是角色的玩法本身，两个角色打法指纹一样，
 * 意味着队伍里带谁都一个样，那是比「换招换不出花样」严重得多的问题。
 *
 * 差异必须落在**打法**上：形状、够得着哪里、什么时机、附带什么效果、有没有位移。
 * 倍率和冷却是在打法差异之上调味用的，不能拿来充当唯一的区别。
 */
describe('角色之间的打法不能撞车', () => {
  /** 一招的打法指纹，**刻意不含**伤害数值和冷却 */
  function playstyleKey(id: string): string {
    const spec = getSkillSpec(id)!;
    const shape = spec.shape;
    // 穷举 switch：加新形状时编译器会指出这里没处理，而不是静默把新形状
    // 和别的形状算成同一个指纹
    const shapeKey = ((): string => {
      switch (shape.type) {
        case 'neighborAoE':
          return `ring:${shape.manhattan}`;
        case 'discAoE':
          return `disc:${shape.radius}`;
        // 方形和同半径的环/圆是**不同**指纹：只有它打得到斜角
        case 'squareAoE':
          return `square:${shape.radius}`;
        case 'neighborPickFoe':
          return `pickFoe:${shape.manhattan}:${shape.reach ?? 'exact'}:${shape.axisOnly ? 'axis' : 'free'}`;
        case 'neighborPickAlly':
          return `pickAlly:${shape.manhattan}:${shape.reach ?? 'exact'}`;
        case 'lineBestRayAllFoes':
          return `line:${shape.range ?? 'inf'}`;
        case 'groundPickAoE':
          return `ground:${shape.castRange}:${shape.blastRadius}`;
        case 'selfCast':
          return 'self';
      }
    })();
    const kinds = (list: readonly { kind: string }[] | undefined): string =>
      [...(list ?? []).map((e) => e.kind)].sort().join('+') || '-';
    return [
      shapeKey,
      spec.timing,
      kinds(spec.onCastFoeEffects),
      kinds(spec.onCastSelfEffects),
      kinds(spec.onCastAllyEffects),
      spec.onHitDisplace ? `push:${spec.onHitDisplace.who}` : '-',
      spec.passiveBasicAttackMulIfMoved === undefined ? '-' : 'movePassive',
    ].join(' | ');
  }

  it('任意两个角色的招牌技能打法不同', () => {
    const seen = new Map<string, string>();
    for (const c of CHARACTER_DEFS) {
      const key = playstyleKey(c.defaultSkillId);
      const prev = seen.get(key);
      expect(
        prev,
        `${c.name} 和 ${prev} 的招牌技能打法完全一样（${key}），只差数值——带谁都一个样`,
      ).toBeUndefined();
      seen.set(key, c.name);
    }
  });

  /**
   * 单体招牌必须压过普攻。范围技可以低于 100%（按人头均价），
   * 但点杀写成 70% 和普攻并排放，读起来像这一招更弱。
   */
  it('招牌单体伤害技的倍率高于普攻', () => {
    for (const c of CHARACTER_DEFS) {
      const spec = getSkillSpec(c.defaultSkillId)!;
      if (spec.damage.kind !== 'scaledAtk') continue;
      if (spec.shape.type !== 'neighborPickFoe') continue;
      expect(
        spec.damage.atkMul,
        `${c.name} 的「${spec.name}」是单体却只有攻击力×${Math.round(spec.damage.atkMul * 100)}%`,
      ).toBeGreaterThan(1);
    }
  });
});

/**
 * 路线约束必须**在运行时**也拦得住，不能只靠数据表配得对。
 *
 * 具体要防的是老存档：一人一招之后 `activeSkillId` 不再入档，但存档里其它地方
 * （比如试炼场的 `runEquip`）仍可能留着当年学到的越界技能。只查职业的话它照样带得上场，
 * 而这种漏法不报错——只会让那个角色的纹章莫名休眠。
 */
describe('带得动这一招吗（canCharacterUseSkill）', () => {
  const gron = CHARACTER_DEFS.find((c) => c.id === 'hero_shield_gron')!;
  const rein = CHARACTER_DEFS.find((c) => c.id === 'hero_sword_ray')!;
  const mir = CHARACTER_DEFS.find((c) => c.id === 'hero_healer_mir')!;
  const aoli = CHARACTER_DEFS.find((c) => c.id === 'hero_mage_aoli')!;

  it('自己的招牌技能可以带', () => {
    expect(canCharacterUseSkill(gron, 'bash')).toBe(true);
    expect(canCharacterUseSkill(rein, 'whirl')).toBe(true);
    expect(canCharacterUseSkill(mir, 'heal_touch')).toBe(true);
    expect(canCharacterUseSkill(aoli, 'ember')).toBe(true);
  });

  it('挡掉跨定位的技能：老档学过的战场祝福不能再装', () => {
    // field_bless 是通用技能（任何职业都过得了职业校验），只有路线校验挡得住
    expect(canProfessionEquipSkill(gron.profession, 'field_bless')).toBe(true);
    expect(canCharacterUseSkill(gron, 'field_bless')).toBe(false);
  });

  it('挡掉预留技能：盾墙震慑在等控制路线的盾卫，破阵斩在等第二个剑士', () => {
    expect(canProfessionEquipSkill(gron.profession, 'shield_wall')).toBe(true);
    expect(canCharacterUseSkill(gron, 'shield_wall')).toBe(false);
    expect(canCharacterUseSkill(rein, 'blade_rush')).toBe(false);
  });

  it('挡掉已经转给敌人的那几招：老档里格隆的铁锤带不上场了', () => {
    expect(canProfessionEquipSkill(gron.profession, 'hammer')).toBe(true);
    expect(canCharacterUseSkill(gron, 'hammer')).toBe(false);
    expect(canCharacterUseSkill(rein, 'cleave')).toBe(false);
  });

  it('挡掉别的职业的技能', () => {
    expect(canCharacterUseSkill(gron, 'whirl')).toBe(false);
    expect(canCharacterUseSkill(rein, 'pierce')).toBe(false);
    expect(canCharacterUseSkill(mir, 'ember')).toBe(false);
    expect(canCharacterUseSkill(aoli, 'heal_touch')).toBe(false);
  });
});
