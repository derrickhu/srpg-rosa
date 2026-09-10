import { describe, expect, it } from 'vitest';
import { CHARACTER_DEFS } from '../characterCatalog';
import { getSkillSpec } from '../skillCatalog';
import { buildSkillRangePreview, previewKindAt } from '../skillRangePreview';
import { describeSkillRangeCaption, describeSkillShape, describeSkillSpec } from '../skillText';

describe('技能格子图跟结算同一把尺子', () => {
  it('圣疗是 2 格内整片，贴脸格不能画空', () => {
    const spec = getSkillSpec('heal_touch')!;
    const p = buildSkillRangePreview(spec.shape);
    expect(previewKindAt(p, 1, 0)).toBe('hit');
    expect(previewKindAt(p, 2, 0)).toBe('hit');
    expect(previewKindAt(p, 3, 0)).toBe('empty');
    expect(describeSkillRangeCaption(spec)).toContain('2 格内');
    expect(describeSkillRangeCaption(spec)).toContain('友方');
  });

  it('荆棘绞缠是正好 2 格的环，贴脸格必须空着', () => {
    const spec = getSkillSpec('temp_fo_thorn')!;
    const p = buildSkillRangePreview(spec.shape);
    expect(previewKindAt(p, 1, 0)).toBe('empty');
    expect(previewKindAt(p, 2, 0)).toBe('hit');
    expect(describeSkillRangeCaption(spec)).toMatch(/正好\s*2\s*格/);
    expect(describeSkillRangeCaption(spec)).toContain('贴脸打不到');
    expect(describeSkillShape(spec)).not.toMatch(/周围\s*2\s*格内/);
  });

  it('破甲咒正好 2 格点名，贴脸格是空的', () => {
    const spec = getSkillSpec('hex_mark')!;
    const p = buildSkillRangePreview(spec.shape);
    expect(previewKindAt(p, 1, 0)).toBe('empty');
    expect(previewKindAt(p, 2, 0)).toBe('hit');
  });

  it('速射 / 炎弹 3 格内含贴脸', () => {
    for (const id of ['snap', 'ember'] as const) {
      const p = buildSkillRangePreview(getSkillSpec(id)!.shape);
      expect(previewKindAt(p, 1, 0), id).toBe('hit');
      expect(previewKindAt(p, 3, 0), id).toBe('hit');
      expect(previewKindAt(p, 4, 0), id).toBe('empty');
    }
  });

  it('长驱突刺只画同行同列，斜角空白，贴脸能点', () => {
    const p = buildSkillRangePreview(getSkillSpec('lance_thrust')!.shape);
    expect(previewKindAt(p, 1, 0)).toBe('hit');
    expect(previewKindAt(p, 2, 0)).toBe('hit');
    expect(previewKindAt(p, 1, 1)).toBe('empty');
  });

  it('旋风斩含斜角，邻格环不含', () => {
    const whirl = buildSkillRangePreview(getSkillSpec('whirl')!.shape);
    const shout = buildSkillRangePreview(getSkillSpec('war_shout')!.shape);
    expect(previewKindAt(whirl, 1, 1)).toBe('hit');
    expect(previewKindAt(shout, 1, 1)).toBe('empty');
    expect(previewKindAt(shout, 1, 0)).toBe('hit');
  });

  it('霜环要同时看出落点和爆炸，不是整片同色', () => {
    const p = buildSkillRangePreview(getSkillSpec('frost_ring')!.shape);
    expect(previewKindAt(p, 0, 0)).toBe('center');
    expect(previewKindAt(p, 1, 0)).toBe('pick');
    expect(previewKindAt(p, 0, -2)).toBe('focus');
    expect(previewKindAt(p, 0, -3)).toBe('hit');
    expect(previewKindAt(p, 1, -2)).toBe('hit');
  });

  it('每个角色招牌的格子图都能生成，且说明不把环写成格内', () => {
    for (const c of CHARACTER_DEFS) {
      const spec = getSkillSpec(c.defaultSkillId)!;
      const p = buildSkillRangePreview(spec.shape);
      expect(p.cells.length, c.name).toBe(p.gridR * 2 + 1);
      if (spec.shape.type === 'neighborAoE' && spec.shape.manhattan > 1) {
        expect(describeSkillShape(spec), c.name).toMatch(/正好/);
      }
    }
  });

  it('范围技伤害行带范围前缀，单体不带', () => {
    expect(describeSkillSpec(getSkillSpec('whirl')!).some((l) => l.startsWith('范围伤害'))).toBe(true);
    expect(describeSkillSpec(getSkillSpec('ember')!).some((l) => l.startsWith('伤害:'))).toBe(true);
  });
});
