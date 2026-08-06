import * as PIXI from 'pixi.js';
import { createBackground } from '@/view/renderHelpers';
import { AssetManager } from '@/core/AssetManager';
import { makeButton } from '@/ui/Button';
import { C } from '@/view/mvpTheme';

export interface HomeScreen {
  screenWidth: number;
  screenHeight: number;
}

export function createHomeView(
  callbacks: { onStart: () => void },
  screen: HomeScreen,
): PIXI.Container {
  const root = new PIXI.Container();
  const W = screen.screenWidth;
  const H = screen.screenHeight;

  root.addChild(createBackground(W, H));

  // --- Logo 文字图（无尽纹章） ---
  const logoTex = AssetManager.isBundleLoaded('ui') ? AssetManager.texture('ui', 'logo_emblem') : null;
  const logoMaxW = Math.min(W * 0.78, 320);

  if (logoTex && logoTex !== PIXI.Texture.WHITE) {
    const logo = new PIXI.Sprite(logoTex);
    const aspect = logoTex.width / logoTex.height;
    logo.width = logoMaxW;
    logo.height = logoMaxW / aspect;
    logo.anchor.set(0.5);
    logo.x = W / 2;
    logo.y = H * 0.33;
    root.addChild(logo);
  } else {
    const fallbackTitle = new PIXI.Text('无尽纹章', {
      fill: C.primary,
      fontSize: 32,
      fontWeight: 'bold',
      stroke: C.ink,
      strokeThickness: 4,
    });
    fallbackTitle.anchor.set(0.5);
    fallbackTitle.x = W / 2;
    fallbackTitle.y = H * 0.33;
    root.addChild(fallbackTitle);
  }

  // --- 开始按钮 ---
  // 以前这里贴的是 btn_start.png，一颗带高光渐变的绿药丸——高光渐变正是风格圣经 §9 的禁区，
  // 而且文字本来就是叠在图上画的，那张图只贡献了一个圆角矩形。改用 primary 档按钮：
  // 首页只有这一个行动，正好是「一屏一个金色 CTA」的规矩。
  const btnW = Math.min(220, W * 0.55);
  const btnH = 52;
  const btn = makeButton('开始游戏', () => callbacks.onStart(), {
    variant: 'primary',
    width: btnW,
    height: btnH,
    fontSize: 20,
    radius: 16,
  });
  btn.x = (W - btnW) / 2;
  btn.y = H * 0.58 - btnH / 2;
  root.addChild(btn);

  return root;
}
