import { describe, expect, it } from 'vitest';
import {
  CHARACTER_DEFS,
  characterStatsAtLevel,
  getCharacterDef,
  levelUpCost,
} from '@/data/characterCatalog';
import { getSkillSpec } from '@/data/skillCatalog';
import { exclusiveChainForSkill } from '@/data/skillModCatalog';
import { getSafeAreaInsets } from '@/core/safeArea';
import { ROSTER_NAV_BTN } from '@/ui/Button';
import { modalPanelRestY } from '@/ui/Modal';
import {
  HUB_SOUL_PILL_H,
  HUB_SOUL_TOP_GAP,
  hubSoulBarBottom,
  hubSoulIconCenter,
} from '@/view/hubHeader';
import {
  ROSTER_ACTION_BTN_H,
  ROSTER_DETAIL_FOOTER_H,
  ROSTER_DETAIL_TITLE_H,
  ROSTER_DETAIL_TABS,
  rosterDetailActionH,
  rosterDetailNeighbor,
  rosterDetailPanelLayout,
  rosterDetailPanelWidth,
  rosterStatTotals,
  rosterUpgradeCostItems,
} from '@/view/RosterView';

describe('角色详情升级页', () => {
  const ray = getCharacterDef('hero_sword_ray')!;

  it('四维同时给出当前值和升级增量', () => {
    const cur = characterStatsAtLevel(ray, 2);
    const next = characterStatsAtLevel(ray, 3);
    const rows = rosterStatTotals(cur, next);
    const hp = rows.find((r) => r.key === 'maxHp')!;
    expect(hp.current).toBe(cur.maxHp);
    expect(hp.nextTotal).toBe(cur.maxHp + ray.growth.maxHp);
    expect(hp.nextTotal).toBe(next.maxHp);
    expect(hp.gain).toBe(ray.growth.maxHp);
    expect(hp.gain).toBeGreaterThan(0);
  });

  it('满级不再给下一级总数', () => {
    const cur = characterStatsAtLevel(ray, 10);
    const rows = rosterStatTotals(cur, null);
    expect(rows.every((r) => r.nextTotal === null && r.gain === 0)).toBe(true);
  });

  it('升级消耗单独成条，魂晶在第一位，按钮上不再写价格', () => {
    const items = rosterUpgradeCostItems(12, 2);
    expect(items[0]).toMatchObject({
      id: 'soul',
      label: '魂晶',
      need: levelUpCost(2),
      have: 12,
    });
    expect(items).toHaveLength(1);
  });

  it('消耗和升级按钮有独立高度，不跟词条抢滚动', () => {
    expect(rosterDetailActionH(true)).toBeGreaterThan(ROSTER_ACTION_BTN_H);
    expect(rosterDetailActionH(false)).toBe(ROSTER_ACTION_BTN_H + 10);
    expect(ROSTER_DETAIL_FOOTER_H).toBeGreaterThan(36);
    expect(ROSTER_DETAIL_TITLE_H).toBeGreaterThan(64);
  });

  it('底栏是升级和技能详情，升级效果用完整纹章链', () => {
    expect(ROSTER_DETAIL_TABS.map((t) => t.label)).toEqual(['升级', '技能详情']);
    const spec = getSkillSpec(ray.defaultSkillId);
    expect(spec).toBeDefined();
    const chain = exclusiveChainForSkill(spec!);
    expect(chain.length).toBeGreaterThan(0);
    expect(chain.every((mod) => mod.icon && mod.name)).toBe(true);
  });

  it('标题栏招牌技能用当前战斗技能的名字和图标', () => {
    const hill = getCharacterDef('hero_bow_hill')!;
    const spec = getSkillSpec(hill.defaultSkillId);
    expect(spec).toMatchObject({ name: '穿透箭', id: 'pierce' });
    expect(`skill_${spec!.id}`).toBe('skill_pierce');
  });

  it('详情弹窗下沿让过顶栏魂晶', () => {
    const H = 667;
    const { panelH, offsetY } = rosterDetailPanelLayout(H);
    const y = modalPanelRestY(H, panelH, offsetY);
    expect(y).toBeGreaterThanOrEqual(hubSoulBarBottom() + 10);
    expect(y + panelH).toBeLessThanOrEqual(H - 8);
  });

  it('详情弹窗两侧留给翻页钮，按钮不压进正文', () => {
    const W = 375;
    const panelW = rosterDetailPanelWidth(W);
    const restX = Math.floor((W - panelW) / 2);
    expect(restX).toBeGreaterThanOrEqual(ROSTER_NAV_BTN.width + 4);
    expect(restX + panelW + ROSTER_NAV_BTN.width + 4).toBeLessThanOrEqual(W);
  });

  it('详情左右翻页在已拥有角色里循环', () => {
    const ids = ['hero_sword_ray', 'hero_bow_hill', 'hero_shield_gron'];
    expect(rosterDetailNeighbor(ids, 'hero_bow_hill', 1)).toBe('hero_shield_gron');
    expect(rosterDetailNeighbor(ids, 'hero_bow_hill', -1)).toBe('hero_sword_ray');
    expect(rosterDetailNeighbor(ids, 'hero_shield_gron', 1)).toBe('hero_sword_ray');
    expect(rosterDetailNeighbor(ids, 'hero_sword_ray', -1)).toBe('hero_shield_gron');
    expect(rosterDetailNeighbor(['hero_sword_ray'], 'hero_sword_ray', 1)).toBeNull();
  });

  it('顶栏魂晶贴着安全区顶，飞币落点和条对齐', () => {
    const inset = getSafeAreaInsets();
    const p = hubSoulIconCenter();
    expect(p.y).toBe(inset.top + HUB_SOUL_TOP_GAP + HUB_SOUL_PILL_H / 2);
    expect(CHARACTER_DEFS.length).toBeGreaterThan(0);
  });
});
