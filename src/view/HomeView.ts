import * as PIXI from 'pixi.js';
import { createBackground } from '@/view/renderHelpers';
import { AssetManager } from '@/core/AssetManager';

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
      fill: 0xfff8e7,
      fontSize: 32,
      fontWeight: 'bold',
      stroke: 0x6b4c2a,
      strokeThickness: 3,
    });
    fallbackTitle.anchor.set(0.5);
    fallbackTitle.x = W / 2;
    fallbackTitle.y = H * 0.33;
    root.addChild(fallbackTitle);
  }

  // --- 开始按钮（图片 + 文字叠加） ---
  const btnTex = AssetManager.isBundleLoaded('ui') ? AssetManager.texture('ui', 'btn_start') : null;
  const btnMaxW = Math.min(220, W * 0.55);
  const btnContainer = new PIXI.Container();

  if (btnTex && btnTex !== PIXI.Texture.WHITE) {
    const btnSprite = new PIXI.Sprite(btnTex);
    const aspect = btnTex.width / btnTex.height;
    btnSprite.width = btnMaxW;
    btnSprite.height = btnMaxW / aspect;
    btnSprite.anchor.set(0.5);
    btnContainer.addChild(btnSprite);

    const btnLabel = new PIXI.Text('开始游戏', {
      fill: 0xffffff,
      fontSize: 20,
      fontWeight: 'bold',
      stroke: 0x2a6a1a,
      strokeThickness: 3,
      dropShadow: true,
      dropShadowColor: 0x1a4a0a,
      dropShadowDistance: 1,
      dropShadowAlpha: 0.5,
    });
    btnLabel.anchor.set(0.5);
    btnLabel.y = -2;
    btnContainer.addChild(btnLabel);

    btnContainer.hitArea = new PIXI.Rectangle(
      -btnMaxW / 2, -btnMaxW / aspect / 2,
      btnMaxW, btnMaxW / aspect,
    );
  } else {
    const fallbackBg = new PIXI.Graphics();
    fallbackBg.lineStyle(2, 0x3a7a2a, 1);
    fallbackBg.beginFill(0x5aaa3a, 0.92);
    fallbackBg.drawRoundedRect(-btnMaxW / 2, -24, btnMaxW, 48, 24);
    fallbackBg.endFill();
    btnContainer.addChild(fallbackBg);

    const btnLabel = new PIXI.Text('开始游戏', {
      fill: 0xffffff,
      fontSize: 18,
      fontWeight: 'bold',
    });
    btnLabel.anchor.set(0.5);
    btnContainer.addChild(btnLabel);

    btnContainer.hitArea = new PIXI.Rectangle(-btnMaxW / 2, -24, btnMaxW, 48);
  }

  btnContainer.x = W / 2;
  btnContainer.y = H * 0.58;
  btnContainer.eventMode = 'static';
  btnContainer.cursor = 'pointer';
  btnContainer.on('pointertap', () => callbacks.onStart());

  const origScaleX = btnContainer.scale.x;
  const origScaleY = btnContainer.scale.y;
  btnContainer.on('pointerdown', () => {
    btnContainer.scale.set(origScaleX * 0.94, origScaleY * 0.94);
  });
  btnContainer.on('pointerup', () => {
    btnContainer.scale.set(origScaleX, origScaleY);
  });
  btnContainer.on('pointerupoutside', () => {
    btnContainer.scale.set(origScaleX, origScaleY);
  });

  root.addChild(btnContainer);

  return root;
}
