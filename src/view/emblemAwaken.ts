import * as PIXI from 'pixi.js';
import { AssetManager } from '@/core/AssetManager';
import { AudioManager } from '@/core/AudioManager';
import { makeButton } from '@/ui/Button';
import { makeText } from '@/theme/typography';
import type { SkillModDef } from '@/data/skillModCatalog';
import { characterArtKey, getCharacterDef } from '@/data/characterCatalog';
import { createUiIcon, createUnitToken } from '@/view/renderHelpers';
import { isDisplayLive } from '@/view/pixiLive';
import { awaitEase, easeOutQuad } from '@/view/fx/tween';

export interface EmblemAwakenInfo {
  rosterId: string;
  characterName: string;
  mods: SkillModDef[];
}

export interface EmblemAwakenOpts {
  screenW: number;
  screenH: number;
  info: EmblemAwakenInfo;
  onConfirm: () => void;
}

const NIGHT = 0x140818;
const GOLD = 0xeec462;
const CREAM = 0xfff8e8;
const INK = 0x1a1410;

function uiTex(key: string): PIXI.Texture | null {
  if (!AssetManager.isBundleLoaded('ui')) return null;
  const tex = AssetManager.texture('ui', key);
  return tex && tex !== PIXI.Texture.WHITE ? tex : null;
}

function coverSprite(tex: PIXI.Texture, w: number, h: number): PIXI.Sprite {
  const sp = new PIXI.Sprite(tex);
  const scale = Math.max(w / tex.width, h / tex.height);
  sp.scale.set(scale);
  sp.x = (w - tex.width * scale) / 2;
  sp.y = (h - tex.height * scale) / 2;
  return sp;
}

function makeHintCard(w: number, text: string): PIXI.Container {
  const root = new PIXI.Container();
  const pad = 14;
  const wrapW = Math.max(40, w - pad * 2);
  // 中文无空格：不设 breakWords 时整句当一个词，会撑破金框。
  const tx = makeText(text, 'body', {
    fill: CREAM,
    fontSize: 13,
    wordWrap: true,
    wordWrapWidth: wrapW,
    breakWords: true,
    align: 'center',
    lineHeight: 20,
  });
  const h = Math.ceil(tx.height) + pad * 2;
  const g = new PIXI.Graphics();
  g.beginFill(0x2a1418, 0.82);
  g.lineStyle(2, GOLD, 0.85);
  g.drawRoundedRect(0, 0, w, h, 12);
  g.endFill();
  root.addChild(g);
  tx.anchor.set(0.5, 0);
  tx.x = w / 2;
  tx.y = pad;
  root.addChild(tx);
  return root;
}

function spawnSparks(layer: PIXI.Container, cx: number, cy: number): void {
  const sparks: { g: PIXI.Graphics; vx: number; vy: number; life: number }[] = [];
  for (let i = 0; i < 18; i++) {
    const g = new PIXI.Graphics();
    g.beginFill(i % 3 === 0 ? 0xfff8e8 : GOLD, 0.9);
    g.drawCircle(0, 0, i % 4 === 0 ? 3.2 : 2);
    g.endFill();
    g.x = cx + (Math.random() - 0.5) * 40;
    g.y = cy + (Math.random() - 0.5) * 24;
    g.eventMode = 'none';
    layer.addChild(g);
    sparks.push({
      g,
      vx: (Math.random() - 0.5) * 0.55,
      vy: -0.35 - Math.random() * 0.7,
      life: 700 + Math.random() * 900,
    });
  }
  let acc = 0;
  const tick = (): void => {
    acc += PIXI.Ticker.shared.deltaMS;
    for (const s of sparks) {
      if (!isDisplayLive(s.g)) continue;
      s.g.x += s.vx * PIXI.Ticker.shared.deltaMS;
      s.g.y += s.vy * PIXI.Ticker.shared.deltaMS;
      s.g.alpha = Math.max(0, 1 - acc / s.life);
    }
    if (acc > 1800 || !isDisplayLive(layer)) {
      PIXI.Ticker.shared.remove(tick);
    }
  };
  PIXI.Ticker.shared.add(tick);
}

/**
 * 专属纹章第一次打开时的全屏庆祝。
 *
 * 不走角色获得厅堂，也不走升级白闪——那两套说的是「人来了」和「数字跳了」。
 * 这里要说的是：纹章会进后续战斗的三选一。
 */
export function createEmblemAwakenOverlay(opts: EmblemAwakenOpts): PIXI.Container {
  const { screenW: W, screenH: H, info } = opts;
  const root = new PIXI.Container();
  root.eventMode = 'static';
  root.hitArea = new PIXI.Rectangle(0, 0, W, H);
  AudioManager.playSfx('sfx_emblem_awaken');

  const bgTex = uiTex('emblem_awaken_bg');
  if (bgTex) {
    root.addChild(coverSprite(bgTex, W, H));
  } else {
    const fill = new PIXI.Graphics();
    fill.beginFill(NIGHT, 1);
    fill.drawRect(0, 0, W, H);
    fill.endFill();
    root.addChild(fill);
  }

  const veil = new PIXI.Graphics();
  veil.beginFill(NIGHT, 0.28);
  veil.drawRect(0, 0, W, H);
  veil.endFill();
  veil.eventMode = 'none';
  root.addChild(veil);

  const cx = W / 2;
  const crestSize = Math.min(168, Math.round(W * 0.46));
  const crestY = Math.max(H * 0.30, 150);

  const glow = new PIXI.Graphics();
  glow.beginFill(GOLD, 0.18);
  glow.drawCircle(0, 0, crestSize * 0.72);
  glow.endFill();
  glow.beginFill(GOLD, 0.08);
  glow.drawCircle(0, 0, crestSize * 1.05);
  glow.endFill();
  glow.x = cx;
  glow.y = crestY;
  glow.eventMode = 'none';
  root.addChild(glow);

  const crestBox = new PIXI.Container();
  crestBox.x = cx;
  crestBox.y = crestY;
  const crestTex = uiTex('emblem_awaken_crest');
  if (crestTex) {
    const sp = new PIXI.Sprite(crestTex);
    const s = crestSize / Math.max(crestTex.width, crestTex.height);
    sp.anchor.set(0.5);
    sp.scale.set(s);
    crestBox.addChild(sp);
  } else {
    const disc = new PIXI.Graphics();
    disc.beginFill(GOLD, 1);
    disc.lineStyle(4, INK, 1);
    disc.drawCircle(0, 0, crestSize / 2);
    disc.endFill();
    crestBox.addChild(disc);
  }
  crestBox.scale.set(0.28);
  crestBox.alpha = 0;
  root.addChild(crestBox);

  spawnSparks(root, cx, crestY - 10);

  const title = makeText('专属纹章', 'display', {
    fill: CREAM,
    fontSize: 30,
    stroke: INK,
    strokeThickness: 6,
  });
  title.anchor.set(0.5, 0);
  title.x = cx;
  title.y = Math.max(28, crestY - crestSize * 0.62 - 52);
  title.alpha = 0;
  root.addChild(title);

  const def = getCharacterDef(info.rosterId);
  const token = createUnitToken(
    characterArtKey({ rosterId: info.rosterId, profession: def?.profession ?? 'sword' }),
    'player',
    28,
  );
  const who = makeText(`${info.characterName} 解锁了专属纹章`, 'uiStrong', {
    fill: 0xf3ddb0,
    fontSize: 14,
    stroke: INK,
    strokeThickness: 3,
  });
  const whoRow = new PIXI.Container();
  token.x = 14;
  token.y = 14;
  who.x = 32;
  who.y = Math.max(0, 14 - who.height / 2);
  whoRow.addChild(token);
  whoRow.addChild(who);
  whoRow.x = cx - whoRow.width / 2;
  whoRow.y = title.y + title.height + 4;
  whoRow.alpha = 0;
  root.addChild(whoRow);

  const primary = info.mods[0];
  const names = info.mods.map((m) => m.name).join('、');
  const nameRow = new PIXI.Container();
  const icon = primary ? createUiIcon(primary.icon, 22) : null;
  const nameTx = makeText(names || '专属纹章', 'heading', {
    fill: GOLD,
    fontSize: 22,
    stroke: INK,
    strokeThickness: 4,
  });
  if (icon) {
    icon.y = Math.round((nameTx.height - 22) / 2);
    nameRow.addChild(icon);
    nameTx.x = 26;
  }
  nameRow.addChild(nameTx);
  nameRow.x = cx - nameRow.width / 2;
  nameRow.y = crestY + crestSize * 0.58;
  nameRow.alpha = 0;
  root.addChild(nameRow);

  const desc = makeText(primary?.describe(1) ?? '', 'body', {
    fill: 0xf0e0c8,
    fontSize: 13,
    wordWrap: true,
    wordWrapWidth: Math.min(280, W - 48),
    breakWords: true,
    align: 'center',
    stroke: INK,
    strokeThickness: 3,
    lineHeight: 20,
  });
  desc.anchor.set(0.5, 0);
  desc.x = cx;
  desc.y = nameRow.y + nameTx.height + 6;
  desc.alpha = 0;
  root.addChild(desc);

  const hint = makeHintCard(
    Math.min(300, W - 40),
    '专属纹章会在后续战斗胜利后的三选一里出现。铭刻后改变招式的打法。',
  );
  hint.x = cx - hint.width / 2;
  hint.y = Math.min(H - 132, desc.y + desc.height + 16);
  hint.alpha = 0;
  root.addChild(hint);

  const btnW = Math.min(220, W - 80);
  const btn = makeButton('准备应战', opts.onConfirm, {
    variant: 'primary',
    width: btnW,
    height: 48,
    fontSize: 17,
    radius: 14,
  });
  btn.x = cx - btnW / 2;
  btn.y = Math.min(H - 64, hint.y + hint.height + 16);
  btn.alpha = 0;
  root.addChild(btn);

  void awaitEase(520, (t) => {
    if (!isDisplayLive(crestBox)) return;
    const k = easeOutQuad(t);
    crestBox.scale.set(0.28 + 0.72 * k);
    crestBox.alpha = k;
    glow.scale.set(0.7 + 0.3 * k);
    glow.alpha = 0.4 + 0.6 * k;
  }).then(() => {
    if (!isDisplayLive(root)) return;
    void awaitEase(280, (t) => {
      if (!isDisplayLive(title)) return;
      title.alpha = t;
      whoRow.alpha = t;
      nameRow.alpha = t;
      desc.alpha = t;
      hint.alpha = t;
      btn.alpha = t;
    });
  });

  return root;
}
