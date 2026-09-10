import { describe, expect, it } from 'vitest';
import { getSkillSpec } from '../skillCatalog';
import {
  describeGroundPickCaption,
  describeSkillShape,
  describeSkillSpec,
} from '../skillText';

describe('选点爆炸的说明必须读出范围', () => {
  it('霜环文案写出爆炸、含落点和全体', () => {
    const spec = getSkillSpec('frost_ring');
    expect(spec?.shape.type).toBe('groundPickAoE');
    const cap = describeGroundPickCaption(3, 1);
    expect(cap).toContain('爆炸');
    expect(cap).toContain('含落点');
    expect(cap).toContain('所有敌人');
    expect(describeSkillShape(spec!)).toContain('爆炸');
    expect(describeSkillSpec(spec!).some((l) => l.startsWith('范围伤害'))).toBe(true);
  });

  it('单体点名仍写伤害，不套范围前缀', () => {
    const spec = getSkillSpec('ember');
    expect(spec).toBeTruthy();
    expect(describeSkillSpec(spec!).some((l) => l.startsWith('伤害:'))).toBe(true);
    expect(describeSkillSpec(spec!).some((l) => l.startsWith('范围伤害'))).toBe(false);
  });

  it('邻格环不写成周围 N 格内', () => {
    const spec = getSkillSpec('temp_fo_thorn')!;
    expect(describeSkillShape(spec)).toMatch(/正好\s*2\s*格/);
    expect(describeSkillShape(spec)).toContain('贴脸打不到');
  });
});
