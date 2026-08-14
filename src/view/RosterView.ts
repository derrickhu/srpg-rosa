import * as PIXI from 'pixi.js';
import { makeText } from '@/theme/typography';
import { UNIT_DEFS } from '@/data/unitDefs';
import {
  CHARACTER_DEFS,
  canCharacterUseSkill,
  characterStatsAtLevel,
  getCharacterDef,
  levelUpCost,
} from '@/data/characterCatalog';
import { getSkillSpec } from '@/data/skillCatalog';
import { describeSkillRole, describeSkillShape } from '@/data/skillText';
import { characterEffectiveStats } from '@/game/characterFactory';
import type { Character } from '@/game/characterTypes';
import { resolveBattleSkillIdForCharacter } from '@/game/state/DeployManager';
import {
  MAX_CHARACTER_LEVEL,
  SKILL_LEARN_COST,
  equipSkill,
  learnSkill,
  levelUpCharacter,
  unlockableSkillsFor,
  type MvpGameState,
} from '@/game/MvpState';
import { createHubHeader } from '@/view/hubHeader';
import { C } from '@/view/mvpTheme';
import { createBackground, createUiIcon, createUnitToken } from '@/view/renderHelpers';
import { characterInfoModel } from '@/view/unitInfoModel';
import { createUnitInfoPanel } from '@/view/unitInfoPanel';
import { makeButton } from '@/ui/Button';
import { makeCard } from '@/ui/Card';
import { createModal, type ModalHandle } from '@/ui/Modal';
import { createScrollList } from '@/ui/ScrollList';
import { makeSection } from '@/ui/Section';
import { showToast } from '@/ui/Toast';

export interface RosterCallbacks {
  /** meta 状态变更后持久化并重绘整页 */
  onChanged: () => void;
  /**
   * 只存盘，不重绘。
   *
   * 详情弹窗里的升级/学技能要用它：走 `onChanged` 会把整页连弹窗一起重建，
   * 而玩家的真实操作是「连升三级再关掉」，每点一次就被弹回网格根本没法用。
   */
  onPersist: () => void;
}

const PAD = 12;
const GRID_GAP = 8;
/** 技能行高：两行文字（名字 + 范围）加上下留白 */
const SKILL_ROW_H = 40;

/** 属性行的展示名，顺序即显示顺序 */
const STAT_ROWS: { key: 'maxHp' | 'atk' | 'spd' | 'move'; label: string }[] = [
  { key: 'maxHp', label: '生命' },
  { key: 'atk', label: '攻击' },
  { key: 'spd', label: '速度' },
  { key: 'move', label: '移动' },
];

/**
 * 角色页：只管**已拥有**的角色，看板 + 养成。
 *
 * 未拥有的角色整块搬到招募页了。原来这里有个「收藏」区，点一下也是花魂晶解锁，
 * 和商店页是同一件事的两个入口——同一个操作有两个地方能做，玩家得先猜哪边是正的，
 * 而两边的价格万一哪天写歪了还会对不上。
 */
export function createRosterView(
  state: MvpGameState,
  cb: RosterCallbacks,
  screen: { screenWidth: number; screenHeight: number },
): PIXI.Container {
  const W = screen.screenWidth;
  const H = screen.screenHeight;
  const root = new PIXI.Container();
  root.addChild(createBackground(W, H));

  const header = createHubHeader({
    screenWidth: W,
    title: '角色',
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

  const sectionW = W - PAD * 2;
  const bodyW = sectionW - PAD * 2;
  const cols = Math.max(3, Math.floor(bodyW / 100));
  const cardW = Math.floor((bodyW - GRID_GAP * (cols - 1)) / cols);
  const cardH = cardW + 40;

  const owned = state.meta.roster;
  const rows = Math.ceil(owned.length / cols);
  const gridH = rows === 0 ? 24 : rows * cardH + (rows - 1) * GRID_GAP;

  const grid = makeSection({
    title: '我的角色',
    note: `${owned.length} 名`,
    width: sectionW,
    contentHeight: gridH,
    x: PAD,
    y: 4,
  });
  owned.forEach((m, i) => {
    const card = buildOwnedCard(m, cardW, cardH);
    card.x = (i % cols) * (cardW + GRID_GAP);
    card.y = Math.floor(i / cols) * (cardH + GRID_GAP);
    grid.body.addChild(card);
  });
  scroll.content.addChild(grid.root);

  const notOwned = CHARACTER_DEFS.length - owned.length;
  if (notOwned > 0) {
    const hint = makeSection({
      title: '还能招人',
      width: sectionW,
      contentHeight: 22,
      x: PAD,
      y: 4 + grid.height + 10,
    });
    const t = makeText(`还有 ${notOwned} 名角色没有加入，去「招募」看获取方式。`, 'caption', {
      fill: C.muted,
      wordWrap: true,
      wordWrapWidth: bodyW,
    });
    hint.body.addChild(t);
    scroll.content.addChild(hint.root);
  }
  scroll.refresh();

  /**
   * 网格卡。
   *
   * 加了**主技能图标**：一队人里谁带的是横扫谁带的是突刺，是玩家决定升谁、给谁学新招的
   * 主要依据，原来卡上只有名字和等级，这件事必须一个个点开才知道。图标和战斗操作条、
   * 三选一卡片是同一张图，所以这里认过的符号在战斗里直接能用。
   */
  function buildOwnedCard(m: Character, w: number, h: number): PIXI.Container {
    const card = makeCard({
      width: w,
      height: h,
      onTap: () => openDetail(m),
      guard: scroll.wasDragging,
    });

    const token = createUnitToken(m.profession, 'player', Math.min(w - 16, 54));
    token.x = w / 2;
    token.y = h / 2 - 12;
    card.addChild(token);

    const skillId = resolveBattleSkillIdForCharacter(state, m);
    const icon = createUiIcon(`skill_${skillId}`, 20);
    if (icon) {
      // 右上角：贴图角色本身居中，右上是唯一不会压到脸的位置
      const ring = new PIXI.Graphics();
      ring.lineStyle(1.5, C.ink, 0.9, 0);
      ring.beginFill(C.paper, 1);
      ring.drawCircle(w - 16, 16, 13);
      ring.endFill();
      card.addChild(ring);
      icon.x = w - 16 - 10;
      icon.y = 16 - 10;
      card.addChild(icon);
    }

    const nameTx = makeText(m.name, 'uiStrong', { fill: C.text, fontSize: 12 });
    nameTx.anchor.set(0.5, 0);
    nameTx.x = w / 2;
    nameTx.y = h - 34;
    card.addChild(nameTx);

    const lvTx = makeText(`Lv.${m.level}`, 'caption', { fill: C.muted, fontSize: 10 });
    lvTx.anchor.set(0.5, 0);
    lvTx.x = w / 2;
    lvTx.y = h - 18;
    card.addChild(lvTx);

    return card;
  }

  // ---------------- 详情 + 养成弹窗 ----------------

  let modal: ModalHandle | null = null;
  let stopPanel: (() => void) | null = null;
  /** 弹窗里改过东西：关掉时要重绘网格，不然卡上的等级还是旧的 */
  let dirty = false;

  function closeDetail(): void {
    stopPanel?.();
    stopPanel = null;
    modal = null;
    if (dirty) {
      dirty = false;
      cb.onChanged();
    }
  }

  function openDetail(m: Character): void {
    modal?.close();
    const panelW = Math.min(340, W - 20);
    const panelH = Math.min(H - 24, 560);
    const md = createModal({
      screenWidth: W,
      screenHeight: H,
      panelWidth: panelW,
      panelHeight: panelH,
      light: true,
      title: `${m.name}  Lv.${m.level}`,
      showClose: true,
      scrollable: true,
      onClose: closeDetail,
    });
    modal = md;
    root.addChild(md.root);
    fillDetail(md, m);
  }

  /** 重新填一次弹窗内容（升级/学技能之后原地刷新，不关窗） */
  function refillDetail(m: Character): void {
    if (!modal) return;
    stopPanel?.();
    stopPanel = null;
    modal.body.removeChildren();
    fillDetail(modal, m);
  }

  /**
   * 弹窗内容的顺序：**能操作的在前，供查阅的在后**。
   *
   * 反过来排过一版（详细资料在最上面），结果是资料面板本身就有三百多像素高，
   * 把升级和学技能整个推到折叠线以下——功能还在，但玩家打开弹窗看不见它，
   * 等于没有。查阅型内容晚一屏看到没有代价，操作入口晚一屏就是功能丢失。
   */
  function fillDetail(md: ModalHandle, m: Character): void {
    const w = md.bodySize.width;
    let y = 0;
    y += addGrowthBlock(md, m, w, y);
    y += addSkillBlock(md, m, w, y);
    y += addDetailBlock(md, m, w, y);
    md.refresh();
  }

  /**
   * 详细资料：和布阵页、战斗页完全同一块渲染。
   *
   * 技能图标、CD、效果说明、范围格子一次到位，而且**保证和战斗里结算的是同一个数**。
   * 这页原来手写了一版只有文字 chip 的简版，技能打多远一个字都没有。
   */
  function addDetailBlock(md: ModalHandle, m: Character, w: number, top: number): number {
    const box = new PIXI.Container();
    box.y = top;
    md.body.addChild(box);

    const label = makeText('详细资料', 'uiStrong', { fill: C.text, fontSize: 13 });
    box.addChild(label);
    let y = label.height + 4;

    const line = new PIXI.Graphics();
    line.lineStyle(1, C.ink, 0.12);
    line.moveTo(0, y);
    line.lineTo(w, y);
    box.addChild(line);
    y += 4;

    const info = createUnitInfoPanel(characterInfoModel(state, m), w, { drawBg: false });
    info.view.y = y;
    box.addChild(info.view);
    stopPanel = info.stop;

    return y + info.height + 8;
  }

  /** 升级区：花多少、升完变成什么样。返回占用高度 */
  function addGrowthBlock(md: ModalHandle, m: Character, w: number, top: number): number {
    const def = getCharacterDef(m.catalogId ?? m.rosterId);
    const box = new PIXI.Container();
    box.y = top;
    md.body.addChild(box);

    let y = 0;
    const title = makeText('培养', 'uiStrong', { fill: C.text, fontSize: 13 });
    box.addChild(title);
    const route = makeText(
      def ? `${UNIT_DEFS[m.profession].name} · ${describeSkillRole(def.skillRoute)}` : '',
      'caption',
      { fill: C.muted },
    );
    route.anchor.set(1, 0);
    route.x = w;
    route.y = 2;
    box.addChild(route);
    y += title.height + 6;

    const maxed = m.level >= MAX_CHARACTER_LEVEL;
    const cur = characterEffectiveStats(m);
    const next = def && !maxed ? characterStatsAtLevel(def, m.level + 1) : null;

    // 当前四维摆在最前面：详细资料里也有，但那在下一屏，而「他现在多强」是
    // 决定要不要花这笔魂晶的前提，不该需要先滚一趟再滚回来
    const now = makeText(
      `生命 ${cur.maxHp}   攻击 ${cur.atk}   速度 ${cur.spd}   移动 ${cur.move}`,
      'caption',
      { fill: C.text },
    );
    now.y = y;
    box.addChild(now);
    y += now.height + 6;

    if (next) {
      // 「升级奖励」写成前后对比而不是一句「攻击+2」：玩家真正要判断的是
      // 这几点加下去够不够跨过某个门槛（比如两刀砍死杂兵），只给增量他还得自己做加法。
      for (const row of STAT_ROWS) {
        const from = cur[row.key];
        const to = next[row.key];
        if (to === from) continue;
        const line = new PIXI.Container();
        line.y = y;
        const lb = makeText(row.label, 'caption', { fill: C.muted });
        line.addChild(lb);
        const val = makeText(`${from} → ${to}`, 'uiStrong', { fill: C.text, fontSize: 12 });
        val.x = 44;
        line.addChild(val);
        const delta = makeText(`+${to - from}`, 'uiStrong', { fill: 0x3a8a5a, fontSize: 12 });
        delta.anchor.set(1, 0);
        delta.x = w;
        line.addChild(delta);
        box.addChild(line);
        y += 18;
      }
      y += 4;
    }

    const cost = levelUpCost(m.level);
    const affordable = state.meta.metaCurrency >= cost;
    const btn = makeButton(
      maxed ? '已满级' : `升级  魂晶 ${cost}`,
      () => {
        // 按钮在可滚内容里，滑到这儿松手也会派发 tap
        if (md.wasDragging() || maxed) return;
        if (levelUpCharacter(state, m.rosterId)) {
          dirty = true;
          cb.onPersist();
          md.setTitle(`${m.name}  Lv.${m.level}`);
          refillDetail(m);
        } else {
          showToast(md.root, `魂晶不足（还差 ${cost - state.meta.metaCurrency}）`, {
            x: PAD,
            y: H - 40,
            color: C.soulText,
          });
        }
      },
      {
        variant: maxed || !affordable ? 'secondary' : 'primary',
        width: w,
        height: 38,
        fontSize: 14,
        radius: 8,
      },
    );
    btn.y = y;
    box.addChild(btn);
    y += 38 + 10;

    return y;
  }

  /** 技能装配 + 学习。返回占用高度 */
  function addSkillBlock(md: ModalHandle, m: Character, w: number, top: number): number {
    const def = getCharacterDef(m.catalogId ?? m.rosterId);
    const box = new PIXI.Container();
    box.y = top;
    md.body.addChild(box);

    let y = 0;
    const title = makeText('技能', 'uiStrong', { fill: C.text, fontSize: 13 });
    box.addChild(title);
    const hint = makeText('点一条切换为出战技能', 'caption', { fill: C.muted });
    hint.anchor.set(1, 0);
    hint.x = w;
    hint.y = 2;
    box.addChild(hint);
    y += title.height + 6;

    // 过一遍路线判定而不是直接列 `ownedSkillIds`：老存档里可能留着可学列表收紧前
    // 学到的越界技能，列出来只会是一个点了没反应的按钮（`equipSkill` 会拒）。
    const usable = m.ownedSkillIds.filter((id) => {
      const spec = getSkillSpec(id);
      return !!spec && (!def || canCharacterUseSkill(def, id));
    });
    for (const skId of usable) {
      const spec = getSkillSpec(skId)!;
      const active = m.activeSkillId === skId;
      const row = makeCard({
        width: w,
        height: SKILL_ROW_H,
        radius: 8,
        tone: active ? 'selected' : 'normal',
        guard: md.wasDragging,
        onTap: () => {
          if (active) return;
          if (equipSkill(state, m.rosterId, skId)) {
            dirty = true;
            cb.onPersist();
            refillDetail(m);
          }
        },
      });
      row.y = y;
      const icon = createUiIcon(`skill_${skId}`, 22);
      if (icon) {
        icon.x = 8;
        icon.y = (SKILL_ROW_H - 22) / 2;
        row.addChild(icon);
      }
      const nm = makeText(spec.name, 'uiStrong', { fill: C.text, fontSize: 12 });
      nm.x = 36;
      nm.y = 6;
      row.addChild(nm);
      // 打哪儿、打几个直接写在行里。切换出战技能是个战术选择，
      // 而光看名字选不出来——完整说明在下面的详细资料里，但选之前就得看得到区别
      const shapeTx = makeText(describeSkillShape(spec), 'micro', { fill: C.muted, fontSize: 9 });
      shapeTx.x = 36;
      shapeTx.y = 24;
      row.addChild(shapeTx);
      const tag = makeText(active ? '出战中' : `CD ${spec.cooldown}`, 'micro', {
        fill: active ? 0xa5561f : C.muted,
        fontSize: 9,
      });
      tag.anchor.set(1, 0);
      tag.x = w - 9;
      tag.y = 8;
      row.addChild(tag);
      box.addChild(row);
      y += SKILL_ROW_H + 6;
    }

    const learnable = def ? unlockableSkillsFor(m) : [];
    if (learnable.length > 0) {
      y += 4;
      const lt = makeText(`可学习（每个魂晶 ${SKILL_LEARN_COST}）`, 'caption', { fill: C.muted });
      lt.y = y;
      box.addChild(lt);
      y += lt.height + 6;

      for (const skId of learnable) {
        const spec = getSkillSpec(skId);
        if (!spec) continue;
        const row = makeCard({ width: w, height: SKILL_ROW_H, radius: 8, tone: 'normal' });
        row.y = y;
        const icon = createUiIcon(`skill_${skId}`, 22);
        if (icon) {
          icon.x = 8;
          icon.y = (SKILL_ROW_H - 22) / 2;
          // 还没学的压暗一档，和已有技能区分开
          icon.alpha = 0.7;
          row.addChild(icon);
        }
        const nm = makeText(spec.name, 'uiStrong', { fill: C.text, fontSize: 12 });
        nm.x = 36;
        nm.y = 6;
        row.addChild(nm);
        const shapeTx = makeText(describeSkillShape(spec), 'micro', { fill: C.muted, fontSize: 9 });
        shapeTx.x = 36;
        shapeTx.y = 24;
        row.addChild(shapeTx);
        const btn = makeButton(
          '学习',
          () => {
            if (md.wasDragging()) return;
            if (learnSkill(state, m.rosterId, skId)) {
              dirty = true;
              cb.onPersist();
              refillDetail(m);
            } else {
              showToast(md.root, `魂晶不足（还差 ${SKILL_LEARN_COST - state.meta.metaCurrency}）`, {
                x: PAD,
                y: H - 40,
                color: C.soulText,
              });
            }
          },
          {
            variant: state.meta.metaCurrency >= SKILL_LEARN_COST ? 'primary' : 'secondary',
            width: 62,
            height: 28,
            fontSize: 12,
            radius: 6,
          },
        );
        btn.x = w - 68;
        btn.y = (SKILL_ROW_H - 28) / 2;
        row.addChild(btn);
        box.addChild(row);
        y += SKILL_ROW_H + 6;
      }
    }

    // 满级 + 学完之后这一页就没有可花魂晶的地方了，明说一句，
    // 否则玩家会一直回来找「还能升什么」
    if (learnable.length === 0 && m.level >= MAX_CHARACTER_LEVEL) {
      const done = makeText('这名角色已练满，魂晶留给别人吧。', 'caption', {
        fill: C.muted,
        wordWrap: true,
        wordWrapWidth: w,
      });
      done.y = y;
      box.addChild(done);
      y += done.height + 4;
    }
    y += 6;

    return y;
  }

  return root;
}
