import * as PIXI from 'pixi.js';
import { makeText } from '@/theme/typography';
import { CHARACTER_DEFS, characterArtKey, type CharacterDef } from '@/data/characterCatalog';
import { getDungeonDef } from '@/data/dungeonCatalog';
import { getSkillSpec } from '@/data/skillCatalog';
import { describeSkillRole } from '@/data/skillText';
import { UNIT_DEFS } from '@/data/unitDefs';
import { unlockCharacterWithMeta, type MvpGameState } from '@/game/MvpState';
import { createHubHeader } from '@/view/hubHeader';
import { C, PROFESSION_ACCENT } from '@/view/mvpTheme';
import { createBackground, createUiIcon, createUnitToken } from '@/view/renderHelpers';
import { makeButton } from '@/ui/Button';
import { makeCard } from '@/ui/Card';
import { makeSection } from '@/ui/Section';
import { createScrollList } from '@/ui/ScrollList';
import { showToast } from '@/ui/Toast';
import { createCharacterRevealOverlay } from '@/view/characterReveal';
import { staggerPop } from '@/view/fx/celebration';

export interface RecruitCallbacks {
  onChanged: () => void;
}

const PAD = 12;
const CARD_H = 88;
const TOKEN = 48;

/** 卡片右侧行动区的宽度，正文的换行宽度要按它扣 */
const ACTION_W = 96;

/**
 * 这个角色现在怎么拿。
 *
 * 拿不到的也要写清条件，不能只列买得到的：招募页要回答的是「游戏里一共有哪些人、
 * 我该往哪儿努力」。只显示商品的话，通关解锁的角色在玩家眼里等于不存在，
 * 他也就没有理由去打那个副本。
 */
function acquireHint(state: MvpGameState, def: CharacterDef): string {
  if (def.unlock.kind === 'meta') return `魂晶 ${def.unlock.cost}`;
  if (def.unlock.kind === 'clearDungeon') {
    const d = getDungeonDef(def.unlock.dungeonId);
    return `通关「${d?.name ?? '前置副本'}」后自动加入`;
  }
  return '开局即拥有';
}

export function createRecruitView(
  state: MvpGameState,
  cb: RecruitCallbacks,
  screen: { screenWidth: number; screenHeight: number },
): PIXI.Container {
  const W = screen.screenWidth;
  const H = screen.screenHeight;
  const root = new PIXI.Container();
  root.addChild(createBackground(W, H, 'hub_bg'));

  const header = createHubHeader({
    screenWidth: W,
    title: '招募',
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

  /**
   * 一张角色卡。
   *
   * 招募页是玩家第一次见到这个角色的地方，所以卡上要够他做决定：定位 + 主技能 + 四维。
   * 上一版只有名字和四维，于是「岚骑」和「奥莉」在玩家眼里就是两串数字的区别，
   * 完全看不出一个是高机动突击、一个是远程法术。
   */
  function characterCard(def: CharacterDef, w: number, canBuy: boolean): PIXI.Container {
    const card = makeCard({
      width: w,
      height: CARD_H,
      tone: canBuy ? 'normal' : 'locked',
      accent: PROFESSION_ACCENT[def.profession],
      press: true,
      guard: scroll.wasDragging,
    });
    const dark = !canBuy;
    const nameColor = dark ? C.textOnDark : C.text;
    const subColor = dark ? 0xc8d0e0 : C.muted;

    const token = createUnitToken(characterArtKey({ rosterId: def.id, profession: def.profession }), 'player', TOKEN);
    token.x = 8 + TOKEN / 2;
    token.y = CARD_H / 2;
    // 未拥有的角色压暗成剪影感，一眼能看出「这个还不是我的」
    token.alpha = dark ? 0.55 : 1;
    card.addChild(token);

    const textX = 8 + TOKEN + 10;
    const name = makeText(`${def.name}`, 'uiStrong', { fill: nameColor, fontSize: 15 });
    name.x = textX;
    name.y = 10;
    card.addChild(name);

    const prof = makeText(
      `${UNIT_DEFS[def.profession].name} · ${describeSkillRole(def.skillRoute)}`,
      'caption',
      { fill: subColor },
    );
    prof.x = textX + name.width + 8;
    prof.y = 14;
    card.addChild(prof);

    const spec = getSkillSpec(def.defaultSkillId);
    const icon = createUiIcon(`skill_${def.defaultSkillId}`, 18);
    if (icon) {
      icon.x = textX;
      icon.y = 34;
      card.addChild(icon);
    }
    const skillTx = makeText(spec?.name ?? '', 'caption', { fill: subColor });
    skillTx.x = textX + (icon ? 22 : 0);
    skillTx.y = 36;
    card.addChild(skillTx);

    const st = def.base;
    const stats = makeText(
      `生命 ${st.maxHp}   攻击 ${st.atk}   速度 ${st.spd}   移动 ${st.move}`,
      'micro',
      { fill: subColor, fontSize: 10 },
    );
    stats.x = textX;
    stats.y = 60;
    card.addChild(stats);

    if (def.unlock.kind === 'meta') {
      const cost = def.unlock.cost;
      const btn = makeButton(
        `魂晶 ${cost}`,
        () => {
          // 卡片在滚动列表里，滑动结束时手指往往正落在这个按钮上，
          // 不拦的话滚一次页面就会买掉一个角色
          if (scroll.wasDragging()) return;
          if (unlockCharacterWithMeta(state, def.id)) {
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
            // 买不起时给的是解释而不是无反应：按钮照样可点，因为「点了没动静」
            // 会被读成 bug，而这里真正的信息是差多少魂晶
            showToast(root, `魂晶不足（还差 ${cost - state.meta.metaCurrency}）`, {
              screenWidth: W,
              color: C.soulText,
            });
          }
        },
        {
          variant: canBuy ? 'primary' : 'secondary',
          width: ACTION_W - 12,
          height: 34,
          fontSize: 13,
          radius: 8,
        },
      );
      btn.x = w - ACTION_W + 6;
      btn.y = (CARD_H - 34) / 2;
      card.addChild(btn);
    } else {
      const lock = createUiIcon('icon_lock', 18);
      if (lock) {
        lock.x = w - ACTION_W + 6;
        lock.y = CARD_H / 2 - 24;
        card.addChild(lock);
      }
      const hint = makeText(acquireHint(state, def), 'micro', {
        fill: dark ? 0xffe08a : C.text,
        fontSize: 9,
        lineHeight: 12,
        wordWrap: true,
        wordWrapWidth: ACTION_W - 12,
        align: 'left',
      });
      hint.x = w - ACTION_W + 6;
      hint.y = CARD_H / 2 - 2;
      card.addChild(hint);
    }

    return card;
  }

  const sectionW = W - PAD * 2;
  let y = 4;
  const pops: PIXI.Container[] = [];

  function addSection(title: string, note: string | undefined, rows: PIXI.Container[]): void {
    const contentH = rows.length === 0
      ? 0
      : rows.reduce((h, r) => h + r.height + 8, 0) - 8;
    const sec = makeSection({ title, note, width: sectionW, contentHeight: contentH, x: PAD, y });
    let ry = 0;
    for (const r of rows) {
      r.y = ry;
      sec.body.addChild(r);
      ry += r.height + 8;
    }
    scroll.content.addChild(sec.root);
    y += sec.height + 10;
  }

  function textRow(msg: string): PIXI.Container {
    const c = new PIXI.Container();
    const t = makeText(msg, 'body', {
      fill: C.muted,
      lineHeight: 18,
      wordWrap: true,
      wordWrapWidth: sectionW - PAD * 2,
    });
    c.addChild(t);
    return c;
  }

  if (buyable.length > 0) {
    addSection(
      '魂晶招募',
      `持有 ${state.meta.metaCurrency}`,
      buyable.map((def) => {
        const cost = def.unlock.kind === 'meta' ? def.unlock.cost : 0;
        const card = characterCard(def, sectionW - PAD * 2, state.meta.metaCurrency >= cost);
        pops.push(card);
        return card;
      }),
    );
  }

  if (conditional.length > 0) {
    addSection(
      '战绩解锁',
      undefined,
      conditional.map((def) => {
        const card = characterCard(def, sectionW - PAD * 2, false);
        pops.push(card);
        return card;
      }),
    );
  }

  if (unowned.length === 0) {
    addSection('全员到齐', undefined, [
      textRow('现有角色已全部招募。后续版本会加入新角色与新的获取方式（活动、试炼奖励）。'),
    ]);
  }

  addSection('魂晶从哪来', undefined, [
    textRow(
      '· 每场战斗首次通过掉落少量魂晶\n'
      + '· Boss 与章节通关掉落大额魂晶\n'
      + '· 已通关的副本每天可扫荡，照样给魂晶\n'
      + '· 魂晶还用于角色升级和学习技能（在角色页操作）',
    ),
  ]);

  scroll.refresh(y + 16);
  staggerPop(pops.slice(0, 6), 45);
  return root;
}
