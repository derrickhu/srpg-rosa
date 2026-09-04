import * as PIXI from 'pixi.js';
import { makeText } from '@/theme/typography';
import { CHARACTER_DEFS, characterArtKey, type CharacterDef } from '@/data/characterCatalog';
import { getDungeonDef } from '@/data/dungeonCatalog';
import { getSkillSpec } from '@/data/skillCatalog';
import { describeSkillRole } from '@/data/skillText';
import { UNIT_DEFS } from '@/data/unitDefs';
import { unlockCharacterWithMeta, type MvpGameState } from '@/game/MvpState';
import { createHubHeader } from '@/view/hubHeader';
import { C, PROFESSION_ACCENT, mix } from '@/view/mvpTheme';
import { isDisplayLive } from '@/view/pixiLive';
import { createBackground, createUiIcon, createUnitToken } from '@/view/renderHelpers';
import { makeButton } from '@/ui/Button';
import { makeCard } from '@/ui/Card';
import { createScrollList } from '@/ui/ScrollList';
import { showToast } from '@/ui/Toast';
import { AudioManager } from '@/core/AudioManager';
import { makeGoldPlatform } from '@/ui/chrome';
import { createCharacterRevealOverlay } from '@/view/characterReveal';
import { staggerPop } from '@/view/fx/celebration';

export interface RecruitCallbacks {
  onChanged: () => void;
}

const PAD = 16;
const TOKEN = 96;
const LOCK_H = 86;
const STAGE_H = 292;

function chipTextColor(fill: number): number {
  const r = (fill >> 16) & 0xff;
  const g = (fill >> 8) & 0xff;
  const b = fill & 0xff;
  return (r * 299 + g * 587 + b * 114) / 1000 > 160 ? C.ink : 0xffffff;
}

function makeChip(label: string, fill: number): PIXI.Container {
  const c = new PIXI.Container();
  const tx = makeText(label, 'ui', { fill: chipTextColor(fill), fontSize: 11 });
  const w = Math.ceil(tx.width + 16);
  const h = 20;
  const g = new PIXI.Graphics();
  g.lineStyle(1.5, C.ink, 1, 0);
  g.beginFill(fill, 1);
  g.drawRoundedRect(0, 0, w, h, 10);
  g.endFill();
  c.addChild(g);
  tx.anchor.set(0.5);
  tx.x = w / 2;
  tx.y = h / 2;
  c.addChild(tx);
  return c;
}

/**
 * 这个角色现在怎么拿。
 *
 * 拿不到的也要写清条件，不能只列买得到的：招募页要回答的是「游戏里一共有哪些人、
 * 我该往哪儿努力」。只显示商品的话，通关解锁的角色在玩家眼里等于不存在，
 * 他也就没有理由去打那个副本。
 */
export function acquireHint(state: MvpGameState, def: CharacterDef): string {
  if (def.unlock.kind === 'meta') return `魂晶 ${def.unlock.cost}`;
  if (def.unlock.kind === 'clearDungeon') {
    const d = getDungeonDef(def.unlock.dungeonId);
    return `通关「${d?.name ?? '前置副本'}」`;
  }
  if (def.unlock.kind === 'story') return '跟随冒险加入';
  return '开局即拥有';
}

function attachIdleBob(node: PIXI.Container, amp = 3): void {
  const base = node.y;
  let acc = 0;
  const step = (): void => {
    if (!isDisplayLive(node)) {
      PIXI.Ticker.shared.remove(step);
      return;
    }
    acc += PIXI.Ticker.shared.deltaMS;
    node.y = base + Math.sin(acc / 520) * amp;
  };
  PIXI.Ticker.shared.add(step);
}

export function createRecruitView(
  state: MvpGameState,
  cb: RecruitCallbacks,
  screen: { screenWidth: number; screenHeight: number },
): PIXI.Container {
  const W = screen.screenWidth;
  const H = screen.screenHeight;
  const root = new PIXI.Container();
  root.addChild(createBackground(W, H, 'recruit_bg'));

  const header = createHubHeader({
    screenWidth: W,
    title: '招募',
    page: 'recruit',
    soul: state.meta.metaCurrency,
  });
  root.addChild(header.root);

  const scroll = createScrollList({
    y: header.height,
    width: W,
    height: Math.max(80, H - header.height),
    showBar: true,
  });
  root.addChild(scroll.root);

  const owned = new Set(state.meta.roster.map((m) => m.rosterId));
  const unowned = CHARACTER_DEFS.filter((d) => !owned.has(d.id));
  const buyable = unowned.filter((d) => d.unlock.kind === 'meta');
  const conditional = unowned.filter((d) => d.unlock.kind !== 'meta');

  const innerW = W - PAD * 2;
  let y = 8;
  const pops: PIXI.Container[] = [];

  function tryRecruit(def: CharacterDef): void {
    if (def.unlock.kind !== 'meta') return;
    if (scroll.wasDragging()) return;
    const cost = def.unlock.cost;
    if (unlockCharacterWithMeta(state, def.id)) {
      AudioManager.playSfx('sfx_soul_spend');
      const reveal = createCharacterRevealOverlay({
        screenW: W,
        screenH: H,
        rosterId: def.id,
        onConfirm: () => {
          if (reveal.parent) reveal.parent.removeChild(reveal);
          reveal.destroy({ children: true });
          cb.onChanged();
        },
      });
      root.addChild(reveal);
    } else {
      showToast(root, `魂晶不足（还差 ${cost - state.meta.metaCurrency}）`, {
        screenWidth: W,
        color: C.soulText,
        deny: true,
      });
    }
  }

  function featuredStage(def: CharacterDef): PIXI.Container {
    const cost = def.unlock.kind === 'meta' ? def.unlock.cost : 0;
    const stage = new PIXI.Container();
    const h = STAGE_H;
    stage.hitArea = new PIXI.Rectangle(0, 0, innerW, h);

    const cx = innerW / 2;
    const tokenWrap = new PIXI.Container();
    tokenWrap.x = cx;
    tokenWrap.y = 72;
    const platform = makeGoldPlatform(Math.min(176, innerW * 0.52));
    if (platform) {
      platform.y = TOKEN * 0.38;
      tokenWrap.addChild(platform);
    } else {
      const disc = new PIXI.Graphics();
      disc.beginFill(C.ink, 0.28);
      disc.drawCircle(0, TOKEN * 0.34, TOKEN * 0.55);
      disc.endFill();
      tokenWrap.addChild(disc);
    }
    const token = createUnitToken(
      characterArtKey({ rosterId: def.id, profession: def.profession }),
      'player',
      TOKEN,
    );
    token.y = -TOKEN * 0.08;
    tokenWrap.addChild(token);
    stage.addChild(tokenWrap);
    attachIdleBob(token, 3);

    const nameTx = makeText(def.name, 'heading', {
      fill: C.paper,
      fontSize: 26,
      stroke: C.ink,
      strokeThickness: 5,
      letterSpacing: 1,
    });
    nameTx.anchor.set(0.5, 0);
    nameTx.x = cx;
    nameTx.y = 138;
    stage.addChild(nameTx);

    const spec = getSkillSpec(def.defaultSkillId);
    const chips = new PIXI.Container();
    const job = makeChip(UNIT_DEFS[def.profession].name, PROFESSION_ACCENT[def.profession]);
    const role = makeChip(describeSkillRole(def.skillRoute), C.panel);
    chips.addChild(job);
    role.x = job.width + 6;
    chips.addChild(role);
    chips.x = cx - chips.width / 2;
    chips.y = 170;
    stage.addChild(chips);

    if (spec) {
      const skillTx = makeText(spec.name, 'caption', {
        fill: C.paper,
        fontSize: 12,
        stroke: C.ink,
        strokeThickness: 3,
      });
      skillTx.anchor.set(0.5, 0);
      skillTx.x = cx;
      skillTx.y = 194;
      stage.addChild(skillTx);
    }

    const btnW = Math.min(200, innerW - 48);
    const btn = makeButton('招  募', () => {
      tryRecruit(def);
    }, {
      variant: 'primary',
      width: btnW,
      height: 46,
      fontSize: 17,
      radius: 14,
    });
    btn.x = cx - btnW / 2;
    btn.y = h - 50;
    stage.addChild(btn);

    const costRow = new PIXI.Container();
    const soul = createUiIcon('icon_soul', 16);
    const costTx = makeText(`${cost}`, 'uiStrong', {
      fill: C.paper,
      fontSize: 13,
      stroke: C.ink,
      strokeThickness: 3,
    });
    let costX = 0;
    if (soul) {
      soul.x = 0;
      soul.y = 0;
      costRow.addChild(soul);
      costX = 20;
    }
    costTx.x = costX;
    costTx.y = 0;
    costRow.addChild(costTx);
    costRow.x = cx - (costX + costTx.width) / 2;
    costRow.y = btn.y - 22;
    stage.addChild(costRow);

    pops.push(stage);
    return stage;
  }

  function lockedStrip(defs: CharacterDef[]): PIXI.Container {
    const wrap = new PIXI.Container();
    const title = makeText('战绩解锁', 'title', {
      fill: C.paper,
      fontSize: 15,
      stroke: C.ink,
      strokeThickness: 3,
    });
    title.x = 4;
    title.y = 0;
    wrap.addChild(title);

    const gap = 8;
    const colW = Math.floor((innerW - gap * (defs.length - 1)) / Math.max(1, defs.length));
    defs.forEach((def, i) => {
      const card = makeCard({
        width: colW,
        height: LOCK_H,
        tone: 'locked',
        accent: mix(PROFESSION_ACCENT[def.profession], C.panel, 0.35),
      });
      card.x = i * (colW + gap);
      card.y = 26;

      const tok = createUnitToken(
        characterArtKey({ rosterId: def.id, profession: def.profession }),
        'player',
        36,
      );
      tok.alpha = 0.5;
      tok.x = colW / 2;
      tok.y = 22;
      card.addChild(tok);

      const nm = makeText(def.name, 'caption', { fill: C.paper, fontSize: 12 });
      nm.anchor.set(0.5, 0);
      nm.x = colW / 2;
      nm.y = 40;
      card.addChild(nm);

      const hint = makeText(acquireHint(state, def), 'micro', {
        fill: C.paper,
        fontSize: 9,
        wordWrap: true,
        wordWrapWidth: colW - 10,
        align: 'center',
      });
      hint.anchor.set(0.5, 0);
      hint.x = colW / 2;
      hint.y = 58;
      card.addChild(hint);
      wrap.addChild(card);
      pops.push(card);
    });

    wrap.hitArea = new PIXI.Rectangle(0, 0, innerW, 26 + LOCK_H);
    return wrap;
  }

  if (buyable.length > 0) {
    for (const def of buyable) {
      const stage = featuredStage(def);
      stage.x = PAD;
      stage.y = y;
      scroll.content.addChild(stage);
      y += STAGE_H + 14;
    }
  }

  if (conditional.length > 0) {
    const strip = lockedStrip(conditional);
    strip.x = PAD;
    strip.y = y;
    scroll.content.addChild(strip);
    y += 26 + LOCK_H + 16;
  }

  if (unowned.length === 0) {
    const done = makeText('现有角色已全部招募', 'body', {
      fill: C.paper,
      stroke: C.ink,
      strokeThickness: 3,
    });
    done.anchor.set(0.5, 0);
    done.x = W / 2;
    done.y = y + 12;
    scroll.content.addChild(done);
    y += 48;
  }

  scroll.refresh(y + 48);
  staggerPop(pops.slice(0, 6), 50);
  return root;
}
