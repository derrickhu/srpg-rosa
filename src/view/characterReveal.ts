import * as PIXI from 'pixi.js';
import { characterArtKey, getCharacterDef } from '@/data/characterCatalog';
import { describeSkillRole } from '@/data/skillText';
import { UNIT_DEFS } from '@/data/unitDefs';
import { makeButton } from '@/ui/Button';
import { makeGoldPlatform, makeRibbonTitle } from '@/ui/chrome';
import { makeText } from '@/theme/typography';
import { C, PROFESSION_ACCENT } from '@/view/mvpTheme';
import { createBackground, createUnitToken } from '@/view/renderHelpers';
import { fadeScrim, staggerPop } from '@/view/fx/celebration';
import { AudioManager } from '@/core/AudioManager';

export interface CharacterRevealOpts {
  screenW: number;
  screenH: number;
  rosterId: string;
  onConfirm: () => void;
}

function makeTag(label: string, fill: number, textColor: number): PIXI.Container {
  const c = new PIXI.Container();
  const tx = makeText(label, 'ui', { fill: textColor, fontSize: 12 });
  const padX = 10;
  const padY = 4;
  const g = new PIXI.Graphics();
  g.beginFill(fill, 0.95);
  g.drawRoundedRect(0, 0, tx.width + padX * 2, tx.height + padY * 2, 11);
  g.endFill();
  c.addChild(g);
  tx.x = padX;
  tx.y = padY;
  c.addChild(tx);
  return c;
}

/**
 * 角色获得亮相。招募购买和通关解锁共用。
 *
 * 参考游戏是厅堂 + 金台 + 名牌绶带，不是暗底上一个棋子。
 * 棋子仍用 token——圣经规定 40px 棋子才是这个角色的脸，不另做立绘。
 */
export function createCharacterRevealOverlay(opts: CharacterRevealOpts): PIXI.Container {
  const { screenW: W, screenH: H, rosterId } = opts;
  const def = getCharacterDef(rosterId);
  const name = def?.name ?? rosterId;
  const job = def ? UNIT_DEFS[def.profession].name : '';
  const role = def ? describeSkillRole(def.skillRoute) : '';

  const root = new PIXI.Container();
  AudioManager.playSfx('sfx_reveal');
  root.addChild(createBackground(W, H, 'reveal_hall'));
  // 必须挡住下层招募按钮；alpha 压低，让厅堂自己说话
  root.addChild(fadeScrim(W, H, 0.28));

  const cx = W / 2;
  const titleW = Math.min(240, W - 48);
  const title = makeRibbonTitle('获  得', titleW, { fontSize: 26 });
  title.x = cx - titleW / 2;
  title.y = Math.max(28, H * 0.08);
  root.addChild(title);

  const tokenSize = 104;
  const stageY = Math.max(title.y + title.height + 36, H * 0.42);
  const stage = new PIXI.Container();
  stage.x = cx;
  stage.y = stageY;

  const platform = makeGoldPlatform(Math.min(200, W * 0.52));
  if (platform) {
    platform.y = tokenSize * 0.42;
    stage.addChild(platform);
  } else {
    const disc = new PIXI.Graphics();
    disc.beginFill(0x1a1410, 0.35);
    disc.drawCircle(0, tokenSize * 0.36, tokenSize * 0.62);
    disc.endFill();
    stage.addChild(disc);
  }

  const token = createUnitToken(
    characterArtKey({ rosterId, profession: def?.profession ?? 'sword' }),
    'player',
    tokenSize,
  );
  token.y = -tokenSize * 0.12;
  stage.addChild(token);
  root.addChild(stage);

  const nameW = Math.min(260, W - 40);
  const nameplate = makeRibbonTitle(name, nameW, { fontSize: 22, role: 'heading' });
  nameplate.x = cx - nameW / 2;
  nameplate.y = stageY + tokenSize * 0.62 + 8;
  root.addChild(nameplate);

  const tags = new PIXI.Container();
  if (job && def) {
    const accent = PROFESSION_ACCENT[def.profession];
    const light = def.profession === 'healer' || def.profession === 'cavalry';
    tags.addChild(makeTag(job, accent, light ? C.ink : 0xffffff));
  }
  if (role) {
    const roleTag = makeTag(role, 0xd8c8f0, C.ink);
    roleTag.x = tags.width + (tags.width > 0 ? 8 : 0);
    tags.addChild(roleTag);
  }
  tags.x = cx - tags.width / 2;
  tags.y = nameplate.y + nameplate.height + 8;
  root.addChild(tags);

  staggerPop([stage, nameplate, tags], 70);

  const btnW = Math.min(220, W - 80);
  const btn = makeButton('加入队伍', opts.onConfirm, {
    variant: 'primary', width: btnW, height: 48, fontSize: 17, radius: 14,
  });
  btn.x = cx - btnW / 2;
  btn.y = Math.min(H - 72, tags.y + 44);
  root.addChild(btn);

  return root;
}
