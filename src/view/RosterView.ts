import * as PIXI from 'pixi.js';
import { makeText } from '@/theme/typography';
import { UNIT_DEFS } from '@/data/unitDefs';
import {
  CHARACTER_DEFS,
  characterStatsAtLevel,
  getCharacterDef,
  levelUpCost,
} from '@/data/characterCatalog';
import { getSkillSpec, type SkillSpec } from '@/data/skillCatalog';
import {
  exclusiveChainForSkill,
  type SkillModDef,
  type SkillModRarity,
} from '@/data/skillModCatalog';
import { describeSkillRole } from '@/data/skillText';
import { characterEffectiveStats } from '@/game/characterFactory';
import type { Character } from '@/game/characterTypes';
import { resolveBattleSkillIdForCharacter } from '@/game/state/DeployManager';
import {
  MAX_CHARACTER_LEVEL,
  levelUpCharacter,
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

/** 属性行的展示名，顺序即显示顺序 */
const STAT_ROWS: { key: 'maxHp' | 'atk' | 'spd' | 'move'; label: string }[] = [
  { key: 'maxHp', label: '生命' },
  { key: 'atk', label: '攻击' },
  { key: 'spd', label: '速度' },
  { key: 'move', label: '移动' },
];

/** 纹章名的颜色，和三选一卡、信息面板是同一套稀有度语言 */
const MOD_COLOR: Record<SkillModRarity, number> = {
  common: 0x5a6a7a,
  rare: 0x2f6fae,
  epic: 0xa5561f,
};

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
  /** 详情分页。升级后原地刷新要记住，否则练纹章时会被弹回技能页 */
  let detailTab: 'skill' | 'mods' = 'skill';

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
    detailTab = 'skill';
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
   * 弹窗上半固定、下半分页。
   *
   * 招牌技能是这一页存在的理由，却曾经被纹章解锁链挤到三屏之外——
   * 打开详情先看到的是普攻射程，技能本身要滚过一整份通用纹章名单才露出来。
   * 技能和纹章拆成两个 tab 之后，默认页就是「这一招怎么打」，
   * 养成链留给真要规划升级的人去翻。
   */
  function fillDetail(md: ModalHandle, m: Character): void {
    const w = md.bodySize.width;
    let y = 0;
    y += addOverviewBlock(md, m, w, y);
    y += addGrowthBlock(md, m, w, y);
    y += addDetailTabs(md, m, w, y);
    y += detailTab === 'skill' ? addSkillBlock(md, m, w, y) : addModChainBlock(md, m, w, y);
    md.refresh();
  }

  /** 这一局带的招牌技能（含本局纹章前的原始规格） */
  function signatureSpec(m: Character): SkillSpec | undefined {
    return getSkillSpec(resolveBattleSkillIdForCharacter(state, m));
  }

  /**
   * 概览：头像 + 定位 + 四维。**全页唯一一处四维**。
   *
   * 四维原来在这一页出现三次（培养区一行、详细资料的基础属性、升级预览的左值），
   * 三处还各有各的排版，玩家得先确认这三块说的是不是同一件事。
   */
  function addOverviewBlock(md: ModalHandle, m: Character, w: number, top: number): number {
    const def = getCharacterDef(m.catalogId ?? m.rosterId);
    const box = new PIXI.Container();
    box.y = top;
    md.body.addChild(box);

    const token = createUnitToken(m.profession, 'player', 44);
    token.x = 24;
    token.y = 24;
    box.addChild(token);

    const role = makeText(
      def
        ? `${UNIT_DEFS[m.profession].name} · ${describeSkillRole(def.skillRoute)}`
        : UNIT_DEFS[m.profession].name,
      'uiStrong',
      { fill: C.text, fontSize: 12 },
    );
    role.x = 56;
    role.y = 2;
    box.addChild(role);

    const cur = characterEffectiveStats(m);
    const stats = makeText(
      `生命 ${cur.maxHp}　攻击 ${cur.atk}\n速度 ${cur.spd}　移动 ${cur.move}`,
      'caption',
      { fill: C.muted, lineHeight: 16 },
    );
    stats.x = 56;
    stats.y = role.height + 4;
    box.addChild(stats);

    // 招式名贴在四维右侧：这一页最重要的信息不能只活在默认折叠的分页里。
    const spec = signatureSpec(m);
    if (spec) {
      const chip = new PIXI.Container();
      const icon = createUiIcon(`skill_${spec.id}`, 22);
      if (icon) chip.addChild(icon);
      const nm = makeText(spec.name, 'uiStrong', { fill: 0xcc8833, fontSize: 12 });
      nm.x = icon ? 26 : 0;
      nm.y = 1;
      chip.addChild(nm);
      const cd = makeText(`CD ${spec.cooldown}回合`, 'caption', { fill: C.muted, fontSize: 10 });
      cd.x = nm.x;
      cd.y = nm.height + 2;
      chip.addChild(cd);
      chip.x = Math.max(stats.x + stats.width + 12, w - Math.max(nm.width + (icon ? 26 : 0), cd.width + (icon ? 26 : 0)));
      chip.y = 4;
      box.addChild(chip);
    }

    return Math.max(48, stats.y + stats.height) + 10;
  }

  /** 技能 / 纹章分页条。返回占用高度 */
  function addDetailTabs(md: ModalHandle, m: Character, w: number, top: number): number {
    const box = new PIXI.Container();
    box.y = top;
    md.body.addChild(box);

    const gap = 6;
    const tw = Math.floor((w - gap) / 2);
    const h = 32;
    const tabs: { id: typeof detailTab; label: string }[] = [
      { id: 'skill', label: '技能' },
      { id: 'mods', label: '纹章' },
    ];
    for (const [i, t] of tabs.entries()) {
      const on = t.id === detailTab;
      const btn = makeButton(
        t.label,
        () => {
          if (md.wasDragging() || t.id === detailTab) return;
          detailTab = t.id;
          refillDetail(m);
        },
        {
          variant: on ? 'secondary' : 'ghost',
          width: tw,
          height: h,
          fontSize: 13,
          radius: 8,
        },
      );
      btn.x = i * (tw + gap);
      box.addChild(btn);
    }
    return h + 10;
  }

  /**
   * 技能分页：招牌招式在前，普攻垫底。
   *
   * 和布阵页、战斗页共用同一块渲染，数值和格子图不会各写一套。
   * 头像、姓名、四维关掉——概览已经写过一次。
   */
  function addSkillBlock(md: ModalHandle, m: Character, w: number, top: number): number {
    const box = new PIXI.Container();
    box.y = top;
    md.body.addChild(box);

    const model = characterInfoModel(state, m);
    if (model.skills[0]) model.skills[0].title = '招牌技能';
    const info = createUnitInfoPanel(model, w, {
      drawBg: false,
      showHeader: false,
      showStats: false,
      skillsBeforeStrike: true,
    });
    box.addChild(info.view);
    stopPanel = info.stop;

    return info.height + 8;
  }

  /** 升级区：花多少、升完加多少、下一档解锁什么。返回占用高度 */
  function addGrowthBlock(md: ModalHandle, m: Character, w: number, top: number): number {
    const def = getCharacterDef(m.catalogId ?? m.rosterId);
    const box = new PIXI.Container();
    box.y = top;
    md.body.addChild(box);

    let y = 0;
    const title = makeText('培养', 'uiStrong', { fill: C.text, fontSize: 13 });
    box.addChild(title);
    y += title.height + 6;

    const maxed = m.level >= MAX_CHARACTER_LEVEL;
    const cur = characterEffectiveStats(m);
    const next = def && !maxed ? characterStatsAtLevel(def, m.level + 1) : null;

    if (next) {
      // 只写增量，不再写 `40 → 44`：当前值就在上面那块概览里，
      // 一屏之内把同一个数写两遍反而要玩家自己核对两处是不是一致。
      const gains = STAT_ROWS
        .map((r) => ({ label: r.label, d: next[r.key] - cur[r.key] }))
        .filter((g) => g.d > 0)
        .map((g) => `${g.label} +${g.d}`);
      const gain = makeText(`升到 Lv.${m.level + 1}：${gains.join('　')}`, 'caption', {
        fill: 0x3a8a5a,
        wordWrap: true,
        wordWrapWidth: w,
      });
      gain.y = y;
      box.addChild(gain);
      y += gain.height + 6;
    }

    // 下一档纹章解锁：这是升级除了数值之外真正能给到的东西，
    // 而数值那几点在战棋里基本感觉不到。放在按钮上方，玩家按下去之前就看得见。
    const spec = signatureSpec(m);
    if (spec && !maxed) {
      const upcoming = exclusiveChainForSkill(spec).filter((d) => d.minLevel > m.level);
      const nextLv = upcoming[0]?.minLevel;
      if (nextLv !== undefined) {
        const names = upcoming.filter((d) => d.minLevel === nextLv).map((d) => d.name);
        const tx = makeText(`Lv.${nextLv} 解锁专属纹章：${names.join('、')}`, 'caption', {
          fill: nextLv === m.level + 1 ? 0xa5561f : C.muted,
          wordWrap: true,
          wordWrapWidth: w,
        });
        tx.y = y;
        box.addChild(tx);
        y += tx.height + 8;
      }
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

  /**
   * 专属纹章解锁链。通用纹章不出现在这里——它们按技能类型进三选一，不跟等级绑。
   */
  function addModChainBlock(md: ModalHandle, m: Character, w: number, top: number): number {
    const spec = signatureSpec(m);
    if (!spec) return 0;

    const box = new PIXI.Container();
    box.y = top;
    md.body.addChild(box);

    let y = 0;
    const title = makeText('专属纹章', 'uiStrong', { fill: C.text, fontSize: 13 });
    box.addChild(title);
    const hint = makeText('升级解锁，战斗中三选一出现', 'caption', { fill: C.muted });
    hint.anchor.set(1, 0);
    hint.x = w;
    hint.y = 2;
    box.addChild(hint);
    y += title.height + 6;

    const note = makeText('通用纹章按技能类型进池，不需要升级。', 'micro', {
      fill: C.muted,
      fontSize: 9,
      wordWrap: true,
      wordWrapWidth: w,
    });
    note.y = y;
    box.addChild(note);
    y += note.height + 8;

    const chain = exclusiveChainForSkill(spec);
    for (const mod of chain) {
      const unlocked = m.level >= mod.minLevel;
      const head = makeText(unlocked ? `Lv.${mod.minLevel}　已解锁` : `Lv.${mod.minLevel}　未解锁`, 'caption', {
        fill: unlocked ? 0x3a8a5a : C.muted,
        fontWeight: 'bold',
      });
      head.y = y;
      box.addChild(head);
      y += head.height + 4;
      y += addModRow(box, mod, w, y, unlocked);
      y += 4;
    }

    return y + 4;
  }

  /** 专属纹章一行：徽记 + 名字 + 完整效果。返回行高 */
  function addModRow(
    box: PIXI.Container,
    mod: SkillModDef,
    w: number,
    top: number,
    unlocked: boolean,
  ): number {
    const row = new PIXI.Container();
    row.y = top;
    // 未解锁压暗而不是藏起来：这一栏存在的意义就是让玩家看见还没拿到的东西
    row.alpha = unlocked ? 1 : 0.45;

    const icon = createUiIcon(mod.icon, 16);
    if (icon) {
      icon.x = 8;
      row.addChild(icon);
    }
    const textX = icon ? 30 : 8;

    const nm = makeText(`${mod.name}　专属`, 'uiStrong', {
      fill: MOD_COLOR[mod.rarity],
      fontSize: 11,
    });
    nm.x = textX;
    row.addChild(nm);

    // 效果按 1 层写：专属纹章 `maxStacks` 恒为 1，所以这就是它的最终形态
    const desc = makeText(mod.describe(1), 'micro', {
      fill: C.muted,
      fontSize: 9,
      lineHeight: 13,
      wordWrap: true,
      wordWrapWidth: Math.max(60, w - textX),
    });
    desc.x = textX;
    desc.y = nm.height + 1;
    row.addChild(desc);

    box.addChild(row);
    return nm.height + 1 + desc.height + 6;
  }

  return root;
}
