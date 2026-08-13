import * as PIXI from 'pixi.js';
import type { PixiHost } from '@/boot/createPixiApp';
import type { Faction } from '@/battle/types';
import { createBattleSim, type BattleMode } from '@/battle/engine';
import { UNIT_DEFS } from '@/data/unitDefs';
import { DUNGEON_DEFS } from '@/data/dungeonCatalog';
import { getSkillMod, isExclusiveMod, modStacks } from '@/data/skillModCatalog';
import {
  createLootOverlay,
  createRewardOverlay,
  type LootCard,
  type RewardEntry,
} from '@/view/battle/resultOverlay';
import {
  abandonRun,
  advanceNode,
  applyVictory,
  battleTerrain,
  buildBattleUnits,
  buyShopOffer,
  canSweep,
  claimLoot,
  consumeSweep,
  currentDungeon,
  currentNode,
  currentStage,
  finishRunVictory,
  isRunComplete,
  rollShop,
  skipLoot,
  startRun,
  undoDeployForRetry,
  type BuyShopContext,
  type LootOption,
  type MvpGameState,
  type ShopOffer,
} from '@/game/MvpState';
import { dungeonClearSoul } from '@/game/MvpState';
import { animSetsForUnits, createBattlePlaybackView } from '@/view/BattlePlaybackView';
import { createDeployView } from '@/view/DeployView';
import { createShopView } from '@/view/ShopView';
import { createHomeView } from '@/view/HomeView';
import { createAdventureView } from '@/view/AdventureView';
import { createRosterView } from '@/view/RosterView';
import { createInventoryView } from '@/view/InventoryView';
import { createMetaShopView } from '@/view/MetaShopView';
import { createChallengeView } from '@/view/ChallengeView';
import { createTabBar, TAB_BAR_HEIGHT, type TabId } from '@/view/TabBar';
import { C } from '@/view/mvpTheme';
import { loadGameFonts } from '@/core/FontLoader';
import { makeText } from '@/theme/typography';
import { SceneManager } from '@/scene/SceneManager';
import type { Scene } from '@/scene/Scene';
import { makeButton } from '@/ui/Button';
import { SaveManager } from '@/core/SaveManager';
import { AssetManager } from '@/core/AssetManager';
import { ALL_BUNDLES } from '@/core/assetBundles';
import { animSetReady, ensureAnimSets, loadAnimSets } from '@/view/animSets';
import { createBackground, createUiIcon, createUnitToken } from '@/view/renderHelpers';
import { getCharacter } from '@/game/state/GameState';
import { getSkillSpec } from '@/data/skillCatalog';

function containerScene(container: PIXI.Container): Scene {
  return { root: container, enter() {}, exit() {} };
}

/**
 * 战利品 → 三选一卡片的展示数据。
 *
 * 层数按「选了之后会变成第几层」算，不是当前层数：卡片上的数字要回答
 * 「我点这一下能拿到什么」，显示 0 或者显示已有层数都答非所问。
 */
function lootToCard(state: MvpGameState, o: LootOption): LootCard {
  if (o.kind === 'potion') {
    return {
      portrait: null,
      who: '队伍物资',
      iconKey: `icon_potion_${o.potionId}`,
      skillName: '消耗品',
      modName: o.name,
      modIconKey: null,
      desc: o.desc,
      stacks: (state.run?.potions[o.potionId] ?? 0) + 1,
      rarity: 'common',
    };
  }
  const mod = getSkillMod(o.modId);
  const m = getCharacter(state, o.rosterId);
  const spec = getSkillSpec(o.skillId);
  return {
    // 头像用棋盘上那套 token，玩家不用在两种画法之间做二次对应
    portrait: m ? createUnitToken(m.profession, 'player', 40) : null,
    who: m?.name ?? '',
    iconKey: `skill_${o.skillId}`,
    skillName: spec?.name ?? '',
    modName: mod?.name ?? '',
    modIconKey: mod?.icon ?? null,
    desc: o.desc,
    stacks: modStacks(state.run?.skillMods[o.rosterId], o.modId) + 1,
    rarity: mod?.rarity ?? 'common',
    exclusive: mod ? isExclusiveMod(mod) : false,
  };
}

/**
 * 两层流程：
 *   Home → 大厅 Shell（底部 Tab：商店/角色/冒险/背包/副本）
 *        → Run（节点序列：Deploy→Battle→三选一 / Shop）→ 结算回大厅
 */
export class GameFlow {
  private readonly scenes: SceneManager;
  private state: MvpGameState;
  /** 当前商店节点的固定 offer（避免重绘时刷新） */
  private shopOffers: ShopOffer[] | null = null;
  /** 大厅当前 Tab（Tab 间切换保留） */
  private currentTab: TabId = 'adventure';
  /** 冒险页当前章节页码（Tab 切换回来不丢） */
  private adventureChapter = 0;

  constructor(private readonly app: PixiHost) {
    this.scenes = new SceneManager(app.stage);
    this.state = SaveManager.loadOrCreate();
    this.showLoading();
    void this.loadAssetsAndStart();
  }

  private showLoading(): void {
    const c = new PIXI.Container();
    const bg = new PIXI.Graphics();
    bg.beginFill(C.bg, 1);
    bg.drawRect(0, 0, this.app.screen.width, this.app.screen.height);
    bg.endFill();
    c.addChild(bg);
    const t = makeText('加载中…', 'title', { fill: C.text });
    t.anchor.set(0.5);
    t.x = this.app.screen.width / 2;
    t.y = this.app.screen.height / 2;
    c.addChild(t);
    this.scenes.replaceAll(containerScene(c));
  }

  private async loadAssetsAndStart(): Promise<void> {
    await Promise.all([
      loadGameFonts(),
      ...ALL_BUNDLES.map((b) => AssetManager.loadBundle(b)),
    ]);
    // 动画图集走 CDN、约 2MB，不能挡主页。resolveBattle 进战前会等本场要用的那几个。
    loadAnimSets();
    this.renderHome();
  }

  private cx(): number {
    return this.app.screen.width / 2;
  }

  private get screen(): { screenWidth: number; screenHeight: number } {
    return { screenWidth: this.app.screen.width, screenHeight: this.app.screen.height };
  }

  /** Tab 内容区尺寸（底部让出 Tab 栏） */
  private get shellScreen(): { screenWidth: number; screenHeight: number } {
    return {
      screenWidth: this.app.screen.width,
      screenHeight: this.app.screen.height - TAB_BAR_HEIGHT,
    };
  }

  private renderHome(): void {
    const container = createHomeView({ onStart: () => this.routeFromHome() }, this.screen);
    this.scenes.replaceAll(containerScene(container));
  }

  /** Home 的开始按钮：有进行中的 run 则续局，否则进大厅 */
  private routeFromHome(): void {
    if (this.state.run) {
      this.renderNode();
    } else {
      this.renderShell();
    }
  }

  // ---------------- 大厅 Shell（Tab 框架） ----------------

  private renderShell(tab?: TabId): void {
    if (tab) this.currentTab = tab;
    const root = new PIXI.Container();
    root.addChild(this.buildTabContent(this.currentTab));
    root.addChild(
      createTabBar(this.currentTab, (t) => this.renderShell(t), this.screen),
    );
    this.scenes.replaceAll(containerScene(root));
  }

  private buildTabContent(tab: TabId): PIXI.Container {
    const screen = this.shellScreen;
    const persistAndRedraw = (): void => {
      SaveManager.saveMeta(this.state.meta);
      this.renderShell();
    };
    switch (tab) {
      case 'adventure':
        return createAdventureView(
          this.state,
          this.adventureChapter,
          {
            onStartRun: (dungeonId, party) => this.startRunAndEnter(dungeonId, party),
            onContinueRun: () => this.renderNode(),
            onChanged: persistAndRedraw,
            onChapterChange: (i) => { this.adventureChapter = i; },
          },
          screen,
        );
      case 'roster':
        return createRosterView(this.state, { onChanged: persistAndRedraw }, screen);
      case 'inventory':
        return createInventoryView(this.state, screen);
      case 'shop':
        return createMetaShopView(this.state, { onChanged: persistAndRedraw }, screen);
      case 'challenge':
        return createChallengeView(
          this.state,
          {
            onChallenge: (d) => {
              this.adventureChapter = Math.max(0, this.dungeonChapterIndex(d.id));
              this.renderShell('adventure');
            },
          },
          screen,
        );
    }
  }

  /** DUNGEON_DEFS 顺序即章节顺序；AdventureView 内部同样按下标定位 */
  private dungeonChapterIndex(dungeonId: string): number {
    return DUNGEON_DEFS.findIndex((d) => d.id === dungeonId);
  }

  private startRunAndEnter(dungeonId: string, party: string[]): void {
    startRun(this.state, dungeonId, party);
    this.shopOffers = null;
    SaveManager.save(this.state);
    this.renderNode();
  }

  // ---------------- 副本节点路由 ----------------

  private renderNode(): void {
    if (!this.state.run) {
      this.renderShell('adventure');
      return;
    }
    const node = currentNode(this.state);
    if (node.kind === 'shop') {
      this.renderShop();
    } else {
      this.renderDeploy();
    }
  }

  private renderDeploy(): void {
    this.state.phase = 'deploy';
    const container = createDeployView(
      this.state,
      {
        onStartBattle: (mode) => void this.resolveBattle(mode),
        onSweep: () => this.sweepNode(),
        onWarn: (msg) => this.showToast(msg),
        onReset: () => {
          // 放弃当前副本回大厅。沿途首通的魂晶早已当场入账，这里没有补偿要算
          abandonRun(this.state);
          SaveManager.saveRun(null);
          SaveManager.save(this.state);
          this.showToast('已放弃副本');
          this.renderShell('adventure');
        },
        onHome: () => this.renderHome(),
        onRefresh: () => this.renderDeploy(),
      },
      this.screen,
    );
    // 布阵期间提前拉本场要用的 Boss 外观与技能特效（非核心集合走后台加载），
    // 免得进战瞬间图集还没就位、回退成静态贴图
    void ensureAnimSets(animSetsForUnits(buildBattleUnits(this.state)));
    this.scenes.replaceAll(containerScene(container));
  }

  /**
   * 扫荡：**直接判胜**，不建模拟器、不进战斗页、不等图集。
   *
   * 前提是这一关以前赢过（`canSweep`），所以再模拟一遍没有信息价值——而且模拟会有
   * 输的可能：同一支队伍同一关，玩家上次赢了、这次 AI 代打输了，对他来说就是
   * 「点了扫荡结果倒扣一次配额还没奖励」，无从解释。扫荡是兑现已有结果，不是重打。
   *
   * 奖励走和手打完全一样的 `applyVictory`：金币、三选一、通关魂晶一分不少。
   * 刷取的天花板由每日配额来定（见 `SWEEP_ROUNDS_PER_DAY`），不靠削奖励来防——
   * 削奖励只会让扫荡变成一个没人用的按钮。
   */
  private sweepNode(): void {
    if (!canSweep(this.state)) {
      this.showToast('这一关还不能扫荡');
      return;
    }
    consumeSweep(this.state);
    const run = this.state.run!;
    run.lastReportWinner = 'player';
    applyVictory(this.state);
    const last = isRunComplete(this.state);
    SaveManager.save(this.state);
    // 弹层盖在布阵页上（`showRewardOverlay` 用 pushOverlay），不换场景：
    // 扫荡的卖点就是不离开当前这一屏，切页会把「快」这件事又变慢。
    this.showRewardOverlay(last);
  }

  private async resolveBattle(mode: BattleMode = 'manual'): Promise<void> {
    const units = buildBattleUnits(this.state);
    if (units.filter((u) => u.faction === 'player').length === 0) {
      this.showToast('请至少部署 1 个单位');
      return;
    }
    // 图集走 CDN，布阵期间的预取通常已经拉完；没拉完就在这儿等，
    // 宁可多等一下也不要开场满屏静态棋子。ensureAnimSets 幂等，会复用在飞的请求。
    const needed = animSetsForUnits(units);
    if (!needed.every(animSetReady)) {
      this.showToast('资源加载中…');
      await ensureAnimSets(needed);
    }
    const run = this.state.run!;
    const map = battleTerrain(this.state);
    const stage = currentStage(this.state);
    const dungeon = currentDungeon(this.state);
    // 默认纯人工：走位、目标、技能全由玩家决定。
    //
    // 上一版只把技能交给玩家，移动和目标仍归 AI。结果是那一下点击既选不了位置也选不了对象，
    // 而且要等到该单位下次行动才生效——玩家能感到自己在操作，却影响不了任何结果。
    // 战棋的策略全部长在「谁站哪儿」上，不交出走位就等于没有策略。
    // 自动模式（扫荡）走同一个引擎的 AI 分支，不存在两套结算规则。
    const sim = createBattleSim(units, map, UNIT_DEFS, {
      aiDifficulty: stage.aiDifficulty,
      mode,
    });
    this.state.phase = 'battle';
    const container = createBattlePlaybackView(
      this.app,
      sim,
      units,
      map,
      this.screen,
      {
        onComplete: (winner: Faction) => {
          run.lastReportWinner = winner;
          this.finishBattleAfterPlayback(winner);
        },
        onHome: () => this.renderHome(),
        onReturnDeploy: () => {
          undoDeployForRetry(this.state);
          this.renderDeploy();
        },
      },
      {
        nodeLabel: `${dungeon.name} ${run.nodeIndex + 1}/${dungeon.nodes.length}`,
        gold: run.gold,
        potions: run.potions,
        onConsumePotion: (potionId: string) => {
          run.potions[potionId] = Math.max(0, (run.potions[potionId] ?? 0) - 1);
        },
      },
    );
    this.scenes.replaceAll(containerScene(container));
  }

  private finishBattleAfterPlayback(winner: Faction): void {
    const win = winner === 'player';
    if (!win) {
      SaveManager.save(this.state);
      this.scenes.replaceAll(containerScene(this.buildResultPanel(false, false, 'reward')));
      return;
    }
    applyVictory(this.state);
    const last = isRunComplete(this.state);
    SaveManager.save(this.state);
    this.showRewardOverlay(last);
  }

  /**
   * 把弹层挂到**当前场景**上，而不是 `replaceAll` 一个新页面。
   *
   * 换页会把战场连同刚打完那一下的画面一起销毁，胜利感在切换的瞬间就断了。
   * 盖一层遮罩则保留「刚才发生了什么」的上下文——这正是玩家想多看一眼的东西。
   */
  private pushOverlay(node: PIXI.Container): () => void {
    const host = this.scenes.current?.root;
    if (!host) return () => undefined;
    host.addChild(node);
    return () => {
      if (node.destroyed) return;
      host.removeChild(node);
      node.destroy({ children: true });
    };
  }

  /** 结算第一屏：这一场已经到手的固定奖励 */
  private showRewardOverlay(isRunFinal: boolean): void {
    const run = this.state.run!;
    const dungeon = currentDungeon(this.state);
    const v = run.lastVictory;
    const entries: RewardEntry[] = [];

    if (isRunFinal) {
      const soul = dungeonClearSoul(this.state, dungeon.id);
      const first = !this.state.meta.clearedDungeonIds.includes(dungeon.id);
      entries.push({
        iconKey: 'icon_soul',
        name: '魂晶',
        amount: soul,
        quality: '永久',
        desc: first
          ? `首次通关「${dungeon.name}」的一次性大奖。魂晶带得出副本，用来升级角色、学技能、招募同伴和解锁新章节。`
          : `重复通关「${dungeon.name}」的固定收益。首通大奖只发一次，想要更多就往更深的章节推。`,
        sources: ['章节通关', '战斗节点首通'],
        tint: C.soul,
      });
    } else {
      if (v && v.gold > 0) {
        entries.push({
          iconKey: 'icon_gold',
          name: '金币',
          amount: v.gold,
          quality: '本局',
          desc: `只在这次冒险里有效，出副本即清空。在补给点用来买药剂、地形券和技能。当前持有 ${run.gold}。`,
          sources: ['战斗胜利', '补给点出售'],
          tint: C.gold,
        });
      }
      entries.push({
        iconKey: 'icon_soul',
        name: '魂晶',
        amount: v?.soul ?? 0,
        quality: '永久',
        desc: v?.firstClear
          ? '带得出副本的永久货币，用来升级角色、学技能、招募同伴和解锁新章节。'
          : '这个节点以前通过了，首通奖励只发一次。想要更多魂晶，往后面还没打过的节点推，或者整章通关。',
        sources: ['战斗节点首通', '章节通关'],
        tint: C.soul,
      });
    }

    const hasLoot = !isRunFinal && (run.pendingLoot?.length ?? 0) > 0;
    let close = (): void => undefined;
    close = this.pushOverlay(
      createRewardOverlay({
        screenW: this.app.screen.width,
        screenH: this.app.screen.height,
        title: isRunFinal ? '通  关' : '胜  利',
        subtitle: `${dungeon.name} ${run.nodeIndex + 1}/${dungeon.nodes.length}`,
        entries,
        confirmLabel: hasLoot ? '选择强化' : (isRunFinal ? '返回大厅' : '继续前进'),
        onConfirm: () => {
          close();
          if (hasLoot) {
            this.showLootOverlay();
          } else if (isRunFinal) {
            const gained = finishRunVictory(this.state);
            SaveManager.save(this.state);
            this.showToast(`通关「${dungeon.name}」，魂晶 +${gained}`);
            this.renderShell('adventure');
          } else {
            this.advanceAfterVictory();
          }
        },
      }),
    );
  }

  /** 结算第二屏：技能词条三选一 */
  private showLootOverlay(): void {
    const run = this.state.run!;
    const loot = run.pendingLoot ?? [];
    let close = (): void => undefined;
    close = this.pushOverlay(
      createLootOverlay({
        screenW: this.app.screen.width,
        screenH: this.app.screen.height,
        cards: loot.map((o) => lootToCard(this.state, o)),
        onPick: (i: number) => {
          const opt = loot[i];
          if (!opt || !claimLoot(this.state, opt)) return;
          close();
          this.advanceAfterVictory();
          this.showToast(
            opt.kind === 'skillMod' ? `「${opt.name}」已生效` : `「${opt.name}」已放入背包`,
          );
        },
        onSkip: () => {
          skipLoot(this.state);
          close();
          this.advanceAfterVictory();
        },
      }),
    );
  }

  /**
   * 战败屏。胜利那条路径走的是盖在战场上的弹层（`showRewardOverlay`），
   * 这里之所以仍然换整页，是因为输了以后玩家要做的是**重新布阵**——
   * 让他继续盯着那张打输的棋盘没有意义，反而挡住了「回去改」这个动作。
   */
  private buildResultPanel(
    _win: boolean,
    _isRunFinal: boolean,
    _stage: 'reward' | 'loot',
  ): PIXI.Container {
    const W = this.app.screen.width;
    const H = this.app.screen.height;
    const c = new PIXI.Container();
    const mid = this.cx();

    c.addChild(createBackground(W, H));

    const bannerH = 60;
    const bannerY = H * 0.12;
    const banner = new PIXI.Graphics();
    banner.beginFill(0x8a3a3a, 0.92);
    banner.drawRect(0, bannerY, W, bannerH);
    banner.endFill();
    c.addChild(banner);

    const title = makeText('失  败', 'display', { fill: 0xffffff });
    title.anchor.set(0.5);
    title.x = mid;
    title.y = bannerY + bannerH / 2;
    c.addChild(title);

    const cardW = W - 40;
    const cardY = bannerY + bannerH + 24;

    const cardBg = new PIXI.Graphics();
    cardBg.beginFill(C.paper, 0.95);
    cardBg.drawRoundedRect(0, 0, cardW, 64, 12);
    cardBg.endFill();
    cardBg.x = 20;
    cardBg.y = cardY;
    c.addChild(cardBg);

    const sub = makeText('本节点可重新布阵再试', 'ui', { fill: C.text });
    sub.x = 36;
    sub.y = cardY + 22;
    c.addChild(sub);

    const btnNext = makeButton('返回布阵', () => {
      undoDeployForRetry(this.state);
      this.renderDeploy();
    }, { variant: 'primary', width: cardW, height: 46, fontSize: 16, radius: 12 });
    btnNext.x = 20;
    btnNext.y = cardY + 64 + 16;
    c.addChild(btnNext);

    // 放弃不再扣任何东西：沿途每个首通节点的魂晶当场就发过了，丢的只是这一局的
    // 局内物资（金币 / 药剂 / 词条）。把这句写在按钮上，玩家才不会以为退出会
    // 没收已经到手的永久收益。
    const btnAbandon = makeButton('放弃副本（保留已得魂晶）', () => {
      abandonRun(this.state);
      SaveManager.saveRun(null);
      SaveManager.save(this.state);
      this.showToast('已放弃副本，局内物资清空');
      this.renderShell('adventure');
    }, { variant: 'ghost', width: cardW, height: 40, fontSize: 14 });
    btnAbandon.x = 20;
    btnAbandon.y = btnNext.y + 56;
    c.addChild(btnAbandon);

    return c;
  }

  private advanceAfterVictory(): void {
    advanceNode(this.state);
    this.shopOffers = null;
    SaveManager.save(this.state);
    this.renderNode();
  }

  // ---------------- 局内商店节点 ----------------

  private renderShop(): void {
    this.state.phase = 'shop';
    if (!this.shopOffers) this.shopOffers = rollShop(this.state);
    const container = createShopView(
      this.state,
      this.shopOffers,
      {
        onBuy: (offer: ShopOffer, ctx?: BuyShopContext) => {
          if (!buyShopOffer(this.state, offer, ctx)) {
            this.showToast('金币不足或商品无效');
            return;
          }
          // 购买成功：移除该 offer，留在商店可继续买
          this.shopOffers = (this.shopOffers ?? []).filter((o) => o !== offer);
          SaveManager.save(this.state);
          this.renderShop();
        },
        onSkip: () => {
          advanceNode(this.state);
          this.shopOffers = null;
          SaveManager.save(this.state);
          this.renderNode();
        },
      },
      this.screen,
    );
    this.scenes.replaceAll(containerScene(container));
  }

  private showToast(msg: string): void {
    const current = this.scenes.current;
    if (!current) return;
    const t = makeText(msg, 'ui', { fill: 0xffcc66 });
    t.x = 16;
    t.y = 24;
    current.root.addChild(t);
    setTimeout(() => {
      if (!t.destroyed) current.root.removeChild(t);
      t.destroy();
    }, 1600);
  }
}
