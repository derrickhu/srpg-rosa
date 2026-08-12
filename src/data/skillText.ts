import type { SkillSpec } from './skillCatalog';

/**
 * 技能范围/选目标方式的一句话说明。
 * 与单位信息面板格子图旁的文案同源口径，商店/背包只拿文字、不画格子。
 */
export function describeSkillShape(spec: SkillSpec): string {
  const shape = spec.shape;
  switch (shape.type) {
    case 'neighborAoE':
      return `周围 ${shape.manhattan} 格内所有敌人`;
    case 'discAoE':
      return `周围 ${shape.radius} 格全覆盖所有敌人`;
    case 'neighborPickLowest':
      return `周围 ${shape.manhattan} 格选血量最低的敌人`;
    case 'neighborPickFoe': {
      const pick = shape.pick === 'lowestHp' ? '血量最低' : '血量最高';
      return `周围 ${shape.manhattan} 格选${pick}的敌人`;
    }
    case 'neighborPickAlly': {
      const pick = shape.pick === 'lowestHp' ? '血量最低' : '血量最高';
      return `周围 ${shape.manhattan} 格选${pick}的友方`;
    }
    case 'lineBestRayAllFoes':
      return '四方向直线穿透所有敌人';
    case 'selfCast':
      return '对自己释放';
  }
}

/**
 * 技能效果的中文说明行。
 *
 * 单独抽出来是因为这段以前内联在 `DeployView` 里，只覆盖了 `taunt` / `atkDown` /
 * `atkBonus` / `spdBonus` 四种。加了减速、中毒、治疗之后，那些效果在布阵页
 * **一个字都不显示**——技能面板看起来是空的，但打起来确实在掉血。
 *
 * 面板漏写效果比写错更糟：写错玩家会发现并质疑，漏写他根本不知道有这回事，
 * 只会觉得这一招"没什么用"然后再也不选。所以这里用穷举 switch，
 * 加新效果种类时编译器会直接指出这个函数没处理。
 */
export function describeSkillSpec(spec: SkillSpec): string[] {
  const out: string[] = [];
  if (spec.timing === 'passive') out.push('被动技能');

  switch (spec.damage.kind) {
    case 'scaledAtk':
      out.push(`伤害: 攻击力×${Math.round(spec.damage.atkMul * 100)}%`);
      break;
    case 'flat':
      out.push(`伤害: 固定 ${spec.damage.amount}`);
      break;
    case 'percentTargetMaxHp':
      out.push(`伤害: 目标最大生命×${Math.round(spec.damage.ratio * 100)}%`);
      break;
    case 'none':
    case 'custom':
      break;
  }

  if (spec.passiveBasicAttackMulIfMoved) {
    out.push(`移动后普攻伤害×${Math.round(spec.passiveBasicAttackMulIfMoved * 100)}%`);
  }
  if (spec.lifestealRatio) {
    out.push(`吸血: 造成伤害的 ${Math.round(spec.lifestealRatio * 100)}%`);
  }

  for (const e of spec.onCastSelfEffects ?? []) {
    switch (e.kind) {
      case 'taunt': out.push(`自身嘲讽 ${e.rounds} 回合`); break;
      case 'atkBonus': out.push(`自身攻击 +${e.addAtk}，${e.rounds} 回合`); break;
    }
  }
  for (const e of spec.onCastFoeEffects ?? []) {
    switch (e.kind) {
      case 'atkDown': out.push(`敌方攻击 -${e.subAtk}，${e.rounds} 回合`); break;
      case 'spdDown': out.push(`敌方速度 -${e.subSpd}，${e.rounds} 回合`); break;
      case 'poison': out.push(`中毒: 每回合 -${e.dmgPerRound} 血，${e.rounds} 回合`); break;
    }
  }
  for (const e of spec.onCastAllyEffects ?? []) {
    switch (e.kind) {
      case 'atkBonus': out.push(`友方攻击 +${e.addAtk}，${e.rounds} 回合`); break;
      case 'spdBonus': out.push(`友方速度 +${e.addSpd}，${e.rounds} 回合`); break;
      case 'heal': out.push(`治疗友方 ${e.amount} 点生命`); break;
    }
  }
  return out;
}
