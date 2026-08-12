import { describe, expect, it } from 'vitest';
import {
  SHOWCASE_ROLES,
  setShowcaseFontFamily,
  showcaseFontFamily,
  textStyle,
  type TextRole,
} from '@/theme/typography';

const ALL: TextRole[] = [
  'display', 'title', 'ui', 'uiStrong', 'body', 'caption',
  'combatFloat', 'combatLabel', 'micro',
];

describe('typography', () => {
  it('只有展示角色用自定义字体，正文走系统栈', () => {
    setShowcaseFontFamily('SmileySansTest');
    for (const role of ALL) {
      const fam = String(textStyle(role).fontFamily);
      if (SHOWCASE_ROLES.has(role)) {
        expect(fam, role).toBe('SmileySansTest');
      } else {
        expect(fam, role).toBe('sans-serif');
      }
    }
    setShowcaseFontFamily('SmileySans');
  });

  it('overrides 不能换掉 fontFamily', () => {
    setShowcaseFontFamily('SmileySansTest');
    const s = textStyle('display', { fontFamily: 'Comic Sans' as unknown as string, fill: 0xffffff });
    expect(s.fontFamily).toBe('SmileySansTest');
    const body = textStyle('body', { fontFamily: 'Comic Sans' as unknown as string });
    expect(body.fontFamily).toBe('sans-serif');
    setShowcaseFontFamily('SmileySans');
  });

  it('FontLoader 写入后 showcaseFontFamily 可读', () => {
    setShowcaseFontFamily('LoadedSmile');
    expect(showcaseFontFamily()).toBe('LoadedSmile');
    expect(textStyle('title').fontFamily).toBe('LoadedSmile');
    setShowcaseFontFamily('SmileySans');
  });
});
