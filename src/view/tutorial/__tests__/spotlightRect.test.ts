import * as PIXI from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { spotlightRectOf } from '@/view/tutorial/TutorialOverlay';

describe('spotlightRectOf', () => {
  it('弹窗还在缩放时，挖洞按 1 倍位置算', () => {
    const dest = new PIXI.Container();
    const panel = new PIXI.Container();
    panel.pivot.set(100, 200);
    panel.x = 100;
    panel.y = 200;
    panel.scale.set(0.88);
    dest.addChild(panel);

    const btn = new PIXI.Container();
    btn.x = 20;
    btn.y = 80;
    panel.addChild(btn);

    const hole = spotlightRectOf(dest, btn, { w: 160, h: 38 }, 8);
    expect(hole).toEqual({ x: 20, y: 80, w: 160, h: 38, r: 8 });
    expect(panel.scale.x).toBeCloseTo(0.88);
  });
});
