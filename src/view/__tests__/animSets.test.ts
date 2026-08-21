import { describe, expect, it } from 'vitest';
import { atlasFramesFit, getAnimManifest } from '@/view/animSets';

describe('图集底图尺寸', () => {
  it('祭司清单按 2048 图集写帧，256 idle 底图装不下', () => {
    const m = getAnimManifest('healer');
    expect(m).not.toBeNull();
    expect(atlasFramesFit(256, 256, m!.frames)).toBe(false);
    expect(atlasFramesFit(m!.meta.size.w, m!.meta.size.h, m!.frames)).toBe(true);
  });
});
