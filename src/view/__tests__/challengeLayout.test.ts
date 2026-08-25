import { describe, expect, it } from 'vitest';
import { CHALLENGE_ENTRIES } from '@/data/challengeCatalog';
import { challengeStackHeight } from '@/view/ChallengeView';
import { scrollOverflow } from '@/ui/ScrollList';

describe('副本页堆叠高度', () => {
  it('新号（无重打 + 活动 + 无尽）在典型手机视口里必须能滚', () => {
    const events = CHALLENGE_ENTRIES.filter((e) => e.kind === 'event').length;
    const endless = CHALLENGE_ENTRIES.filter((e) => e.kind === 'endless').length;
    const stack = challengeStackHeight({
      repeats: 0,
      tipH: 50,
      events,
      endless,
    });
    // 375×667、底栏 64、顶栏大约 120：内容区大约 480
    expect(scrollOverflow(480, stack)).toBeLessThan(0);
  });
});
