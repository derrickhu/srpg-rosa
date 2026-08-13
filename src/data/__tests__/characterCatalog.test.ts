import { describe, expect, it } from 'vitest';
import { CHARACTER_DEFS, canCharacterUseSkill, mainSlotSkillIds } from '@/data/characterCatalog';
import { canProfessionEquipSkill, getSkillSpec } from '@/data/skillCatalog';

/**
 * 角色技能路线：一个角色能带的**所有**技能定位必须一致。
 *
 * 这组测试守的是一条玩法口径，不是数据洁癖。词条按人存、按当前主技能判定生效，
 * 而主技能在布阵页随时能免费换——如果一个角色的可学列表里混着不同定位的技能，
 * 玩家换一次主技能就会让攒了一路的词条批量静默休眠，界面上只有背包页一行小字。
 * 路线内定位一致之后这个状态根本进不去，那个切换按钮才是纯战术选择。
 *
 * 这条最容易在**加角色**时破：复制上一个角色的定义再改数值，可学列表跟着复制过来，
 * 而新角色的路线可能压根不一样。
 */
describe('角色技能路线', () => {
  it('默认技能的定位就是这个角色的路线', () => {
    for (const c of CHARACTER_DEFS) {
      const spec = getSkillSpec(c.defaultSkillId);
      expect(spec, `${c.name} 的默认技能 ${c.defaultSkillId} 不在技能表里`).toBeDefined();
      expect(
        spec!.role,
        `${c.name} 路线是 ${c.skillRoute}，默认技能「${spec!.name}」却是 ${spec!.role}`,
      ).toBe(c.skillRoute);
    }
  });

  it('可学技能的定位全部等于路线', () => {
    for (const c of CHARACTER_DEFS) {
      for (const id of c.unlockableSkillIds) {
        const spec = getSkillSpec(id);
        expect(spec, `${c.name} 的可学技能 ${id} 不在技能表里`).toBeDefined();
        expect(
          spec!.role,
          `${c.name} 路线是 ${c.skillRoute}，可学的「${spec!.name}」却是 ${spec!.role}——` +
            '换到它身上会让伤害类词条批量休眠',
        ).toBe(c.skillRoute);
      }
    }
  });

  it('可学技能不能是预留技能：那些在等对应路线的角色', () => {
    for (const c of CHARACTER_DEFS) {
      for (const id of c.unlockableSkillIds) {
        const spec = getSkillSpec(id)!;
        expect(
          spec.reserved ?? false,
          `${c.name} 可学「${spec.name}」，但它标了 reserved（在等 ${spec.role} 路线的角色）`,
        ).toBe(false);
      }
    }
  });

  it('可学技能这个职业带得动，且不重复、不含默认技能', () => {
    for (const c of CHARACTER_DEFS) {
      expect(
        c.unlockableSkillIds,
        `${c.name} 的可学列表里有默认技能，学了等于什么都没换`,
      ).not.toContain(c.defaultSkillId);
      expect(new Set(c.unlockableSkillIds).size, `${c.name} 的可学列表有重复`).toBe(
        c.unlockableSkillIds.length,
      );
      for (const id of c.unlockableSkillIds) {
        expect(
          canProfessionEquipSkill(c.profession, id),
          `${c.name}（${c.profession}）学不了 ${id}`,
        ).toBe(true);
      }
    }
  });

  /**
   * 换招要能换出花样来。只有一个选择时布阵页那个切换按钮直接不显示
   * （`cycleSkillForRoster` 在 `valid.length <= 1` 时返回），等于这个角色没有战术维度。
   */
  it('每个角色至少有两个能带的技能', () => {
    for (const c of CHARACTER_DEFS) {
      const total = 1 + c.unlockableSkillIds.length;
      expect(total, `${c.name} 只有 ${total} 个技能可选`).toBeGreaterThanOrEqual(2);
    }
  });

  it('主槽技能池不含预留技能', () => {
    for (const id of mainSlotSkillIds()) {
      expect(getSkillSpec(id)!.reserved ?? false, `${id} 标了 reserved 却进了主槽池`).toBe(false);
    }
  });
});

/**
 * 一个角色能带的招之间必须有**结构**差异，不能只差数值。
 *
 * 路线一致解决了「换招会废掉词条」，但顺手带来了反面风险：同定位的招很容易被写成
 * 同一招的两个数值档。「震击」和「铁锤」就这么并存过很久——同为邻格选血最低、
 * 同为 3 回合冷却、同样挂一个（对盾卫无效的）自嘲讽，区别只有 0.85 对 0.9 的倍率，
 * 价钱还一样。那不叫两个选择，叫一个升级；可学列表摆着它等于告诉玩家「买就对了」。
 * 「穿透箭」和「速射」也曾同为射线穿透，只差 0.03 倍率和一回合冷却。
 *
 * 所以差异必须落在**打法**上：形状、够得着哪里、点谁、什么时机、附带什么效果。
 * 倍率和冷却是在打法差异之上调味用的，不能拿来充当唯一的区别——
 * 玩家换招时先感知到的是「这一招打的格子不一样」，而不是「这一招高 3 点伤害」。
 */
describe('同一路线内的技能要有实质差异', () => {
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
        case 'neighborPickLowest':
          return `pickLowest:${shape.manhattan}`;
        case 'neighborPickFoe':
          return `pickFoe:${shape.manhattan}:${shape.reach ?? 'exact'}:${shape.pick}`;
        case 'neighborPickAlly':
          return `pickAlly:${shape.manhattan}:${shape.pick}`;
        case 'lineBestRayAllFoes':
          return 'line';
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
      spec.passiveBasicAttackMulIfMoved === undefined ? '-' : 'movePassive',
    ].join(' | ');
  }

  it('每个角色的可带技能两两之间打法不同', () => {
    for (const c of CHARACTER_DEFS) {
      const ids = [c.defaultSkillId, ...c.unlockableSkillIds];
      const seen = new Map<string, string>();
      for (const id of ids) {
        const key = playstyleKey(id);
        const prev = seen.get(key);
        expect(
          prev,
          `${c.name} 的「${getSkillSpec(id)!.name}」和「${prev ? getSkillSpec(prev)!.name : ''}」`
            + `打法完全一样（${key}），只差数值——换招换不出花样`,
        ).toBeUndefined();
        seen.set(key, id);
      }
    }
  });
});

/**
 * 路线约束必须**在运行时**也拦得住，不能只靠数据表配得对。
 *
 * 具体要防的是老存档：可学列表收紧后，已经存进 `ownedSkillIds` 的越界技能不会自己消失。
 * 只查 `ownedSkillIds` 的话它照样装得上、带得上场，路线约束在老档上等于没有，
 * 而这种漏法不报错——只会让那个角色的词条莫名休眠。
 */
describe('带得动这一招吗（canCharacterUseSkill）', () => {
  const gron = CHARACTER_DEFS.find((c) => c.id === 'hero_shield_gron')!;
  const rein = CHARACTER_DEFS.find((c) => c.id === 'hero_sword_ray')!;

  it('自己路线内的技能可以带', () => {
    expect(canCharacterUseSkill(gron, 'bash')).toBe(true);
    expect(canCharacterUseSkill(gron, 'hammer')).toBe(true);
    expect(canCharacterUseSkill(rein, 'blade_rush')).toBe(true);
  });

  it('挡掉跨定位的技能：老档学过的战场祝福不能再装', () => {
    // field_bless 是通用技能（任何职业都过得了职业校验），只有路线校验挡得住
    expect(canProfessionEquipSkill(gron.profession, 'field_bless')).toBe(true);
    expect(canCharacterUseSkill(gron, 'field_bless')).toBe(false);
  });

  it('挡掉预留技能：盾墙震慑在等控制路线的盾卫', () => {
    expect(canProfessionEquipSkill(gron.profession, 'shield_wall')).toBe(true);
    expect(canCharacterUseSkill(gron, 'shield_wall')).toBe(false);
  });

  it('挡掉别的职业的技能', () => {
    expect(canCharacterUseSkill(gron, 'whirl')).toBe(false);
    expect(canCharacterUseSkill(rein, 'pierce')).toBe(false);
  });
});
