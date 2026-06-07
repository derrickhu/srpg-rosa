import type { TerrainId, UnitKind, Vec2 } from '@/battle/types';
import type { StageDefMvp } from '@/data/stagesMvp';
import { STAGES_MVP } from '@/data/stagesMvp';
import { mergeTerrainOverlay, type TerrainGrid } from '@/battle/grid';
import { createStarterRoster, resetRosterIdCounter } from '@/game/mercenaryFactory';
import type { Mercenary } from '@/game/mercenaryTypes';

export type GamePhase = 'deploy' | 'battle' | 'result' | 'shop' | 'mvp_done';

export type ShopOffer =
  | { type: 'recruit'; catalogId: string; price: number }
  | {
      type: 'skillBind';
      profession: UnitKind | null;
      skillId: string;
      name: string;
      price: number;
    }
  | { type: 'terrain'; packId: string; charges: number; name: string; price: number }
  | { type: 'potion'; potionId: string; name: string; price: number }
  | { type: 'statPotion'; statPotionId: string; name: string; price: number };

export interface StatBonus {
  atk: number;
  spd: number;
  move: number;
}

export const ZERO_STAT: StatBonus = { atk: 0, spd: 0, move: 0 };

export function addStatBonus(a: StatBonus | undefined, b: StatBonus): StatBonus {
  const x = a ?? { ...ZERO_STAT };
  return { atk: x.atk + b.atk, spd: x.spd + b.spd, move: x.move + b.move };
}

export interface PlacementEntry {
  uid: string;
  rosterId: string;
  pos: Vec2;
  potionId?: string;
  statBonus?: StatBonus;
}

export interface TerrainOverlayCell {
  x: number;
  y: number;
  terrain: TerrainId;
}

export interface MvpGameState {
  phase: GamePhase;
  stageIndex: number;
  gold: number;
  roster: Mercenary[];
  placements: PlacementEntry[];
  lastReportWinner: 'player' | 'enemy' | null;
  lastEventsLen: number;
  terrainCharges: number;
  terrainOverlay: TerrainOverlayCell[];
  potions: Record<string, number>;
  statPotions: Record<string, number>;
  offFieldStatByRosterId: Record<string, StatBonus>;
  /** 当前关卡看广告额外解锁的上阵位数（每局重置） */
  adExtraSlot: number;
}

export type BuyShopContext = {
  skillBindTargetRosterId?: string;
};

let pid = 0;
export function nextPid(): string {
  pid += 1;
  return `p_${pid}`;
}
export function resetPid(): void {
  pid = 0;
}

export function createInitialState(): MvpGameState {
  resetPid();
  resetRosterIdCounter();
  return {
    phase: 'deploy',
    stageIndex: 0,
    gold: 0,
    roster: createStarterRoster(),
    placements: [],
    lastReportWinner: null,
    lastEventsLen: 0,
    terrainCharges: 0,
    terrainOverlay: [],
    potions: {},
    statPotions: {},
    offFieldStatByRosterId: {},
    adExtraSlot: 0,
  };
}

export function getMercenary(state: MvpGameState, rosterId: string): Mercenary | undefined {
  return state.roster.find((m) => m.rosterId === rosterId);
}

export function benchMercenaries(state: MvpGameState): Mercenary[] {
  const on = new Set(state.placements.map((p) => p.rosterId));
  return state.roster.filter((m) => !on.has(m.rosterId));
}

export function currentStage(state: MvpGameState): StageDefMvp {
  return STAGES_MVP[state.stageIndex]!;
}

export function battleTerrain(state: MvpGameState): TerrainGrid {
  return mergeTerrainOverlay(currentStage(state).terrain, state.terrainOverlay);
}

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}
