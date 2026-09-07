import { describe, expect, it } from 'vitest';
import { isAndroidLikeSystem } from '@/boot/createPixiApp';

describe('isAndroidLikeSystem', () => {
  it('认华为 / 鸿蒙 / 安卓', () => {
    expect(isAndroidLikeSystem({ platform: 'android', brand: 'HUAWEI' })).toBe(true);
    expect(isAndroidLikeSystem({ platform: 'ohos', brand: 'HUAWEI' })).toBe(true);
    expect(isAndroidLikeSystem({ platform: 'harmonyos', brand: 'HONOR' })).toBe(true);
    expect(isAndroidLikeSystem({ platform: 'devtools', brand: 'huawei' })).toBe(true);
  });

  it('iOS 和开发者工具不当成安卓', () => {
    expect(isAndroidLikeSystem({ platform: 'ios', brand: 'iPhone' })).toBe(false);
    expect(isAndroidLikeSystem({ platform: 'devtools', brand: 'devtools' })).toBe(false);
  });
});
