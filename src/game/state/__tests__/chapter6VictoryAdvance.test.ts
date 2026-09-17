import { describe, expect, it } from 'vitest';
import { getDungeonDef } from '@/data/dungeonCatalog';
import { CHARACTER_DEFS } from '@/data/characterCatalog';
import { describeShopOfferLines } from '@/data/itemText';
import { instantiateCharacter } from '@/game/characterFactory';
import { playerDeployRowRange } from '@/battle/constants';
import { gridSize } from '@/battle/grid';
import {
  advanceNode,
  applyVictory,
  claimLoot,
  startRun,
} from '../ProgressManager';
import { rollShop } from '../ShopManager';
import {
  createInitialState,
  currentNode,
  currentStage,
  partyCharacters,
  type MvpGameState,
} from '../GameState';

const DUNGEON = 'dungeon_bloodfang';

function bloodfangAtNode(nodeIndex: number): MvpGameState {
  const s = createInitialState();
  s.meta.roster = CHARACTER_DEFS.slice(0, 3).map(instantiateCharacter);
  startRun(s, DUNGEON, s.meta.roster.map((m) => m.rosterId));
  s.run!.nodeIndex = nodeIndex;
  const { h } = gridSize(currentStage(s).terrain);
  const [row] = playerDeployRowRange(h);
  s.run!.placements = partyCharacters(s).map((m, i) => ({
    uid: `p${i}`,
    rosterId: m.rosterId,
    pos: { x: i, y: row },
  }));
  return s;
}

describe('第六章中途胜利后能离开战场', () => {
  it('5/8 枯骨回廊下一格是补给点', () => {
    const d = getDungeonDef(DUNGEON)!;
    expect(d.nodes).toHaveLength(8);
    expect(d.nodes[4]!.kind).toBe('battle');
    expect(d.nodes[5]!.kind).toBe('shop');
  });

  it('打赢 5/8 并领取三选一后，推进到补给点且货架能开', () => {
    const s = bloodfangAtNode(4);
    expect(currentNode(s).kind).toBe('battle');
    applyVictory(s);
    const loot = s.run!.pendingLoot;
    expect(loot?.length).toBe(3);
    expect(claimLoot(s, loot![0]!)).toBe(true);
    advanceNode(s);
    expect(currentNode(s).kind).toBe('shop');
    const offers = rollShop(s);
    expect(offers.length).toBeGreaterThan(0);
    expect(offers.length).toBeLessThanOrEqual(3);
    for (const o of offers) {
      expect(describeShopOfferLines(o).length).toBeGreaterThan(0);
    }
  });
});
