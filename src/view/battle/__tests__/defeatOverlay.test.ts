import { describe, expect, it } from 'vitest';
import {
  ABANDON_RUN_CONFIRM,
  defeatHintsFor,
  formatAbandonConfirmBody,
} from '../resultOverlay';

describe('战败提示', () => {
  it('章节失败列出布阵、招募、升级', () => {
    expect(defeatHintsFor('chapter').map((h) => h.title))
      .toEqual(['重新布阵', '招募同伴', '升级角色']);
  });

  it('教程还不能离章，只提醒重打', () => {
    expect(defeatHintsFor('tutorial').map((h) => h.title)).toEqual(['重新布阵']);
  });

  it('无尽没有布阵重来，只提醒招募和升级', () => {
    expect(defeatHintsFor('endless').map((h) => h.title))
      .toEqual(['招募同伴', '升级角色']);
  });
});

describe('放弃副本确认', () => {
  it('写明小关首通已发、章节奖要下次从头打', () => {
    const body = formatAbandonConfirmBody(ABANDON_RUN_CONFIRM);
    expect(ABANDON_RUN_CONFIRM.title).toContain('放弃');
    expect(body).toContain('已经发放');
    expect(body).toMatch(/章节通关奖励/);
    expect(body).toMatch(/从头打完/);
  });
});
