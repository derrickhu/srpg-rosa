import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * 启动 Loading 必须带健康游戏忠告：版署截图和软著说明书都认这一屏。
 * 不测 Pixi 渲染，守的是文案和接入点还在。
 */
describe('启动加载与健康忠告', () => {
  const loadingSrc = readFileSync('src/view/LoadingView.ts', 'utf8');
  const flowSrc = readFileSync('src/view/GameFlow.ts', 'utf8');

  it('忠告全文四句都在，并标明著作权人', () => {
    expect(loadingSrc).toContain('著作权人：深圳幸运呱科技有限公司');
    expect(loadingSrc).toContain('《健康游戏忠告》');
    expect(loadingSrc).toContain('抵制不良游戏，拒绝盗版游戏');
    expect(loadingSrc).toContain('注意自我保护，谨防受骗上当');
    expect(loadingSrc).toContain('适度游戏益脑，沉迷游戏伤身');
    expect(loadingSrc).toContain('合理安排时间，享受健康生活');
  });

  it('GameFlow 启动走 LoadingView 并上报进度', () => {
    expect(flowSrc).toContain("from '@/view/LoadingView'");
    expect(flowSrc).toContain('createLoadingView');
    expect(flowSrc).toContain('setProgress');
    expect(flowSrc).toContain('applySplash');
    expect(flowSrc).toContain('applyLogo');
    expect(flowSrc).toContain('LOADING_BUNDLE');
    expect(flowSrc).toContain('loadNamed');
    expect(flowSrc).toMatch(/private showLoading\(\)[\s\S]*?createLoadingView/);
    expect(flowSrc).toContain('this.renderShell()');
    expect(flowSrc).not.toContain('createHomeView');
    expect(flowSrc).not.toContain('renderHome');
  });

  it('底图随包，不走 CDN', () => {
    const bundles = readFileSync('src/core/assetBundles.ts', 'utf8');
    expect(bundles).toContain("splash: 'images/ui/loading/loading_splash.jpg'");
    expect(existsSync('images/ui/loading/loading_splash.jpg')).toBe(true);
  });
});
