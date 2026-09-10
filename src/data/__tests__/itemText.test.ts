import { describe, expect, it } from 'vitest';
import {
  describePotion,
  describeShopOffer,
  describeShopOfferLines,
  describeTempSkill,
  describeTempSkillLines,
  describeTerrainTicket,
} from '../itemText';

describe('itemText 共用说明', () => {
  it('药剂分行：用法 + 效果数值', () => {
    const lines = describeShopOfferLines({ type: 'potion', potionId: 'heal' });
    expect(lines[0]).toContain('战斗中点击使用');
    expect(lines.some((l) => l.includes('35%'))).toBe(true);
  });

  it('地形券分行写清放置与数值', () => {
    const lines = describeShopOfferLines({ type: 'terrain', terrainId: 'high' });
    expect(lines[0]).toContain('布阵');
    expect(lines[0]).toContain('高地');
    expect(lines.some((l) => l.includes('25%'))).toBe(true);
  });

  it('临时技能分行且比散文短', () => {
    const lines = describeTempSkillLines('temp_gl_horn');
    expect(lines.length).toBeGreaterThanOrEqual(3);
    expect(lines[0]).toMatch(/第二技能位/);
    expect(lines[0]).toMatch(/冷却\s*3/);
    expect(lines.some((l) => /对自己释放/.test(l))).toBe(true);
    expect(lines.some((l) => /嘲讽/.test(l))).toBe(true);
    // 不再是一长串用句号粘起来
    expect(describeTempSkill('temp_gl_horn')).toContain('\n');
    expect(describeTempSkill('temp_gl_horn').split('。').length).toBeLessThan(4);
  });

  it('选点爆炸在商店里也写明范围全体', () => {
    const lines = describeTempSkillLines('frost_ring');
    expect(lines.some((l) => l.includes('爆炸') && l.includes('全体'))).toBe(true);
  });

  it('外圈环技能不写成周围 N 格', () => {
    const lines = describeTempSkillLines('temp_fo_thorn');
    expect(lines.some((l) => /正好\s*2\s*格一圈/.test(l))).toBe(true);
    expect(lines.some((l) => /周围\s*2\s*格/.test(l))).toBe(false);
  });

  it('单行接口与分行内容一致', () => {
    expect(describeShopOffer({ type: 'potion', potionId: 'draught' })).toBe(describePotion('draught'));
    expect(describeShopOffer({ type: 'terrain', terrainId: 'wall' })).toBe(describeTerrainTicket('wall'));
    expect(describeShopOffer({ type: 'tempSkill', skillId: 'temp_gl_horn' })).toBe(
      describeTempSkill('temp_gl_horn'),
    );
  });
});
