import * as PIXI from 'pixi.js';
import type { PixiHost } from '@/boot/createPixiApp';
import type { Faction, GroundDrop, UnitState } from '@/battle/types';
import { createBattleSim, type BattleMode } from '@/battle/engine';
import { UNIT_DEFS } from '@/data/unitDefs';
import { DUNGEON_DEFS, dungeonBattleBgKey, getDungeonDef } from '@/data/dungeonCatalog';
import { isEliteDungeon, officialDungeonIdOfElite } from '@/data/eliteCatalog';
import { adventureChapterList, isSandboxDungeon } from '@/data/sandboxLab';
import { gmPrepareSandboxRoster } from '@/game/state/gmCheats';
import {
  ENDLESS_CLEAR_BONUS,
  ENDLESS_DUNGEON_ID,
  ENDLESS_MAX_WAVES,
  ENDLESS_WAVE_SOUL,
  endlessAiDifficulty,
  isEndlessDungeon,
} from '@/data/endlessCatalog';
import { formatModStars, getSkillMod, isExclusiveMod, modStacks } from '@/data/skillModCatalog';
import {
  ABANDON_RUN_CONFIRM,
  createDefeatOverlay,
  createLootOverlay,
  createRewardOverlay,
  defeatHintsFor,
  type LootCard,
  type RewardEntry,
} from '@/view/battle/resultOverlay';
import { createSweepRewardOverlay } from '@/view/sweepRewardOverlay';
import {
  abandonRun,
  advanceNode,
  applyEndlessWaveVictory,
  applyVictory,
  battleTerrain,
  buildBattleUnits,
  buyShopOffer,
  applyChapterSweep,
  canSweepChapter,
  claimLoot,
  refreshPendingLoot,
  grantAdExtraSlot,
  continueEndlessWave,
  currentDungeon,
  currentNode,
  currentStage,
  endlessWavesCleared,
  finishEndlessRun,
  finishRunVictory,
  isEndlessRun,
  isDungeonUnlocked,
  isRunComplete,
  rosterHasAffordableLevelUp,
  previewChapterClear,
  recordRunBattleStats,
  recordRunPotionUse,
  snapshotEndlessCarry,
  rollShop,
  skipLoot,
  startRun,
  undoDeployForRetry,
  activateRunLane,
  adventureRunOf,
  type BuyShopContext,
  type LootOption,
  type MvpGameState,
  type ShopOffer,
} from '@/game/MvpState';
import { animSetsForUnits, createBattlePlaybackView } from '@/view/BattlePlaybackView';
import { createDeployView } from '@/view/DeployView';
import { createShopView } from '@/view/ShopView';
import { createLoadingView, type LoadingView } from '@/view/LoadingView';
import {
  adventureChapterIndexOf,
  createAdventureView,
  defaultAdventureChapterIndex,
  nextAdventureChapterIndex,
} from '@/view/AdventureView';
import { createRosterView, type RosterViewHandle } from '@/view/RosterView';
import { createRecruitView } from '@/view/RecruitView';
import { createChallengeView } from '@/view/ChallengeView';
import { createTabBar, tabBarHeight, tabSlotRect, type TabId } from '@/view/TabBar';
import { createEmblemAwakenOverlay } from '@/view/emblemAwaken';
import { attachHubUpgradeGuideOverlay } from '@/view/hubGuide/HubUpgradeGuideOverlay';
import {
  isHubUpgradeGuideActive,
  isHubUpgradeGuideClear,
  notifyHubUpgradeGuide,
  tryBeginHubUpgradeGuide,
} from '@/game/hubGuide/hubUpgradeGuide';
import { C } from '@/view/mvpTheme';
import { loadGameFonts } from '@/core/FontLoader';
import { showToast as showSceneToast } from '@/ui/Toast';
import { SceneManager } from '@/scene/SceneManager';
import type { Scene } from '@/scene/Scene';
import { PersistService } from '@/core/PersistService';
import { SaveManager } from '@/core/SaveManager';
import { AdManager } from '@/platform/AdManager';
import { CloudSyncManager } from '@/managers/CloudSyncManager';
import { AssetManager } from '@/core/AssetManager';
import { BATTLE_SCENE_BUNDLES, HUB_SCENE_BUNDLES, LOADING_BUNDLE, UI_BUNDLE } from '@/core/assetBundles';
import { animSetReady, ensureAnimSets, loadAnimSets } from '@/view/animSets';
import { characterArtKey } from '@/data/characterCatalog';
import { createBackground, createUnitToken } from '@/view/renderHelpers';
import { createCharacterRevealOverlay } from '@/view/characterReveal';
import { createInitialState, getCharacter } from '@/game/state/GameState';
import { getSkillSpec } from '@/data/skillCatalog';
import { AudioManager } from '@/core/AudioManager';
import { analytics, EVENT_NAMES, initAnalytics, setAnalyticsUserId } from '@/analytics/gpAnalytics';
import { Platform } from '@/platform/wxPlatform';
import { attachTutorialOverlay } from '@/view/tutorial/TutorialOverlay';
import {
  advanceTutorial,
  completeTutorial,
  hasLeftTutorial,
  isTutorialCompleted,
  notifyTutorial,
  readTutorialStep,
  startTutorial,
} from '@/game/tutorial/TutorialManager';
import { TutorialStep, isTutorialAtLeast, isTutorialBefore } from '@/game/tutorial/tutorialSteps';
import {
  applyTutorialBattle1Placement,
  grantTutorialJoinerAfterBattle,
  isTutorialRun,
  TUTORIAL_DUNGEON_ID,
  TUTORIAL_GRON_ID,
  TUTORIAL_HILL_ID,
  TUTORIAL_RAYEN_ID,
  tutorialScriptedSpawns,
  shouldHintHealPotion,
  shouldSkipTutorialDeploy,
} from '@/game/tutorial/tutorialRules';

/** 大厅底图预算。超了用场景主色进场，缺图后台补。 */
const HUB_BG_BUDGET_MS = 12000;
/** 云同步已经在等的那段时间，顺手再给战斗图一点。 */
const BATTLE_PRELOAD_SLACK_MS = 4000;

function containerScene(container: PIXI.Container): Scene {
  return { root: container, enter() {}, exit() {} };
}

/**
 * 战利品 → 三选一卡片的展示数据。
 *
 * 叠层用星星标在词条名下（选完后的级数），数值仍写进 `desc`：
 * 「★★☆」只回答叠到第几级，+50% 才回答这一级到底加了什么。
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
  const owned = state.run?.skillMods[o.rosterId] ?? [];
  const next = mod ? Math.min(mod.maxStacks, modStacks(owned, o.modId) + 1) : 0;
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
    stars: mod ? formatModStars(next, mod.maxStacks) || undefined : undefined,
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
  /** 冒险页章节页码。null = 跟当前进度走；手动翻过之后 Tab 切换回来不丢 */
  private adventureChapter: number | null = null;
  /** 冒险卡普通 / 精英。null = 跟当前局走；手动切过之后 Tab 切换回来不丢 */
  private adventureEliteMode: boolean | null = null;
  /** 通关回大厅时，下一章先按锁定态播开锁动画 */
  private pendingChapterUnlockId: string | null = null;
  private shellRoot: PIXI.Container | null = null;
  private rosterHandle: RosterViewHandle | null = null;
  private detachHubGuide: (() => void) | null = null;
  /** 刚结束那场战斗的单位快照，无尽用来把血量和站位带进下一波 */
  private lastBattleUnits: UnitState[] = [];
  private lastBattleDrops: GroundDrop[] = [];
  private loading: LoadingView | null = null;
  /** 启动云同步完成、大厅已可渲染后才接受下行覆盖 */
  private started = false;
  /** 清缓存后等云档，避免先开教程再被进度档打断卡死 */
  private cloudTutorialHold = false;
  private cloudTutorialHoldTimer: ReturnType<typeof setTimeout> | null = null;
  /** 本局开战时刻，给 level_clear / level_fail 算 duration_ms */
  private runStartedAt = 0;
  private runEndTracked = false;
  private lastHideAt = 0;

  constructor(private readonly app: PixiHost) {
    this.scenes = new SceneManager(app.stage);
    this.state = createInitialState();
    this.bindCloudLifecycle();
    this.showLoading();
    void this.loadAssetsAndStart().catch((e) => {
      console.error('[GameFlow] 启动加载失败，仍进入大厅:', e);
      this.finishLoadingIntoHub();
    });
  }

  private bindCloudLifecycle(): void {
    PersistService.subscribeCloudImport((info) => {
      if (!this.started || info.changedKeys.length === 0) return;
      const loaded = SaveManager.load();
      if (!loaded) return;
      this.state = loaded;
      this.dropHiddenGmRun();
      this.routeAfterLoad();
    });
    Platform.onHide(() => {
      void CloudSyncManager.flushNow('app-hide');
      analytics.trackSessionEnd('app-hide');
      this.lastHideAt = Date.now();
    });
    Platform.onShow(() => {
      if (this.lastHideAt > 0) {
        analytics.trackAppShow({ background_ms: Date.now() - this.lastHideAt });
      }
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
    // 开屏画出来再登录，避免华为卡在微信白底；剩下的读盘时间足够拉云档。
    CloudSyncManager.prewarm();

    await AssetManager.loadBundle(UI_BUNDLE, (n, t) => {
      setP(0.12 + (t > 0 ? n / t : 1) * 0.28);
    });
    await fontsReady;
    loading?.refreshTitleFont();
    setP(0.42);

    const hubTotal = HUB_SCENE_BUNDLES.reduce((sum, b) => sum + Object.keys(b?.assets || {}).length, 0);
    let hubDone = 0;
    const hubLoaded = Promise.all(
      HUB_SCENE_BUNDLES.map((b) => {
        let last = 0;
        return AssetManager.loadBundle(b, (n) => {
          hubDone += n - last;
          last = n;
          if (hubTotal > 0) setP(0.42 + (hubDone / hubTotal) * 0.40);
        });
      }),
    );
    await Promise.race([
      hubLoaded,
      new Promise<void>((resolve) => setTimeout(resolve, HUB_BG_BUDGET_MS)),
    ]);
    if (hubDone < hubTotal) {
      console.warn(`[GameFlow] 大厅底图未齐就进场 (${hubDone}/${hubTotal})，缺图走兜底色`);
    }

    // 地形/单位/特效不挡大厅。进战前 ensureAnimSets 会再等本场要用的。
    const battleLoaded = Promise.all(
      BATTLE_SCENE_BUNDLES.map((b) => AssetManager.loadBundle(b)),
    );
    loadAnimSets();
    setP(0.88);
    // 等大厅图发完再 init：经分 wx.request 和 downloadFile 抢同一条并发配额，会把 Loading 卡在 42%。
    initAnalytics();
    const sync = await CloudSyncManager.awaitStartupSync();
    await Promise.race([
      battleLoaded,
      new Promise<void>((resolve) => setTimeout(resolve, BATTLE_PRELOAD_SLACK_MS)),
    ]);
    console.log(`[GameFlow] 云同步启动: ${sync.status} (${sync.reason})`);
    const userId = CloudSyncManager.userId;
    if (userId) setAnalyticsUserId(userId);
    else console.warn('[GameFlow] 未拿到登录 userId，经分仅以 anonymous_id 上报');
    analytics.trackSessionStart({
      entry: 'main_boot',
      with_user_id: !!userId,
      cloud_sync_ready: CloudSyncManager.ready,
    });
    this.finishLoadingIntoHub();
  }

  private finishLoadingIntoHub(): void {
    if (this.started) return;
    this.state = SaveManager.loadOrCreate();
    this.dropHiddenGmRun();
    this.started = true;
    this.loading?.setProgress(1);
    this.loading = null;
    this.routeAfterLoad();
  }

  private shouldSkipTutorial(): boolean {
    return isTutorialCompleted(this.state.meta) || hasLeftTutorial(this.state.meta);
  }

  private persistTutorialCompleted(): void {
    if (isTutorialCompleted(this.state.meta) || !hasLeftTutorial(this.state.meta)) return;
    completeTutorial(this.state);
    SaveManager.save(this.state);
  }

  private clearCloudTutorialHold(): void {
    this.cloudTutorialHold = false;
    if (this.cloudTutorialHoldTimer) {
      clearTimeout(this.cloudTutorialHoldTimer);
      this.cloudTutorialHoldTimer = null;
    }
  }

  private shouldWaitForCloudBeforeTutorial(): boolean {
    if (this.shouldSkipTutorial()) return false;
    if (this.state.run) return false;
    if (!CloudSyncManager.enabled) return false;
    return CloudSyncManager.cacheOnly || CloudSyncManager.authorityState === 'unknown';
  }

  private routeAfterLoad(): void {
    if (this.shouldSkipTutorial()) {
      this.clearCloudTutorialHold();
      this.persistTutorialCompleted();
      this.renderShell();
      return;
    }
    if (this.shouldWaitForCloudBeforeTutorial()) {
      this.cloudTutorialHold = true;
      this.renderShell();
      this.showToast('正在同步云档…');
      if (!this.cloudTutorialHoldTimer) {
        this.cloudTutorialHoldTimer = setTimeout(() => {
          this.cloudTutorialHoldTimer = null;
          if (!this.cloudTutorialHold) return;
          this.cloudTutorialHold = false;
          if (this.shouldSkipTutorial()) {
            this.persistTutorialCompleted();
            this.renderShell();
            return;
          }
          this.enterTutorialFromBoot();
        }, 8000);
      }
      return;
    }
    this.clearCloudTutorialHold();
    this.enterTutorialFromBoot();
  }

  private enterTutorialFromBoot(): void {
    if (this.shouldSkipTutorial()) {
      this.persistTutorialCompleted();
      this.renderShell();
      return;
    }
    if (!this.state.run) {
      if (readTutorialStep(this.state.meta) === TutorialStep.NOT_STARTED) {
        startTutorial(this.state);
      }
      const party = this.state.meta.roster.map((m) => m.rosterId);
      startRun(this.state, TUTORIAL_DUNGEON_ID, party.length > 0 ? party : [TUTORIAL_RAYEN_ID]);
      const s = readTutorialStep(this.state.meta);
      if (isTutorialAtLeast(s, TutorialStep.BATTLE3_WATCH_GRON)) this.state.run!.nodeIndex = 3;
      else if (isTutorialAtLeast(s, TutorialStep.SHOP_INTRO)) this.state.run!.nodeIndex = 2;
      else if (isTutorialAtLeast(s, TutorialStep.DEPLOY2_INTRO)) this.state.run!.nodeIndex = 1;
      if (this.state.run!.nodeIndex === 0) applyTutorialBattle1Placement(this.state);
      this.shopOffers = null;
      this.trackRunStart(TUTORIAL_DUNGEON_ID);
      SaveManager.save(this.state);
    }
    this.renderNode();
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
    const unlocking = this.currentTab === 'adventure' && !!this.pendingChapterUnlockId;
    this.detachHubGuide = null;
    this.rosterHandle = null;
    const root = new PIXI.Container();
    this.shellRoot = root;
    root.addChild(this.buildTabContent(this.currentTab));
    root.addChild(
      createTabBar(this.currentTab, (t) => {
        if (t === 'roster' && notifyHubUpgradeGuide(this.state, { type: 'openRoster' })) {
          SaveManager.saveMeta(this.state.meta);
        }
        this.renderShell(t);
      }, this.screen, {
        alerts: { roster: rosterHasAffordableLevelUp(this.state.meta) },
      }),
    );
    if (!unlocking) this.attachHubUpgradeGuide(root);
    this.scenes.replaceAll(containerScene(root));
    AudioManager.playBgm('hub');
  }

  private attachHubUpgradeGuide(root: PIXI.Container): void {
    this.detachHubGuide?.();
    this.detachHubGuide = null;
    if (!isHubUpgradeGuideActive(this.state.meta)) return;
    this.detachHubGuide = attachHubUpgradeGuideOverlay(root, {
      getState: () => this.state,
      screenW: this.app.screen.width,
      screenH: this.app.screen.height,
      currentTab: () => this.currentTab,
      tabRect: (id) => tabSlotRect(id, this.screen),
      cardRect: (id) => this.rosterHandle?.cardRect(id) ?? null,
      levelUpButtonRect: () => this.rosterHandle?.levelUpButtonRect() ?? null,
      detailRosterId: () => this.rosterHandle?.detailRosterId() ?? null,
    });
  }

  private onChapterUnlockRevealDone(): void {
    if (!this.shellRoot || this.shellRoot.destroyed) return;
    this.attachHubUpgradeGuide(this.shellRoot);
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
      case 'adventure': {
        const chapters = adventureChapterList(DUNGEON_DEFS, Platform.isGmTools);
        const chapterIndex = this.adventureChapter
          ?? defaultAdventureChapterIndex(this.state, chapters);
        const run = adventureRunOf(this.state);
        const eliteMode = this.adventureEliteMode
          ?? (!!run && isEliteDungeon(run.dungeonId));
        const unlockRevealId = this.pendingChapterUnlockId;
        this.pendingChapterUnlockId = null;
        return createAdventureView(
          this.state,
          chapterIndex,
          {
            onStartRun: (dungeonId, party) => this.startRunAndEnter(dungeonId, party),
            onContinueRun: () => {
              this.adventureChapter = null;
              activateRunLane(this.state, 'adventure');
              this.renderNode();
            },
            onSweepChapter: (dungeonId) => this.sweepChapter(dungeonId),
            onChanged: persistAndRedraw,
            onChapterChange: (i) => { this.adventureChapter = i; },
            onEliteModeChange: (elite) => { this.adventureEliteMode = elite; },
            onUnlockRevealDone: () => this.onChapterUnlockRevealDone(),
          },
          screen,
          eliteMode,
          unlockRevealId,
        );
      }
      case 'roster': {
        // 角色页的弹窗要能连着升级不被弹回网格，所以给它一个「只存盘」的口子；
        // 重绘推迟到关窗时由它自己发起（见 RosterCallbacks.onPersist）
        if (notifyHubUpgradeGuide(this.state, { type: 'openRoster' })) {
          persist();
        }
        this.rosterHandle = createRosterView(
          this.state,
          {
            onChanged: persistAndRedraw,
            onPersist: persist,
            onGoRecruit: () => this.renderShell('recruit'),
            onGuideRefresh: () => {
              if (this.shellRoot && !this.shellRoot.destroyed) {
                this.attachHubUpgradeGuide(this.shellRoot);
              }
            },
            onExclusiveAwaken: (info) => {
              persist();
              let close = (): void => undefined;
              close = this.pushOverlay(
                createEmblemAwakenOverlay({
                  screenW: this.app.screen.width,
                  screenH: this.app.screen.height,
                  info,
                  onConfirm: () => close(),
                }),
              );
            },
          },
          screen,
        );
        return this.rosterHandle.root;
      }
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

  private pinAdventureToDungeon(dungeonId: string): void {
    const chapters = adventureChapterList(DUNGEON_DEFS, Platform.isGmTools);
    this.adventureChapter = adventureChapterIndexOf(chapters, dungeonId);
    this.pendingChapterUnlockId = null;
  }

  private markAdventureAfterChapterClear(clearedDungeonId: string, firstClear: boolean): void {
    if (isEliteDungeon(clearedDungeonId)) {
      this.pinAdventureToDungeon(clearedDungeonId);
      return;
    }
    const chapters = adventureChapterList(DUNGEON_DEFS, Platform.isGmTools);
    const officialId = officialDungeonIdOfElite(clearedDungeonId) ?? clearedDungeonId;
    this.adventureChapter = nextAdventureChapterIndex(chapters, officialId);
    const next = chapters[this.adventureChapter];
    this.pendingChapterUnlockId = firstClear && next && next.id !== officialId
      && isDungeonUnlocked(this.state.meta, next.id)
      ? next.id
      : null;
  }

  private startRunAndEnter(dungeonId: string, party: string[]): void {
    if (isSandboxDungeon(dungeonId)) {
      if (!Platform.isGmTools) return;
      gmPrepareSandboxRoster(this.state);
      party = this.state.meta.roster.map((m) => m.rosterId);
    }
    startRun(this.state, dungeonId, party);
    if (!isEndlessDungeon(dungeonId)) this.adventureChapter = null;
    if (isEliteDungeon(dungeonId)) this.adventureEliteMode = true;
    else if (!isEndlessDungeon(dungeonId) && !isSandboxDungeon(dungeonId)) {
      this.adventureEliteMode = false;
    }
    this.shopOffers = null;
    this.trackRunStart(dungeonId);
    SaveManager.save(this.state);
    this.renderNode();
  }

  /** 无尽从副本页直接开打，不绕冒险页选章；进行中的冒险停在另一条线，互不影响 */
  private startEndless(): void {
    if (isTutorialRun(this.state)) {
      this.showToast('先打完这一章的教学', { deny: true });
      return;
    }
    if (activateRunLane(this.state, 'challenge')) {
      SaveManager.save(this.state);
      this.renderNode();
      return;
    }
    const party = this.state.meta.roster.map((m) => m.rosterId);
    this.startRunAndEnter(ENDLESS_DUNGEON_ID, party);
  }

  // ---------------- 副本节点路由 ----------------

  /** 真机不进特效试炼：清掉模拟器留下的局，避免冒险页还露「继续」。 */
  private dropHiddenGmRun(): void {
    if (Platform.isGmTools) return;
    if (this.state.run && isSandboxDungeon(this.state.run.dungeonId)) this.state.run = null;
    if (this.state.parkedRun && isSandboxDungeon(this.state.parkedRun.dungeonId)) {
      this.state.parkedRun = null;
    }
  }

  private renderNode(): void {
    this.dropHiddenGmRun();
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
        this.trackRunEnd('clear');
        const bonus = finishEndlessRun(this.state);
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
    } else if (shouldSkipTutorialDeploy(this.state)) {
      applyTutorialBattle1Placement(this.state);
      void this.resolveBattle('manual');
    } else {
      this.renderDeploy();
    }
  }

  private renderDeploy(): void {
    this.state.phase = 'deploy';
    if (isTutorialRun(this.state) && this.state.run!.nodeIndex === 1) {
      const step = readTutorialStep(this.state.meta);
      if (isTutorialBefore(step, TutorialStep.DEPLOY2_INTRO)) advanceTutorial(this.state, TutorialStep.DEPLOY2_INTRO);
      const placed = new Set(this.state.run!.placements.map((p) => p.rosterId));
      if (placed.has(TUTORIAL_RAYEN_ID) && readTutorialStep(this.state.meta) === TutorialStep.DEPLOY2_PLACE_SWORD) {
        advanceTutorial(this.state, TutorialStep.DEPLOY2_PLACE_BOW);
      }
      if (placed.has(TUTORIAL_HILL_ID) && readTutorialStep(this.state.meta) === TutorialStep.DEPLOY2_PLACE_BOW) {
        advanceTutorial(this.state, TutorialStep.DEPLOY2_START);
      }
    }
    const handle = createDeployView(
      this.state,
      {
        onStartBattle: (mode) => void this.resolveBattle(mode),
        onWarn: (msg) => this.showToast(msg),
        onReset: () => {
          if (isTutorialRun(this.state)) {
            this.showToast('先打完这一章的教学', { deny: true });
            return;
          }
          const endless = isEndlessRun(this.state);
          const leftDungeonId = this.state.run?.dungeonId;
          this.trackRunEnd('abandon');
          if (endless) finishEndlessRun(this.state);
          else abandonRun(this.state);
          SaveManager.save(this.state);
          this.showToast(endless ? '已离开试炼' : '已放弃副本');
          if (!endless && leftDungeonId) this.pinAdventureToDungeon(leftDungeonId);
          this.renderShell(endless ? 'challenge' : 'adventure');
        },
        onHome: () => {
          if (isTutorialRun(this.state)) {
            this.showToast('先打完这一章的教学', { deny: true });
            return;
          }
          this.renderShell();
        },
        onRefresh: () => this.renderDeploy(),
        onPlacementChange: (rosterId) => {
          notifyTutorial(this.state, { type: 'placed', rosterId });
          SaveManager.save(this.state);
        },
        onSelectRoster: () => notifyTutorial(this.state, { type: 'refresh' }),
        onAdExtraSlot: () => {
          void (async () => {
            const ok = await AdManager.showRewarded('extraDeploy');
            if (!ok) {
              this.showToast('广告未播完，上阵位没有增加', { deny: true });
              return;
            }
            if (!grantAdExtraSlot(this.state)) {
              this.showToast('现在加不了人', { deny: true });
              return;
            }
            SaveManager.save(this.state);
            this.showToast('可以再上阵一人');
            this.renderDeploy();
          })();
        },
      },
      this.screen,
    );
    void ensureAnimSets(animSetsForUnits(buildBattleUnits(this.state)));
    this.scenes.replaceAll(containerScene(handle.root));
    if (isTutorialRun(this.state) && this.state.run!.nodeIndex === 1) {
      attachTutorialOverlay(handle.root, {
        getState: () => this.state,
        scope: 'deploy',
        screenW: this.app.screen.width,
        screenH: this.app.screen.height,
        benchRect: (id) => handle.benchRect(id),
        fightRect: () => handle.fightRect(),
        cellRect: (x, y) => handle.cellRect(x, y),
        selectedRosterId: () => handle.selectedRosterId(),
      });
    }
    AudioManager.playBgm('deploy');
  }

  /**
   * 整章扫荡：不建 run、不进战斗。已通关章节在冒险页点一次，拿重复通关魂晶。
   */
  private sweepChapter(dungeonId: string): void {
    if (adventureRunOf(this.state)) {
      this.showToast('先结束当前的冒险', { deny: true });
      return;
    }
    if (!canSweepChapter(this.state, dungeonId)) {
      this.showToast('这一章还不能扫荡', { deny: true });
      return;
    }
    const { soul } = applyChapterSweep(this.state, dungeonId);
    AudioManager.playSfx('sfx_sweep');
    SaveManager.save(this.state);
    if (soul <= 0) {
      this.showToast('扫荡完成', { deny: true });
      this.renderShell('adventure');
      return;
    }
    // 先不换页：顶栏还是入账前的数字，飞币才有落点。收下后再刷新配额和魂晶。
    let close = (): void => undefined;
    close = this.pushOverlay(
      createSweepRewardOverlay({
        screenW: this.app.screen.width,
        screenH: this.app.screen.height,
        chapterName: getDungeonDef(dungeonId)?.name ?? '本章',
        soul,
        onConfirm: () => {
          close();
          this.renderShell('adventure');
        },
      }),
    );
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
    const tut = isTutorialRun(this.state);
    const sim = createBattleSim(units, map, UNIT_DEFS, {
      aiDifficulty: endless ? endlessAiDifficulty(run.endless?.wave ?? 1) : stage.aiDifficulty,
      mode,
      enableDrops: endless,
      initialDrops: endless ? (run.endless?.groundDrops ?? []) : undefined,
      sandboxFreeCast: sandbox,
      scriptedSpawns: tut ? tutorialScriptedSpawns(this.state) : undefined,
    });
    this.state.phase = 'battle';
    const handle = createBattlePlaybackView(
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
          this.lastBattleDrops = sim.getDrops();
          run.lastReportWinner = winner;
          if (winner === 'player' && !sandbox && !endless) {
            recordRunBattleStats(run, {
              rounds: sim.getRound(),
              allyDeaths: sim.getUnits().filter((u) => u.faction === 'player' && u.hp <= 0).length,
            });
          }
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
        nodeTitle: sandbox ? '特效试炼' : dungeon.name,
        nodeMark: sandbox
          ? '木桩场'
          : endless
            ? `${run.endless?.wave ?? 1}/${ENDLESS_MAX_WAVES}`
            : `${run.nodeIndex + 1}/${dungeon.nodes.length}`,
        battleBg: dungeonBattleBgKey(dungeon),
        sandbox,
        gold: run.gold,
        goldReward: endless ? 0 : currentStage(this.state).goldReward,
        potions: run.potions,
        allowReturnDeploy: !endless || (run.endless?.wave ?? 1) === 1,
        onConsumePotion: (potionId: string) => {
          run.potions[potionId] = Math.max(0, (run.potions[potionId] ?? 0) - 1);
          if (!sandbox) recordRunPotionUse(run);
        },
        onPickupPotion: endless
          ? (potionId: string) => {
              run.potions[potionId] = (run.potions[potionId] ?? 0) + 1;
            }
          : undefined,
        tutorialLock: tut && (run.nodeIndex === 0 || run.nodeIndex === 1 || run.nodeIndex === 3),
        tutorialAllowPilot: tut && run.nodeIndex === 1,
        onTutorialEvent: (e) => notifyTutorial(this.state, e),
      },
    );
    this.scenes.replaceAll(containerScene(handle.root));
    if (tut && run.nodeIndex === 1 && isTutorialBefore(readTutorialStep(this.state.meta), TutorialStep.BATTLE2_PILOT)) {
      advanceTutorial(this.state, TutorialStep.BATTLE2_PILOT);
    }
    if (tut && (run.nodeIndex === 0 || run.nodeIndex === 1 || run.nodeIndex === 3)) {
      attachTutorialOverlay(handle.root, {
        getState: () => this.state,
        scope: 'battle',
        screenW: this.app.screen.width,
        screenH: this.app.screen.height,
        cellRect: (x, y) => handle.cellRect(x, y),
        skillButtonRect: () => handle.skillButtonRect(),
        skillSpent: () => handle.skillSpent(),
        skillAiming: () => handle.skillAiming(),
        hillOnField: () => handle.hasRoster(TUTORIAL_HILL_ID),
        pilotRect: () => handle.pilotRect(),
        potionRect: () => handle.potionRect('heal'),
        potionHint: () => run.nodeIndex === 3 && shouldHintHealPotion(
          sim.getUnits(),
          run.potions.heal ?? 0,
        ),
      });
    }
    AudioManager.playBgm('battle');
  }

  private finishBattleAfterPlayback(winner: Faction): void {
    if (!this.state.run) return;
    if (isSandboxDungeon(this.state.run.dungeonId)) {
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
      if (e) {
        e.carry = snapshotEndlessCarry(this.lastBattleUnits);
        e.groundDrops = this.lastBattleDrops.map((d) => ({
          pos: { ...d.pos },
          potionId: d.potionId,
        }));
      }
    } else {
      applyVictory(this.state);
    }
    const last = isRunComplete(this.state);
    const joined = grantTutorialJoinerAfterBattle(this.state);
    if (joined === TUTORIAL_HILL_ID) advanceTutorial(this.state, TutorialStep.HILL_REVEAL);
    if (joined === TUTORIAL_GRON_ID) advanceTutorial(this.state, TutorialStep.GRON_REVEAL);
    SaveManager.save(this.state);
    if (joined) {
      this.presentUnlocksThen([joined], () => {
        if (joined === TUTORIAL_GRON_ID) completeTutorial(this.state);
        if (joined === TUTORIAL_HILL_ID) advanceTutorial(this.state, TutorialStep.DEPLOY2_INTRO);
        SaveManager.save(this.state);
        this.presentBattleWin(last);
      });
      return;
    }
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
    const chapterPreview = !endless && isRunFinal
      ? previewChapterClear(this.state, dungeon.id)
      : null;

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
    } else if (chapterPreview) {
      const starNote = chapterPreview.labels.length > 0
        ? `新点亮：${chapterPreview.labels.join('、')}。`
        : chapterPreview.firstClear
          ? '本趟没有点亮新的星。'
          : '本关奖励每次通关都能领。';
      entries.push({
        iconKey: 'icon_soul',
        name: '魂晶',
        amount: chapterPreview.soul,
        quality: '永久',
        desc: chapterPreview.firstClear
          ? `通关「${dungeon.name}」。${starNote}每颗星的魂晶只领一次。`
          : `再通「${dungeon.name}」。${starNote}`,
        sources: ['章节星级', '本关奖励'],
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
      : chapterPreview
        ? (chapterPreview.labels.length > 0
          ? `${dungeon.name} · 新点亮 ${chapterPreview.labels.join('、')}`
          : `${dungeon.name} · 魂晶 +${chapterPreview.soul}`)
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
            if (!this.state.run) return;
            if (endless) {
              this.trackRunEnd('clear');
              const bonus = finishEndlessRun(this.state);
              SaveManager.save(this.state);
              this.showToast(bonus > 0 ? `试炼完成，额外魂晶 +${bonus}` : '试炼结束');
              this.renderShell('challenge');
            } else {
              const firstClear = !isEliteDungeon(dungeon.id)
                && !this.state.meta.clearedDungeonIds.includes(dungeon.id);
              this.trackRunEnd('clear');
              const result = finishRunVictory(this.state);
              SaveManager.save(this.state);
              this.showToast(`通关「${dungeon.name}」，魂晶 +${result.soul}`);
              this.markAdventureAfterChapterClear(dungeon.id, firstClear);
              this.presentUnlocksThen(result.unlockedRosterIds, () => {
                if (isHubUpgradeGuideClear(dungeon.id)) {
                  tryBeginHubUpgradeGuide(this.state.meta);
                  SaveManager.saveMeta(this.state.meta);
                }
                this.renderShell('adventure');
              });
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
    let settled = false;
    const done = (): void => {
      if (settled) return;
      settled = true;
      then();
    };
    const [first, ...rest] = unlockedRosterIds;
    if (!first) {
      done();
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
          done();
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
        onRefresh: isTutorialRun(this.state)
          ? undefined
          : () => {
              void (async () => {
                const ok = await AdManager.showRewarded('lootRefresh');
                if (!ok) {
                  this.showToast('广告未播完，选项没有换', { deny: true });
                  return;
                }
                refreshPendingLoot(this.state);
                SaveManager.save(this.state);
                close();
                this.showToast('选项已刷新，普通纹章更少见了');
                this.showLootOverlay();
              })();
            },
      }),
    );
  }

  /**
   * 战败盖在棋盘上：保留「刚输掉那一局」的上下文，再给回去改站位的出口。
   * 失败不撒彩纸。章节失败先讲变强的办法；放弃要二次确认，避免误清章节进度。
   */
  private showDefeatOverlay(): void {
    const endless = isEndlessRun(this.state);
    const tutorial = isTutorialRun(this.state);
    const waves = endlessWavesCleared(this.state);
    const hintSet = endless ? 'endless' : tutorial ? 'tutorial' : 'chapter';
    let close = (): void => undefined;
    close = this.pushOverlay(
      createDefeatOverlay({
        screenW: this.app.screen.width,
        screenH: this.app.screen.height,
        subtitle: endless
          ? `撑到第 ${waves} 波。已得魂晶保留，回大厅还能招募和升级。`
          : tutorial
            ? '这一关可以立刻再打。返回布阵会重打本节点。'
            : '返回布阵会重打本节点，已得魂晶保留。',
        hints: defeatHintsFor(hintSet),
        primaryLabel: endless
          ? '离开试炼（保留已得魂晶）'
          : (shouldSkipTutorialDeploy(this.state) ? '再打一次' : '返回布阵'),
        onPrimary: () => {
          close();
          if (endless) {
            this.trackRunEnd('fail');
            finishEndlessRun(this.state);
            SaveManager.save(this.state);
            this.showToast(`试炼结束，最高记录 ${this.state.meta.endlessBestFloor ?? waves} 波`);
            this.renderShell('challenge');
            return;
          }
          undoDeployForRetry(this.state);
          if (shouldSkipTutorialDeploy(this.state)) {
            applyTutorialBattle1Placement(this.state);
            void this.resolveBattle('manual');
            return;
          }
          this.renderDeploy();
        },
        secondaryLabel: endless || tutorial ? undefined : '放弃副本',
        onSecondary: endless || tutorial
          ? undefined
          : () => {
              close();
              const leftDungeonId = this.state.run?.dungeonId;
              this.trackRunEnd('abandon');
              abandonRun(this.state);
              SaveManager.save(this.state);
              this.showToast('已放弃副本，局内物资清空');
              if (leftDungeonId) this.pinAdventureToDungeon(leftDungeonId);
              this.renderShell('adventure');
            },
        abandonConfirm: endless || tutorial ? undefined : ABANDON_RUN_CONFIRM,
      }),
    );
  }

  private advanceAfterVictory(): void {
    if (!this.state.run) return;
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
    if (isTutorialRun(this.state) && isTutorialBefore(readTutorialStep(this.state.meta), TutorialStep.SHOP_INTRO)) {
      advanceTutorial(this.state, TutorialStep.SHOP_INTRO);
    }
    if (!this.shopOffers) this.shopOffers = rollShop(this.state);
    const handle = createShopView(
      this.state,
      this.shopOffers,
      {
        onBuy: (offer: ShopOffer, ctx?: BuyShopContext) => {
          if (!buyShopOffer(this.state, offer, ctx)) {
            this.showToast('金币不足或商品无效', { deny: true });
            return;
          }
          AudioManager.playSfx('sfx_buy');
          notifyTutorial(this.state, {
            type: 'bought',
            offer: offer.type === 'potion' ? 'potion' : 'tempSkill',
          });
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
        onRefresh: isTutorialRun(this.state)
          ? undefined
          : () => {
              void (async () => {
                const ok = await AdManager.showRewarded('shopRefresh');
                if (!ok) {
                  this.showToast('广告未播完，货架没有换', { deny: true });
                  return;
                }
                this.shopOffers = rollShop(this.state);
                SaveManager.save(this.state);
                this.showToast('货架已换新');
                this.renderShop();
              })();
            },
      },
      this.screen,
    );
    this.scenes.replaceAll(containerScene(handle.root));
    if (isTutorialRun(this.state)) {
      attachTutorialOverlay(handle.root, {
        getState: () => this.state,
        scope: 'shop',
        screenW: this.app.screen.width,
        screenH: this.app.screen.height,
        potionRect: () => handle.potionRect(),
        buyRect: () => handle.buyRect(),
        leaveRect: () => handle.leaveRect(),
      });
    }
    AudioManager.playBgm('shop');
  }

  private trackRunStart(dungeonId: string): void {
    if (isSandboxDungeon(dungeonId)) return;
    this.runStartedAt = Date.now();
    this.runEndTracked = false;
    analytics.track(EVENT_NAMES.LEVEL_START, {
      level_id: isEliteDungeon(dungeonId) ? dungeonId : this.dungeonChapterIndex(dungeonId) + 1,
      level_name: dungeonId,
      endless: isEndlessDungeon(dungeonId),
    });
  }

  private trackRunEnd(result: 'clear' | 'fail' | 'abandon'): void {
    const dungeonId = this.state.run?.dungeonId ?? '';
    if (this.runEndTracked || !dungeonId || isSandboxDungeon(dungeonId)) return;
    this.runEndTracked = true;
    const params = {
      level_id: isEliteDungeon(dungeonId) ? dungeonId : this.dungeonChapterIndex(dungeonId) + 1,
      level_name: dungeonId,
      duration_ms: Math.max(0, Date.now() - this.runStartedAt),
      reached_wave: this.state.run?.endless?.wave ?? (this.state.run ? this.state.run.nodeIndex + 1 : 0),
      reason: result,
      endless: isEndlessDungeon(dungeonId),
    };
    analytics.track(result === 'clear' ? EVENT_NAMES.LEVEL_CLEAR : EVENT_NAMES.LEVEL_FAIL, params);
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
