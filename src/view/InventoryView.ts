import * as PIXI from 'pixi.js';
import { makeText } from '@/theme/typography';
import { POTION_DEFS } from '@/data/potionCatalog';
import { getSkillSpec } from '@/data/skillCatalog';
import { getSkillMod } from '@/data/skillModCatalog';
import { PLACEABLE_TERRAIN_IDS, terrainTicketName } from '@/data/dungeonCatalog';
import { describePotion, describeTempSkill, describeTerrainTicket } from '@/data/itemText';
import type { MvpGameState } from '@/game/MvpState';
import { createBackground, createUiIcon } from '@/view/renderHelpers';

interface ItemRowSpec {
  /** emoji 兜底图标；有 iconKey 时可省 */
  icon?: string;
  /** 有正式美术时的贴图 key，优先于 emoji */
  iconKey?: string;
  name: string;
  desc: string;
  count: number;
}

const CARD_BG = 0xfefef6;
const TEXT = 0x3a3a2a;
const MUTED = 0x888877;

/** 背包页：本局消耗品数量 + 图鉴说明（局外时数量为 0） */
export function createInventoryView(
  state: MvpGameState,
  screen: { screenWidth: number; screenHeight: number },
): PIXI.Container {
  const W = screen.screenWidth;
  const H = screen.screenHeight;
  const root = new PIXI.Container();
  root.addChild(createBackground(W, H));

  const titleTx = makeText('背  包', 'title', { fill: 0xffffff });
  titleTx.anchor.set(0.5, 0);
  titleTx.x = W / 2; titleTx.y = 12;
  root.addChild(titleTx);

  const run = state.run;

  // 时效提示横幅：明确物资是局内的
  const bannerText = run
    ? '⏳ 以下物资仅本次冒险有效，冒险结束后清空'
    : '当前不在冒险中 · 物资在冒险内获得与消耗，结束即清空';
  const bannerTx = makeText(bannerText, 'caption', {
    fill: 0xffe08a, fontWeight: 'bold',
    wordWrap: true, wordWrapWidth: W - 48, align: 'center',
  });
  bannerTx.anchor.set(0.5, 0.5);
  const bannerH = bannerTx.height + 14;
  const bannerBg = new PIXI.Graphics();
  bannerBg.lineStyle(1, 0xcc8833, 0.6);
  bannerBg.beginFill(0x000000, 0.35);
  bannerBg.drawRoundedRect(12, 38, W - 24, bannerH, 8);
  bannerBg.endFill();
  root.addChild(bannerBg);
  bannerTx.x = W / 2;
  bannerTx.y = 38 + bannerH / 2;
  root.addChild(bannerTx);

  let y = 38 + bannerH + 12;

  // 局外：显示魂晶余额（永久货币，与局内物资区分）
  if (!run) {
    const soulCard = new PIXI.Container();
    soulCard.x = 12; soulCard.y = y;
    const g = new PIXI.Graphics();
    g.beginFill(0x3a2a4a, 0.92);
    g.drawRoundedRect(0, 0, W - 24, 52, 10);
    g.endFill();
    soulCard.addChild(g);
    const icon = createUiIcon('icon_soul', 28);
    if (icon) {
      icon.x = 10; icon.y = 12;
      soulCard.addChild(icon);
    }
    const name = makeText('魂晶（永久保留）', 'uiStrong', { fill: 0xffffff });
    name.x = 48; name.y = 8;
    soulCard.addChild(name);
    const desc = makeText('战斗与通关获得 · 用于角色升级/学技能/招募', 'caption', { fill: 0xb9b0c8, fontSize: 10 });
    desc.x = 48; desc.y = 28;
    soulCard.addChild(desc);
    const cnt = makeText(`×${state.meta.metaCurrency}`, 'uiStrong', {
      fill: 0xd8b0ff, fontSize: 16,
    });
    cnt.anchor.set(1, 0.5);
    cnt.x = W - 36; cnt.y = 26;
    soulCard.addChild(cnt);
    root.addChild(soulCard);
    y += 52 + 16;
  }

  const section = (label: string, rows: ItemRowSpec[]): void => {
    const t = makeText(label, 'uiStrong', { fill: 0xfff3d8 });
    t.x = 12; t.y = y;
    root.addChild(t);
    y += 24;
    for (const row of rows) {
      const cardH = 52;
      const card = new PIXI.Container();
      card.x = 12; card.y = y;
      const g = new PIXI.Graphics();
      const has = row.count > 0;
      g.beginFill(CARD_BG, has ? 0.95 : 0.55);
      g.drawRoundedRect(0, 0, W - 24, cardH, 10);
      g.endFill();
      card.addChild(g);
      const art = row.iconKey ? createUiIcon(row.iconKey, 26) : null;
      if (art) {
        art.x = 12; art.y = cardH / 2 - 13;
        card.addChild(art);
      } else if (row.icon) {
        const icon = makeText(row.icon, 'ui', { fontSize: 24 });
        icon.x = 12; icon.y = cardH / 2 - 14;
        card.addChild(icon);
      }
      const name = makeText(row.name, 'uiStrong', { fill: has ? TEXT : MUTED });
      name.x = 48; name.y = 8;
      card.addChild(name);
      const desc = makeText(row.desc, 'body', { fill: MUTED, fontSize: 10, wordWrap: true, wordWrapWidth: W - 150 });
      desc.x = 48; desc.y = 28;
      card.addChild(desc);
      const cnt = makeText(`×${row.count}`, 'uiStrong', {
        fill: has ? 0xcc8833 : MUTED, fontSize: 16,
      });
      cnt.anchor.set(1, 0.5);
      cnt.x = W - 36; cnt.y = cardH / 2;
      card.addChild(cnt);
      root.addChild(card);
      y += cardH + 8;
    }
    y += 8;
  };

  section('药剂（战斗中使用）', Object.keys(POTION_DEFS).map((id) => {
    const d = POTION_DEFS[id]!;
    return {
      iconKey: `icon_potion_${id}`,
      name: d.name,
      desc: describePotion(id),
      count: run?.potions[id] ?? 0,
    };
  }));

  section('地形券（布阵时放置）', PLACEABLE_TERRAIN_IDS.map((tid) => ({
    iconKey: 'icon_terrain',
    name: terrainTicketName(tid),
    desc: describeTerrainTicket(tid),
    count: run?.terrainCharges[tid] ?? 0,
  })));

  // 词条不是「库存」，它选完就直接长在技能上了。这里只是让玩家中途能翻出来
  // 确认自己这一局攒了什么——不列的话，三选一选过的东西就再也查不到了。
  const modRows: ItemRowSpec[] = [];
  for (const [rosterId, ids] of Object.entries(run?.skillMods ?? {})) {
    const m = state.meta.roster.find((c) => c.rosterId === rosterId);
    if (!m) continue;
    const spec = getSkillSpec(m.activeSkillId);
    const counted = new Map<string, number>();
    for (const id of ids) counted.set(id, (counted.get(id) ?? 0) + 1);
    for (const [modId, n] of counted) {
      const mod = getSkillMod(modId);
      if (!mod) continue;
      // 词条跟人走，换主技能后个别条目会挂不上去（「横扫」挂到单体技能）。
      // 那种情况必须写出来：它不是失效了，是换回去就恢复——不说明的话
      // 玩家只会看到面板上有这条、打起来却没效果，然后认为是 bug。
      const dormant = spec ? !mod.canApply(spec) : false;
      modRows.push({
        iconKey: mod.icon,
        name: `${m.name} · ${mod.name}`,
        desc: dormant
          ? `当前技能不适用（换回可用技能即恢复）· ${mod.describe(Math.min(n, mod.maxStacks))}`
          : mod.describe(Math.min(n, mod.maxStacks)),
        count: n,
      });
    }
  }
  if (modRows.length > 0) section('技能词条（战斗胜利三选一，已生效）', modRows);

  const tempRows: ItemRowSpec[] = [];
  for (const [rosterId, skillId] of Object.entries(run?.runTempSkill ?? {})) {
    const m = state.meta.roster.find((c) => c.rosterId === rosterId);
    const spec = getSkillSpec(skillId);
    if (!m || !spec) continue;
    tempRows.push({
      iconKey: `skill_${spec.id}`,
      name: `${m.name} · ${spec.name}`,
      desc: describeTempSkill(spec.id),
      count: 1,
    });
  }
  if (tempRows.length > 0) section('临时技能（商店购买，本局有效）', tempRows);

  return root;
}
