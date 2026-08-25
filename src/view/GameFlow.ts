import * as PIXI from 'pixi.js';
import type { PixiHost } from '@/boot/createPixiApp';
import type { Faction, UnitState } from '@/battle/types';
import { createBattleSim, type BattleMode } from '@/battle/engine';
import { UNIT_DEFS } from '@/data/unitDefs';
import { DUNGEON_DEFS } from '@/data/dungeonCatalog';
import { isSandboxDungeon } from '@/data/sandboxLab';
import { gmPrepareSandboxRoster } from '@/game/state/gmCheats';
import {
  ENDLESS_CLEAR_BONUS,
  ENDLESS_DUNGEON_ID,
  ENDLESS_MAX_WAVES,
  ENDLESS_WAVE_SOUL,
  endlessAiDifficulty,
  isEndlessDungeon,
} from '@/data/endlessCatalog';
import { getSkillMod, isExclusiveMod } from '@/data/skillModCatalog';
import {
  createDefeatOverlay,
  createLootOverlay,
  createRewardOverlay,
  type LootCard,
  type RewardEntry,
} from '@/view/battle/resultOverlay';
import {
  abandonRun,
  advanceNode,
  applyEndlessWaveVictory,
  applyVictory,
  battleTerrain,
  buildBattleUnits,
  buyShopOffer,
  canSweep,
  claimLoot,
  consumeSweep,
  continueEndlessWave,
  currentDungeon,
  currentNode,
  currentStage,
  endlessWavesCleared,
  finishEndlessRun,
  finishRunVictory,
  isEndlessRun,
  isRunComplete,
  snapshotEndlessCarry,
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
import { createLoadingView, type LoadingView } from '@/view/LoadingView';
import { createAdventureView } from '@/view/AdventureView';
import { createRosterView } from '@/view/RosterView';
import { createRecruitView } from '@/view/RecruitView';
import { createChallengeView } from '@/view/ChallengeView';
import { createTabBar, tabBarHeight, type TabId } from '@/view/TabBar';
import { C } from '@/view/mvpTheme';
import { loadGameFonts } from '@/core/FontLoader';
import { showToast as showSceneToast } from '@/ui/Toast';
import { SceneManager } from '@/scene/SceneManager';
import type { Scene } from '@/scene/Scene';
import { PersistService } from '@/core/PersistService';
import { SaveManager } from '@/core/SaveManager';
import { CloudSyncManager } from '@/managers/CloudSyncManager';
import { AssetManager } from '@/core/AssetManager';
import { ALL_BUNDLES, LOADING_BUNDLE, UI_BUNDLE } from '@/core/assetBundles';
import { animSetReady, ensureAnimSets, loadAnimSets } from '@/view/animSets';
import { characterArtKey } from '@/data/characterCatalog';
import { createBackground, createUnitToken } from '@/view/renderHelpers';
import { createCharacterRevealOverlay } from '@/view/characterReveal';
import { createInitialState, getCharacter } from '@/game/state/GameState';
import { getSkillSpec } from '@/data/skillCatalog';
import { AudioManager } from '@/core/AudioManager';
import { Platform } from '@/platform/wxPlatform';

function containerScene(container: PIXI.Container): Scene {
  return { root: container, enter() {}, exit() {} };
}

/**
 * 战利品 → 三选一卡片的展示数据。
 *
 * 词条叠层写进 `desc`（`describe(下一层)`），卡面上不再单画一个数字：
 * 第一次永远是 1，没有标签的「1」玩家读不出意思。
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
      rarity: 'common',
    };
  }
  const mod = getSkillMod(o.modId);
  const m = getCharacter(state, o.rosterId);
  const spec = getSkillSpec(o.skillId);
  return {
    // 头像用棋盘上那套 token，玩家不用在两种画法之间做二次对应
    portrait: m ? createUnitToken(characterArtKey(m), 'player', 40) : null,
    who: m?.name ?? '',
    iconKey: `skill_${o.skillId}`,
    skillName: spec?.name ?? '',
    modName: mod?.name ?? '',
    modIconKey: mod?.icon ?? null,
    desc: o.desc,
    rarity: mod?.rarity ?? 'common',
    exclusive: mod ? isExclusiveMod(mod) : false,
  };
}

/**
 * 两层流程：
 *   Loading → 大厅 Shell（底部 Tab：招募/角色/冒险/副本）
 *        → Run（节点序列：Deploy→Battle→三选一 / Shop）→ 结算回大厅
 *        → 无尽试炼（布阵一次，同图连打最多 10 波）
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
  /** 刚结束那场战斗的单位快照，无尽用来把血量和站位带进下一波 */
  private lastBattleUnits: UnitState[] = [];
  private loading: LoadingView | null = null;
  /** 启动云同步完成、大厅已可渲染后才接受下行覆盖 */
  private started = false;

  constructor(private readonly app: PixiHost) {
    this.scenes = new SceneManager(app.stage);
    this.state = createInitialState();
    this.bindCloudLifecycle();
    this.showLoading();
    void this.loadAssetsAndStart();
  }

  private bindCloudLifecycle(): void {
    CloudSyncManager.prewarm();
    PersistService.subscribeCloudImport((info) => {
      if (!this.started || info.changedKeys.length === 0) return;
      const loaded = SaveManager.load();
      if (!loaded) return;
      this.state = loaded;
      if (this.state.phase === 'hub') this.renderShell();
    });
    Platform.onHide(() => {
      void CloudSyncManager.flushNow('app-hide');
    });
  }

  private showLoading(): void {
    const loading = createLoadingView(this.screen);
    this.loading = loading;
    this.scenes.replaceAll(containerScene(loading.root));
    loading.setProgress(0.04);
  }

  private async loadAssetsAndStart(): Promise<void> {
    const loading = this.loading;
    const setP = (ratio: number): void => {
      loading?.setProgress(ratio);
    };

    const fontsReady = loadGameFonts();
    // 底图 + Logo 都在主包，两张先出，避免等完整 UI bundle 时标题闪成图
    await Promise.all([
      AssetManager.loadBundle(LOADING_BUNDLE),
      AssetManager.loadNamed('ui', 'logo_emblem', UI_BUNDLE.assets.logo_emblem),
    ]);
    loading?.applySplash(AssetManager.texture('loading', 'splash'));
    loading?.applyLogo(AssetManager.texture('ui', 'logo_emblem'));
    setP(0.12);

    await AssetManager.loadBundle(UI_BUNDLE, (n, t) => {
      setP(0.12 + (t > 0 ? n / t : 1) * 0.28);
    });
    await fontsReady;
    loading?.refreshTitleFont();
    setP(0.42);

    const rest = ALL_BUNDLES.filter((b) => b.name !== 'ui');
    const restTotal = rest.reduce((sum, b) => sum + Object.keys(b.assets).length, 0);
    let restDone = 0;
    await Promise.all(
      rest.map((b) => {
        let last = 0;
        return AssetManager.loadBundle(b, (n) => {
          restDone += n - last;
          last = n;
          if (restTotal > 0) setP(0.42 + (restDone / restTotal) * 0.53);
        });
      }),
    );

    // 动画图集走 CDN、约 2MB，不能挡主页。resolveBattle 进战前会等本场要用的那几个。
    loadAnimSets();
    setP(0.96);
    const sync = await CloudSyncManager.awaitStartupSync();
    console.log(`[GameFlow] 云同步启动: ${sync.status} (${sync.reason})`);
    this.state = SaveManager.loadOrCreate();
    this.started = true;
    setP(1);
    this.loading = null;
    this.renderShell();
  }

  private get screen(): { screenWidth: number; screenHeight: number } {
    return { screenWidth: this.app.screen.width, screenHeight: this.app.screen.height };
  }

  /** Tab 内容区尺寸（底部让出 Tab 栏） */
  private get shellScreen(): { screenWidth: number; screenHeight: number } {
    return {
      screenWidth: this.app.screen.width,
      screenHeight: this.app.screen.height - tabBarHeight(),
    };
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
    AudioManager.playBgm('hub');
  }

  private buildTabContent(tab: TabId): PIXI.Container {
    const screen = this.shellScreen;
    const persist = (): void => {
      SaveManager.saveMeta(this.state.meta);
    };
    const persistAndRedraw = (): void => {
      persist();
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
        // 角色页的弹窗要能连着升级不被弹回网格，所以给它一个「只存盘」的口子；
        // 重绘推迟到关窗时由它自己发起（见 RosterCallbacks.onPersist）
        return createRosterView(
          this.state,
          {
            onChanged: persistAndRedraw,
            onPersist: persist,
            onGoRecruit: () => this.renderShell('recruit'),
          },
          screen,
        );
      case 'recruit':
        return createRecruitView(this.state, { onChanged: persistAndRedraw }, screen);
      case 'challenge':
        return createChallengeView(
          this.state,
          {
            onChallenge: (d) => {
              if (isEndlessDungeon(d.id)) {
                this.startEndless();
                return;
              }
              this.adventureChapter = Math.max(0, this.dungeonChapterIndex(d.id));
              this.renderShell('adventure');
            },
          },
          screen,
        );
    }
  }

  /** DUNGEON_DEFS 顺序即章节顺序；试炼卡接在最后 */
  private dungeonChapterIndex(dungeonId: string): number {
    const i = DUNGEON_DEFS.findIndex((d) => d.id === dungeonId);
    if (i >= 0) return i;
    if (isSandboxDungeon(dungeonId)) return DUNGEON_DEFS.length;
    return 0;
  }

  private startRunAndEnter(dungeonId: string, party: string[]): void {
    if (isSandboxDungeon(dungeonId)) {
      gmPrepareSandboxRoster(this.state);
      party = this.state.meta.roster.map((m) => m.rosterId);
    }
    startRun(this.state, dungeonId, party);
    this.shopOffers = null;
    SaveManager.save(this.state);
    this.renderNode();
  }

  /** 无尽从副本页直接开打，不绕冒险页选章 */
  private startEndless(): void {
    if (this.state.run) {
      this.showToast('先结束当前的冒险');
      return;
    }
    const party = this.state.meta.roster.map((m) => m.rosterId);
    this.startRunAndEnter(ENDLESS_DUNGEON_ID, party);
  }

  // ---------------- 副本节点路由 ----------------

  private renderNode(): void {
    if (!this.state.run) {
      this.renderShell('adventure');
      return;
    }
    if (isEndlessRun(this.state)) {
      const run = this.state.run;
      const e = run.endless;
      // 断线时三选一可能还挂着：先弹卡，不能直接刷下一波把选项吞掉
      if ((run.pendingLoot?.length ?? 0) > 0) {
        this.renderEndlessBackdrop();
        this.showLootOverlay();
        return;
      }
      // 第一波还没布阵：进布阵页。之后同图连打，不再回布阵。
      if (!e?.carry && e?.wave === 1 && !e.clearedCurrent) {
        this.renderDeploy();
        return;
      }
      if (e?.clearedCurrent && e.wave >= ENDLESS_MAX_WAVES) {
        const bonus = finishEndlessRun(this.state);
        SaveManager.saveRun(null);
        SaveManager.save(this.state);
        this.showToast(bonus > 0 ? `试炼完成，额外魂晶 +${bonus}` : '试炼结束');
        this.renderShell('challenge');
        return;
      }
      if (e?.clearedCurrent && e.wave < ENDLESS_MAX_WAVES) {
        continueEndlessWave(this.state, this.lastBattleUnits);
        SaveManager.save(this.state);
      }
      void this.resolveBattle('manual');
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
          const endless = isEndlessRun(this.state);
          if (endless) finishEndlessRun(this.state);
          else abandonRun(this.state);
          SaveManager.saveRun(null);
          SaveManager.save(this.state);
          this.showToast(endless ? '已离开试炼' : '已放弃副本');
          this.renderShell(endless ? 'challenge' : 'adventure');
        },
        onHome: () => this.renderShell(),
        onRefresh: () => this.renderDeploy(),
      },
      this.screen,
    );
    // 布阵期间提前拉本场要用的 Boss 外观与技能特效（非核心集合走后台加载），
    // 免得进战瞬间图集还没就位、回退成静态贴图
    void ensureAnimSets(animSetsForUnits(buildBattleUnits(this.state)));
    this.scenes.replaceAll(containerScene(container));
    AudioManager.playBgm('deploy');
  }

  /**
   * 扫荡：**直接判胜**，不建模拟器、不进战斗页、不等图集。
   *
   * 前提是这一关以前赢过（`canSweep`），所以再模拟一遍没有信息价值——而且模拟会有
   * 输的可能：同一支队伍同一关，玩家上次赢了、这次自动代打输了，对他来说就是
   * 「点了扫荡结果倒扣一次配额还没奖励」，无从解释。扫荡是兑现已有结果，不是重打。
   *
   * 奖励走和手打完全一样的 `applyVictory`：金币、三选一、通关魂晶一分不少。
   * 刷取的天花板由每日配额来定（见 `SWEEP_ROUNDS_PER_DAY`），不靠削奖励来防——
   * 削奖励只会让扫荡变成一个没人用的按钮。
   */
  private sweepNode(): void {
    if (!canSweep(this.state)) {
      this.showToast('这一关还不能扫荡', { deny: true });
      return;
    }
    consumeSweep(this.state);
    AudioManager.playSfx('sfx_sweep');
    const run = this.state.run!;
    run.lastReportWinner = 'player';
    applyVictory(this.state);
    const last = isRunComplete(this.state);
    SaveManager.save(this.state);
    this.presentBattleWin(last);
  }

  private async resolveBattle(mode: BattleMode = 'manual'): Promise<void> {
    const units = buildBattleUnits(this.state);
    if (units.filter((u) => u.faction === 'player').length === 0) {
      this.showToast('请至少部署 1 个单位', { deny: true });
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
    // 上一版只把技能交给玩家，移动和目标仍归程序决策。结果是那一下点击既选不了位置也选不了对象，
    // 而且要等到该单位下次行动才生效——玩家能感到自己在操作，却影响不了任何结果。
    // 战棋的策略全部长在「谁站哪儿」上，不交出走位就等于没有策略。
    // 自动模式（扫荡）走同一个引擎的程序决策分支，不存在两套结算规则。
    const endless = isEndlessRun(this.state);
    const sandbox = isSandboxDungeon(run.dungeonId);
    const sim = createBattleSim(units, map, UNIT_DEFS, {
      aiDifficulty: endless ? endlessAiDifficulty(run.endless?.wave ?? 1) : stage.aiDifficulty,
      mode,
      enableDrops: endless,
      sandboxFreeCast: sandbox,
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
          this.lastBattleUnits = sim.getUnits().map((u) => ({
            ...u,
            pos: { ...u.pos },
            timedBattleEffects: u.timedBattleEffects?.map((e) => ({ ...e })),
          }));
          run.lastReportWinner = winner;
          this.finishBattleAfterPlayback(winner);
        },
        onHome: () => this.renderShell(),
        onReturnDeploy: () => {
          undoDeployForRetry(this.state);
          this.renderDeploy();
        },
      },
      {
        nodeLabel: sandbox
          ? '特效试炼 · 木桩场'
          : endless
            ? `${dungeon.name} ${run.endless?.wave ?? 1}/${ENDLESS_MAX_WAVES}`
            : `${dungeon.name} ${run.nodeIndex + 1}/${dungeon.nodes.length}`,
        sandbox,
        gold: run.gold,
        goldReward: endless ? 0 : currentStage(this.state).goldReward,
        potions: run.potions,
        allowReturnDeploy: !endless || (run.endless?.wave ?? 1) === 1,
        onConsumePotion: (potionId: string) => {
          run.potions[potionId] = Math.max(0, (run.potions[potionId] ?? 0) - 1);
        },
        onPickupPotion: endless
          ? (potionId: string) => {
              run.potions[potionId] = (run.potions[potionId] ?? 0) + 1;
            }
          : undefined,
      },
    );
    this.scenes.replaceAll(containerScene(container));
    AudioManager.playBgm('battle');
  }

  private finishBattleAfterPlayback(winner: Faction): void {
    if (this.state.run && isSandboxDungeon(this.state.run.dungeonId)) {
      SaveManager.save(this.state);
      this.showToast(winner === 'player' ? '试炼不记进度，可换技能再打' : '回布阵再来');
      this.renderDeploy();
      return;
    }
    const win = winner === 'player';
    if (!win) {
      SaveManager.save(this.state);
      this.showDefeatOverlay();
      return;
    }
    if (isEndlessRun(this.state)) {
      applyEndlessWaveVictory(this.state);
      const e = this.state.run?.endless;
      // 立刻把站位和血量写进存档：三选一还没选完就退出时，下一波不能靠内存快照
      if (e) e.carry = snapshotEndlessCarry(this.lastBattleUnits);
    } else {
      applyVictory(this.state);
    }
    const last = isRunComplete(this.state);
    SaveManager.save(this.state);
    this.presentBattleWin(last);
  }

  /**
   * 中途胜利和三选一合成一屏（横幅 + 入账条 + 选纹章）。
   * 没有三选一时仍要出胜利拍，不能直接切走。整章通关走魂晶结算。
   */
  private presentBattleWin(isRunFinal: boolean): void {
    if (isRunFinal) {
      this.showRewardOverlay(true);
      return;
    }
    const loot = this.state.run?.pendingLoot ?? [];
    if (loot.length > 0) this.showLootOverlay();
    else this.showRewardOverlay(false);
  }

  /** 无尽战后弹层的底板。不能直接盖在已销毁的战场上，也不该把人送回布阵改站位 */
  private renderEndlessBackdrop(): void {
    const c = new PIXI.Container();
    c.addChild(createBackground(this.app.screen.width, this.app.screen.height));
    this.scenes.replaceAll(containerScene(c));
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

  /** 通关结算：只展示魂精。中途胜利不再走这里。 */
  private showRewardOverlay(isRunFinal: boolean): void {
    const run = this.state.run!;
    const dungeon = currentDungeon(this.state);
    const v = run.lastVictory;
    const entries: RewardEntry[] = [];
    const endless = isEndlessRun(this.state);
    const wave = run.endless?.wave ?? 1;

    if (endless) {
      entries.push({
        iconKey: 'icon_soul',
        name: '魂晶',
        amount: v?.soul ?? ENDLESS_WAVE_SOUL,
        quality: '永久',
        desc: `清掉第 ${wave} 波当场入账。撑过的波次越多，这一局拿得越多。`,
        sources: ['无尽试炼'],
        tint: C.soul,
      });
      if (isRunFinal) {
        entries.push({
          iconKey: 'icon_soul',
          name: '通关魂晶',
          amount: ENDLESS_CLEAR_BONUS,
          quality: '永久',
          desc: `打完全部 ${ENDLESS_MAX_WAVES} 波的额外奖励。离开时入账。`,
          sources: ['无尽试炼'],
          tint: C.soul,
        });
      }
    } else if (isRunFinal) {
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
      // 重复打已首通节点魂晶是 0。画一格 +0 会被读成漏发，所以只展示这次真正入账的。
      if (v && v.soul > 0) {
        entries.push({
          iconKey: 'icon_soul',
          name: '魂晶',
          amount: v.soul,
          quality: '永久',
          desc: '带得出副本的永久货币，用来升级角色、学技能、招募同伴和解锁新章节。',
          sources: ['战斗节点首通', '章节通关'],
          tint: C.soul,
        });
      }
    }

    const hasLoot = !isRunFinal && (run.pendingLoot?.length ?? 0) > 0;
    const subtitle = endless
      ? `${dungeon.name} 第 ${wave}/${ENDLESS_MAX_WAVES} 波`
      : `${dungeon.name} ${run.nodeIndex + 1}/${dungeon.nodes.length}`;
    let close = (): void => undefined;
    close = this.pushOverlay(
      createRewardOverlay({
        screenW: this.app.screen.width,
        screenH: this.app.screen.height,
        title: isRunFinal ? '通  关' : '胜  利',
        subtitle,
        entries,
        confirmLabel: hasLoot ? '选择纹章' : (isRunFinal ? (endless ? '离开试炼' : '返回大厅') : (endless ? '下一波' : '继续前进')),
        onConfirm: () => {
          close();
          if (hasLoot) {
            this.showLootOverlay();
          } else if (isRunFinal) {
            if (endless) {
              const bonus = finishEndlessRun(this.state);
              SaveManager.saveRun(null);
              SaveManager.save(this.state);
              this.showToast(bonus > 0 ? `试炼完成，额外魂晶 +${bonus}` : '试炼结束');
              this.renderShell('challenge');
            } else {
              const result = finishRunVictory(this.state);
              SaveManager.save(this.state);
              this.showToast(`通关「${dungeon.name}」，魂晶 +${result.soul}`);
              this.presentUnlocksThen(result.unlockedRosterIds, () => this.renderShell('adventure'));
            }
          } else {
            this.advanceAfterVictory();
          }
        },
      }),
    );
  }

  /** 通关新入队的角色先亮相，其余用 Toast；关完再回大厅 */
  private presentUnlocksThen(unlockedRosterIds: string[], then: () => void): void {
    const [first, ...rest] = unlockedRosterIds;
    if (!first) {
      then();
      return;
    }
    for (const id of rest) {
      const def = this.state.meta.roster.find((m) => m.rosterId === id);
      this.showToast(def ? `${def.name} 已加入队伍` : '新同伴已加入队伍');
    }
    let close = (): void => undefined;
    close = this.pushOverlay(
      createCharacterRevealOverlay({
        screenW: this.app.screen.width,
        screenH: this.app.screen.height,
        rosterId: first,
        onConfirm: () => {
          close();
          then();
        },
      }),
    );
  }

  /** 中途胜利 + 纹章三选一 */
  private showLootOverlay(): void {
    const run = this.state.run!;
    const loot = run.pendingLoot ?? [];
    const v = run.lastVictory;
    let close = (): void => undefined;
    close = this.pushOverlay(
      createLootOverlay({
        screenW: this.app.screen.width,
        screenH: this.app.screen.height,
        cards: loot.map((o) => lootToCard(this.state, o)),
        summary: {
          gold: v?.gold ?? 0,
          soul: v?.soul ?? 0,
        },
        onConfirm: (i: number) => {
          const opt = loot[i];
          if (!opt || !claimLoot(this.state, opt)) return;
          close();
          this.advanceAfterVictory();
          this.showToast(
            opt.kind === 'skillMod' ? `纹章已铭刻：${opt.name}` : `「${opt.name}」已放入背包`,
          );
        },
        onSkip: () => {
          skipLoot(this.state);
          close();
          this.advanceAfterVictory();
        },
        onNeedPick: () => this.showToast('先选一张纹章', { deny: true }),
      }),
    );
  }

  /**
   * 战败盖在棋盘上：保留「刚输掉那一局」的上下文，再给回去改站位的出口。
   * 失败不撒彩纸。放弃按钮用 secondary——ghost 在深色遮罩上读不出来。
   */
  private showDefeatOverlay(): void {
    const endless = isEndlessRun(this.state);
    const waves = endlessWavesCleared(this.state);
    let close = (): void => undefined;
    close = this.pushOverlay(
      createDefeatOverlay({
        screenW: this.app.screen.width,
        screenH: this.app.screen.height,
        subtitle: endless ? `撑到第 ${waves} 波` : '本节点可重新布阵再试',
        primaryLabel: endless ? '离开试炼（保留已得魂晶）' : '返回布阵',
        onPrimary: () => {
          close();
          if (endless) {
            finishEndlessRun(this.state);
            SaveManager.saveRun(null);
            SaveManager.save(this.state);
            this.showToast(`试炼结束，最高记录 ${this.state.meta.endlessBestFloor ?? waves} 波`);
            this.renderShell('challenge');
            return;
          }
          undoDeployForRetry(this.state);
          this.renderDeploy();
        },
        secondaryLabel: endless ? undefined : '放弃副本（保留已得魂晶）',
        onSecondary: endless
          ? undefined
          : () => {
              close();
              abandonRun(this.state);
              SaveManager.saveRun(null);
              SaveManager.save(this.state);
              this.showToast('已放弃副本，局内物资清空');
              this.renderShell('adventure');
            },
      }),
    );
  }

  private advanceAfterVictory(): void {
    if (isEndlessRun(this.state)) {
      SaveManager.save(this.state);
      this.renderNode();
      return;
    }
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
            this.showToast('金币不足或商品无效', { deny: true });
            return;
          }
          AudioManager.playSfx('sfx_buy');
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
    AudioManager.playBgm('shop');
  }

  private showToast(msg: string, extra?: { deny?: boolean }): void {
    const current = this.scenes.current;
    if (!current) return;
    showSceneToast(current.root, msg, {
      screenWidth: this.app.screen.width,
      deny: extra?.deny,
    });
  }
}
