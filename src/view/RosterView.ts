import * as PIXI from 'pixi.js';
import { makeText } from '@/theme/typography';
import { UNIT_DEFS } from '@/data/unitDefs';
import {
  canCharacterUseSkill,
  getCharacterDef,
  levelUpCost,
  type CharacterDef,
} from '@/data/characterCatalog';
import { getDungeonDef } from '@/data/dungeonCatalog';
import { getSkillSpec } from '@/data/skillCatalog';
import { characterEffectiveStats, lockedCharacterDefs } from '@/game/characterFactory';
import type { Character } from '@/game/characterTypes';
import {
  MAX_CHARACTER_LEVEL,
  SKILL_LEARN_COST,
  equipSkill,
  learnSkill,
  levelUpCharacter,
  unlockCharacterWithMeta,
  unlockableSkillsFor,
  type MvpGameState,
} from '@/game/MvpState';
import {
  createBackground,
  createCurrencyPill,
  createUiIcon,
  createUnitToken,
} from '@/view/renderHelpers';
import { makeButton } from '@/ui/Button';

export interface RosterCallbacks {
  /** meta 状态变更后持久化并重绘 */
  onChanged: () => void;
}

const PANEL_BG = 0xfefef6;
const TEXT = 0x3a3a2a;
const MUTED = 0x888877;

function unlockConditionText(def: CharacterDef): string {
  if (def.unlock.kind === 'meta') return `魂晶 ${def.unlock.cost} 解锁`;
  if (def.unlock.kind === 'clearDungeon') {
    const d = getDungeonDef(def.unlock.dungeonId);
    return `通关「${d?.name ?? '前置副本'}」`;
  }
  return '';
}

/** 角色页：上阵网格 + 收藏（未解锁灰化），点击弹出养成详情 */
export function createRosterView(
  state: MvpGameState,
  cb: RosterCallbacks,
  screen: { screenWidth: number; screenHeight: number },
): PIXI.Container {
  const W = screen.screenWidth;
  const H = screen.screenHeight;
  const root = new PIXI.Container();
  root.addChild(createBackground(W, H));

  // 顶栏：魂晶
  const pill = createCurrencyPill('icon_soul', `${state.meta.metaCurrency}`);
  pill.x = 8;
  pill.y = 8;
  root.addChild(pill);

  const titleTx = makeText('角  色', 'title', { fill: 0xffffff });
  titleTx.anchor.set(0.5, 0);
  titleTx.x = W / 2; titleTx.y = 12;
  root.addChild(titleTx);

  let y = pill.y + pill.height + 14;

  const sectionTitle = (label: string): void => {
    const t = makeText(label, 'uiStrong', { fill: 0xfff3d8 });
    t.x = 12; t.y = y;
    root.addChild(t);
    y += 24;
  };

  const cols = Math.max(3, Math.floor((W - 24) / 86));
  const gap = 8;
  const cardW = Math.floor((W - 24 - gap * (cols - 1)) / cols);
  const cardH = cardW + 34;

  // ---- 已拥有 ----
  sectionTitle('我的角色');
  const owned = state.meta.roster;
  owned.forEach((m, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const c = buildOwnedCard(m, cardW, cardH);
    c.x = 12 + col * (cardW + gap);
    c.y = y + row * (cardH + gap);
    root.addChild(c);
  });
  y += Math.ceil(owned.length / cols) * (cardH + gap) + 10;

  // ---- 收藏（未解锁）----
  const locked = lockedCharacterDefs(owned);
  if (locked.length > 0) {
    sectionTitle('收藏');
    locked.forEach((def, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const c = buildLockedCard(def, cardW, cardH);
      c.x = 12 + col * (cardW + gap);
      c.y = y + row * (cardH + gap);
      root.addChild(c);
    });
    y += Math.ceil(locked.length / cols) * (cardH + gap);
  }

  function buildOwnedCard(m: Character, w: number, h: number): PIXI.Container {
    const c = new PIXI.Container();
    const g = new PIXI.Graphics();
    g.lineStyle(2, 0x9a86c8, 0.9);
    g.beginFill(0xffffff, 0.18);
    g.drawRoundedRect(0, 0, w, h, 10);
    g.endFill();
    c.addChild(g);
    const token = createUnitToken(m.profession, 'player', Math.min(w - 14, 52));
    token.x = w / 2; token.y = h / 2 - 10;
    c.addChild(token);
    const nameTx = makeText(m.name, 'uiStrong', { fill: 0xffffff, fontSize: 12 });
    nameTx.anchor.set(0.5, 0); nameTx.x = w / 2; nameTx.y = h - 32;
    c.addChild(nameTx);
    const lvTx = makeText(`Lv.${m.level}`, 'caption', { fill: 0xffe08a, fontSize: 10 });
    lvTx.anchor.set(0.5, 0); lvTx.x = w / 2; lvTx.y = h - 17;
    c.addChild(lvTx);
    c.eventMode = 'static'; c.cursor = 'pointer';
    c.hitArea = new PIXI.Rectangle(0, 0, w, h);
    c.on('pointertap', () => openCharacterPanel(m));
    return c;
  }

  function buildLockedCard(def: CharacterDef, w: number, h: number): PIXI.Container {
    const c = new PIXI.Container();
    const g = new PIXI.Graphics();
    g.beginFill(0x000000, 0.35);
    g.drawRoundedRect(0, 0, w, h, 10);
    g.endFill();
    c.addChild(g);
    const lock = createUiIcon('icon_lock', 26);
    if (lock) {
      lock.x = w / 2 - 13; lock.y = h / 2 - 27;
      c.addChild(lock);
    }
    const nameTx = makeText(def.name, 'caption', { fill: 0xcccccc });
    nameTx.anchor.set(0.5, 0); nameTx.x = w / 2; nameTx.y = h - 32;
    c.addChild(nameTx);
    const condTx = makeText(unlockConditionText(def), 'micro', {
      fill: 0xffe08a,
      wordWrap: true, wordWrapWidth: w - 8, align: 'center',
    });
    condTx.anchor.set(0.5, 0); condTx.x = w / 2; condTx.y = h - 18;
    c.addChild(condTx);
    if (def.unlock.kind === 'meta') {
      c.eventMode = 'static'; c.cursor = 'pointer';
      c.hitArea = new PIXI.Rectangle(0, 0, w, h);
      c.on('pointertap', () => {
        if (unlockCharacterWithMeta(state, def.id)) cb.onChanged();
      });
    }
    return c;
  }

  // ---- 角色养成弹窗 ----
  const overlay = new PIXI.Container();
  overlay.visible = false;
  root.addChild(overlay);

  function closeOverlay(): void {
    overlay.visible = false;
    overlay.removeChildren();
  }

  function openCharacterPanel(m: Character): void {
    overlay.removeChildren();
    overlay.visible = true;
    const dim = new PIXI.Graphics();
    dim.beginFill(0x000000, 0.55); dim.drawRect(0, 0, W, H); dim.endFill();
    dim.eventMode = 'static';
    dim.on('pointertap', (e) => { if (e.target === dim) closeOverlay(); });
    overlay.addChild(dim);

    const def = getCharacterDef(m.catalogId ?? m.rosterId);
    const panelW = Math.min(320, W - 24);
    const panel = new PIXI.Container();
    panel.x = (W - panelW) / 2;
    panel.eventMode = 'static';

    let cy = 14;
    const nameTx = makeText(`${m.name}  Lv.${m.level}`, 'title', { fill: TEXT, fontSize: 17 });
    nameTx.x = 14; nameTx.y = cy; panel.addChild(nameTx);
    const profTx = makeText(UNIT_DEFS[m.profession].name, 'body', { fill: MUTED });
    profTx.x = 14; profTx.y = cy + 24; panel.addChild(profTx);
    cy += 48;

    const eff = characterEffectiveStats(m);
    const statLine = `生命 ${eff.maxHp}   攻击 ${eff.atk}   速度 ${eff.spd}   移动 ${eff.move}`;
    const statTx = makeText(statLine, 'body', { fill: TEXT });
    statTx.x = 14; statTx.y = cy; panel.addChild(statTx);
    cy += 26;

    // 升级
    const canLevel = m.level < MAX_CHARACTER_LEVEL;
    const cost = levelUpCost(m.level);
    const lvBtn = makeButton(
      canLevel ? `升级（魂晶 ${cost}）` : '已满级',
      () => {
        if (levelUpCharacter(state, m.rosterId)) { closeOverlay(); cb.onChanged(); }
      },
      {
        width: panelW - 28, height: 38,
        fillColor: canLevel ? 0x5a9e3a : 0x999999, fillAlpha: 0.9,
        borderColor: canLevel ? 0x4a8e2a : 0x888888, textColor: 0xffffff, fontSize: 14, radius: 8,
      },
    );
    lvBtn.x = 14; lvBtn.y = cy; panel.addChild(lvBtn);
    cy += 48;

    // 已装配技能
    const equipTitle = makeText('装配技能（点击切换）', 'uiStrong', { fill: 0x6b4c2a, fontSize: 12 });
    equipTitle.x = 14; equipTitle.y = cy; panel.addChild(equipTitle);
    cy += 20;
    let sx = 14;
    // 过一遍路线判定而不是直接列 `ownedSkillIds`：老存档里可能留着可学列表收紧前
    // 学到的越界技能，列出来只会是一个点了没反应的按钮（`equipSkill` 会拒）。
    for (const skId of m.ownedSkillIds) {
      const spec = getSkillSpec(skId);
      if (!spec) continue;
      if (def && !canCharacterUseSkill(def, skId)) continue;
      const active = m.activeSkillId === skId;
      const chip = makeButton(spec.name, () => {
        if (equipSkill(state, m.rosterId, skId)) { closeOverlay(); cb.onChanged(); }
      }, {
        width: 92, height: 30,
        fillColor: active ? 0xe8a030 : 0xffffff, fillAlpha: active ? 0.9 : 0.6,
        borderColor: active ? 0xcc8020 : 0xcccccc, textColor: active ? 0xffffff : TEXT, fontSize: 12, radius: 6,
      });
      chip.x = sx; chip.y = cy; panel.addChild(chip);
      sx += 98;
      if (sx + 92 > panelW) { sx = 14; cy += 36; }
    }
    cy += 40;

    // 可学习技能
    const learnable = def ? unlockableSkillsFor(m) : [];
    if (learnable.length > 0) {
      const learnTitle = makeText(`学习新技能（每个魂晶 ${SKILL_LEARN_COST}）`, 'uiStrong', {
        fill: 0x6b4c2a, fontSize: 12,
      });
      learnTitle.x = 14; learnTitle.y = cy; panel.addChild(learnTitle);
      cy += 20;
      let lx = 14;
      for (const skId of learnable) {
        const spec = getSkillSpec(skId);
        if (!spec) continue;
        const chip = makeButton(`+${spec.name}`, () => {
          if (learnSkill(state, m.rosterId, skId)) { closeOverlay(); cb.onChanged(); }
        }, {
          width: 100, height: 30, fillColor: 0x4488cc, fillAlpha: 0.85,
          borderColor: 0x3377bb, textColor: 0xffffff, fontSize: 12, radius: 6,
        });
        chip.x = lx; chip.y = cy; panel.addChild(chip);
        lx += 106;
        if (lx + 100 > panelW) { lx = 14; cy += 36; }
      }
      cy += 40;
    }

    const closeBtn = makeButton('关闭', () => closeOverlay(), {
      variant: 'ghost', width: panelW - 28, height: 34, fontSize: 13, radius: 8,
    });
    closeBtn.x = 14; closeBtn.y = cy; panel.addChild(closeBtn);
    cy += 44;

    const bg = new PIXI.Graphics();
    bg.beginFill(PANEL_BG, 0.98);
    bg.drawRoundedRect(0, 0, panelW, cy, 14);
    bg.endFill();
    panel.addChildAt(bg, 0);
    panel.y = Math.max(20, (H - cy) / 2);
    overlay.addChild(panel);
  }

  return root;
}
