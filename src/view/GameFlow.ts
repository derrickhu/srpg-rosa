import * as PIXI from 'pixi.js';
import type { PixiHost } from '@/boot/createPixiApp';
import type { BattleReport } from '@/battle/types';
import { runBattle } from '@/battle/engine';
import { UNIT_DEFS } from '@/data/unitDefs';
import {
  advanceStage,
  applyVictory,
  battleTerrain,
  buildBattleUnits,
  buyShopOffer,
  createInitialState,
  currentStage,
  type BuyShopContext,
  type MvpGameState,
  type ShopOffer,
  resetRun,
  rollShop,
  undoDeployForRetry,
} from '@/game/MvpState';
import { STAGES_MVP } from '@/data/stagesMvp';
import { createBattlePlaybackView } from '@/view/BattlePlaybackView';
import { createDeployView } from '@/view/DeployView';
import { createShopView } from '@/view/ShopView';
import { createHomeView } from '@/view/HomeView';
import { C } from '@/view/mvpTheme';
import { SceneManager } from '@/scene/SceneManager';
import type { Scene } from '@/scene/Scene';
import { makeButton } from '@/ui/Button';
import { SaveManager } from '@/core/SaveManager';
import { AssetManager } from '@/core/AssetManager';
import { ALL_BUNDLES } from '@/core/assetBundles';
import { createBackground } from '@/view/renderHelpers';

/** Wrap a factory-created PIXI.Container as a Scene. */
function containerScene(container: PIXI.Container): Scene {
  return {
    root: container,
    enter() {},
    exit() {},
  };
}

/**
 * MVP 状态机：Deploy →（同步演算战）→ Result → Shop → Deploy
 */
export class GameFlow {
  private readonly scenes: SceneManager;
  private state: MvpGameState;

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
    const t = new PIXI.Text('加载中…', { fill: C.text, fontSize: 18 });
    t.anchor.set(0.5);
    t.x = this.app.screen.width / 2;
    t.y = this.app.screen.height / 2;
    c.addChild(t);
    this.scenes.replaceAll(containerScene(c));
  }

  private async loadAssetsAndStart(): Promise<void> {
    await Promise.all(ALL_BUNDLES.map((b) => AssetManager.loadBundle(b)));
    this.renderHome();
  }

  private renderHome(): void {
    const container = createHomeView(
      { onStart: () => this.renderDeploy() },
      { screenWidth: this.app.screen.width, screenHeight: this.app.screen.height },
    );
    this.scenes.replaceAll(containerScene(container));
  }

  private cx(): number {
    return this.app.screen.width / 2;
  }

  private renderDeploy(): void {
    const container = createDeployView(
      this.state,
      {
        onStartBattle: () => this.resolveBattle(),
        onReset: () => {
          resetRun(this.state);
          SaveManager.clear();
          this.renderDeploy();
        },
        onHome: () => {
          this.renderHome();
        },
        onRefresh: () => {
          this.renderDeploy();
        },
      },
      {
        screenWidth: this.app.screen.width,
        screenHeight: this.app.screen.height,
      },
    );
    this.scenes.replaceAll(containerScene(container));
  }

  private resolveBattle(): void {
    const units = buildBattleUnits(this.state);
    if (units.filter((u) => u.faction === 'player').length === 0) {
      this.showToast('请至少部署 1 个单位');
      return;
    }
    const map = battleTerrain(this.state);
    const stage = currentStage(this.state);
    const report = runBattle(units, map, UNIT_DEFS, stage.aiDifficulty);
    this.state.lastReportWinner = report.winner;
    this.state.lastEventsLen = report.events.length;
    const container = createBattlePlaybackView(
      this.app,
      report,
      units,
      map,
      { screenWidth: this.app.screen.width, screenHeight: this.app.screen.height },
      {
        onComplete: () => this.finishBattleAfterPlayback(report),
        onHome: () => this.renderHome(),
        onReturnDeploy: () => {
          undoDeployForRetry(this.state);
          this.state.phase = 'deploy';
          this.renderDeploy();
        },
      },
      { stageIndex: this.state.stageIndex, gold: this.state.gold },
    );
    this.scenes.replaceAll(containerScene(container));
  }

  private finishBattleAfterPlayback(report: BattleReport): void {
    const win = report.winner === 'player';
    if (win) applyVictory(this.state);
    SaveManager.save(this.state);
    this.scenes.replaceAll(containerScene(this.buildResultPanel(win)));
  }

  private buildResultPanel(win: boolean): PIXI.Container {
    const W = this.app.screen.width;
    const H = this.app.screen.height;
    const c = new PIXI.Container();
    const mid = this.cx();

    c.addChild(createBackground(W, H));

    const bannerH = 60;
    const bannerY = H * 0.2;
    const banner = new PIXI.Graphics();
    banner.beginFill(win ? 0x5a7a40 : 0x8a3a3a, 0.92);
    banner.drawRect(0, bannerY, W, bannerH);
    banner.endFill();
    c.addChild(banner);

    const title = new PIXI.Text(win ? '胜  利' : '失  败', {
      fill: 0xffffff, fontSize: 26, fontWeight: 'bold',
    });
    title.anchor.set(0.5);
    title.x = mid;
    title.y = bannerY + bannerH / 2;
    c.addChild(title);

    const isLast = this.state.stageIndex >= STAGES_MVP.length - 1;
    const cardW = W - 40;
    const cardH = win ? 100 : 120;
    const cardY = bannerY + bannerH + 30;

    const cardBg = new PIXI.Graphics();
    cardBg.beginFill(0xfefef6, 0.95);
    cardBg.drawRoundedRect(0, 0, cardW, cardH, 12);
    cardBg.endFill();
    cardBg.x = 20;
    cardBg.y = cardY;
    c.addChild(cardBg);

    const subMsg = win
      ? `获得金币 +${currentStage(this.state).goldReward}\n当前金币: ${this.state.gold}`
      : '本关可重新布阵再试';
    const sub = new PIXI.Text(subMsg, {
      fill: 0x3a3a2a, fontSize: 14,
      wordWrap: true, wordWrapWidth: cardW - 32,
      lineHeight: 22,
    });
    sub.x = 36;
    sub.y = cardY + 16;
    c.addChild(sub);

    const btnLabel = !win ? '返回布阵' : isLast ? '完成 MVP' : '进入商店';
    const btnNext = makeButton(btnLabel, () => {
      if (!win) {
        undoDeployForRetry(this.state);
        this.state.phase = 'deploy';
        this.renderDeploy();
        return;
      }
      if (isLast) {
        this.state.phase = 'mvp_done';
        this.renderMvpDone();
      } else {
        this.state.phase = 'shop';
        this.renderShop();
      }
    }, {
      width: cardW,
      height: 44,
      fillColor: win ? 0x5a9e3a : 0xcc8833,
      fillAlpha: 0.9,
      borderColor: win ? 0x4a8e2a : 0xbb7722,
      textColor: 0xffffff,
      fontSize: 16,
    });
    btnNext.x = 20;
    btnNext.y = cardY + cardH + 16;
    c.addChild(btnNext);

    if (!win) {
      const btnRestart = makeButton('整局重来', () => {
        resetRun(this.state);
        this.renderDeploy();
      }, {
        width: cardW,
        height: 40,
        fillColor: 0x888888,
        fillAlpha: 0.2,
        borderColor: 0x999999,
        textColor: 0x666655,
        fontSize: 14,
      });
      btnRestart.x = 20;
      btnRestart.y = btnNext.y + 56;
      c.addChild(btnRestart);
    }

    return c;
  }

  private renderShop(): void {
    const offers = rollShop(this.state);
    const container = createShopView(
      this.state,
      offers,
      {
        onBuy: (offer: ShopOffer, ctx?: BuyShopContext) => {
          if (!buyShopOffer(this.state, offer, ctx)) {
            this.showToast('金币不足、已拥有该技能或商品无效');
            return;
          }
          advanceStage(this.state);
          SaveManager.save(this.state);
          this.renderDeploy();
        },
        onSkip: () => {
          advanceStage(this.state);
          SaveManager.save(this.state);
          this.renderDeploy();
        },
      },
      { screenWidth: this.app.screen.width, screenHeight: this.app.screen.height },
    );
    this.scenes.replaceAll(containerScene(container));
  }

  private renderMvpDone(): void {
    const W = this.app.screen.width;
    const H = this.app.screen.height;
    const c = new PIXI.Container();
    const mid = this.cx();

    c.addChild(createBackground(W, H));

    const bannerH = 60;
    const bannerY = H * 0.25;
    const banner = new PIXI.Graphics();
    banner.beginFill(0x5a7a40, 0.92);
    banner.drawRect(0, bannerY, W, bannerH);
    banner.endFill();
    c.addChild(banner);

    const t = new PIXI.Text('全部关卡完成！', {
      fill: 0xffffff, fontSize: 22, fontWeight: 'bold',
    });
    t.anchor.set(0.5);
    t.x = mid;
    t.y = bannerY + bannerH / 2;
    c.addChild(t);

    const b = makeButton('再玩一局', () => {
      resetRun(this.state);
      this.renderDeploy();
    }, {
      width: W - 40,
      height: 44,
      fillColor: 0x5a9e3a,
      fillAlpha: 0.9,
      borderColor: 0x4a8e2a,
      textColor: 0xffffff,
      fontSize: 16,
    });
    b.x = 20;
    b.y = bannerY + bannerH + 40;
    c.addChild(b);
    this.scenes.replaceAll(containerScene(c));
  }

  private showToast(msg: string): void {
    const current = this.scenes.current;
    if (!current) return;
    const t = new PIXI.Text(msg, { fill: 0xffcc66, fontSize: 14 });
    t.x = 16;
    t.y = 24;
    current.root.addChild(t);
    setTimeout(() => {
      if (!t.destroyed) current.root.removeChild(t);
      t.destroy();
    }, 1600);
  }
}
