import { describe, it, expect } from 'vitest';
import { CHAPTER_STAGE_INDICES, STAGES_MVP } from '@/data/stagesMvp';
import { DUNGEON_DEFS } from '@/data/dungeonCatalog';
import { isKnownTerrainId, isPassable } from '@/data/terrainSpec';
import { getSkillSpec } from '@/data/skillCatalog';
import { getEnemySkillSkin } from '@/data/enemySkillCatalog';
import { playerDeployRowRange } from '@/battle/constants';
import { gridSize } from '@/battle/grid';
import { hasAnimSet } from '@/view/animSets';

/**
 * 关卡数据是 40 关手写的字面量，而它的错误几乎全是**静默**的：
 * 敌人生在墙里就永远不动、生在玩家部署行就抢掉一个上阵位、地形 id 拼错只是
 * 悄悄退化成一格平原、`animSet` 拼错只是退回四兵种贴图加红 tint。
 * 这些都不报错、不崩，只在某个玩家某一关遇到，所以在这里一次性钉住。
 *
 * 每条断言的失败信息都带关卡名和坐标——40 关里定位到具体哪一格才有意义。
 */
describe('关卡数据完整性', () => {
  // `id` / `name` 现在都由 CHAPTERS 里的位置推出（见 stagesMvp 的 StageBlueprint），
  // 「id 等于下标 + 1」已成同义反复，测不动东西了，所以不再断言。
  // 真正还能错的是章节分组与副本表的对应，那条挪到下面「副本节点」里。

  it('关卡名带上了序号前缀', () => {
    // 推导写错（比如漏了前缀）会让冒险页每个节点都只显示光秃秃的标题
    STAGES_MVP.forEach((stage, i) => {
      expect(stage.name, `第 ${i + 1} 关的展示名少了序号前缀`).toContain(`第 ${i + 1} 关`);
    });
  });

  it('地形矩阵是矩形，且塞得下两行部署区', () => {
    for (const stage of STAGES_MVP) {
      const { w, h } = gridSize(stage.terrain);
      expect(w, `「${stage.name}」宽度过小`).toBeGreaterThanOrEqual(5);
      expect(h, `「${stage.name}」高度不足以容纳部署区 + 敌方区`).toBeGreaterThanOrEqual(6);
      for (const [y, row] of stage.terrain.entries()) {
        expect(row.length, `「${stage.name}」第 ${y} 行长度不齐`).toBe(w);
      }
    }
  });

  it('地形 id 全部已登记', () => {
    for (const stage of STAGES_MVP) {
      for (const [y, row] of stage.terrain.entries()) {
        for (const [x, t] of row.entries()) {
          expect(isKnownTerrainId(t), `「${stage.name}」(${x},${y}) 地形 id 不存在：${t}`).toBe(true);
        }
      }
    }
  });

  it('每关都有敌人', () => {
    for (const stage of STAGES_MVP) {
      expect(stage.enemies.length, `「${stage.name}」没有敌人，会开局即胜`).toBeGreaterThan(0);
    }
  });

  it('敌人坐标在界内', () => {
    for (const stage of STAGES_MVP) {
      const { w, h } = gridSize(stage.terrain);
      for (const e of stage.enemies) {
        const at = `「${stage.name}」的 ${e.name ?? e.defId} (${e.x},${e.y})`;
        expect(e.x >= 0 && e.x < w, `${at} 横坐标越界`).toBe(true);
        expect(e.y >= 0 && e.y < h, `${at} 纵坐标越界`).toBe(true);
      }
    }
  });

  it('敌人站在可通行地形上', () => {
    // 站在城墙/深渊里的敌人寻路出不来也走不动，只能等玩家凑到射程内
    for (const stage of STAGES_MVP) {
      for (const e of stage.enemies) {
        const t = stage.terrain[e.y]?.[e.x];
        if (!t) continue;
        expect(
          isPassable(t),
          `「${stage.name}」的 ${e.name ?? e.defId} 生在不可通行的${t} (${e.x},${e.y})`,
        ).toBe(true);
      }
    }
  });

  it('敌人不占用玩家部署行', () => {
    // 部署行被占会静默减少可上阵人数，玩家只会觉得「这关怎么少一个位置」
    for (const stage of STAGES_MVP) {
      const { h } = gridSize(stage.terrain);
      const [top, bottom] = playerDeployRowRange(h);
      for (const e of stage.enemies) {
        expect(
          e.y >= top && e.y <= bottom,
          `「${stage.name}」的 ${e.name ?? e.defId} 生在玩家部署行 y=${e.y}`,
        ).toBe(false);
      }
    }
  });

  it('同一关内敌人 uid 唯一、且不叠格', () => {
    for (const stage of STAGES_MVP) {
      const uids = new Set<string>();
      const cells = new Set<string>();
      for (const e of stage.enemies) {
        expect(uids.has(e.uid), `「${stage.name}」uid 重复：${e.uid}`).toBe(false);
        uids.add(e.uid);
        const k = `${e.x},${e.y}`;
        expect(cells.has(k), `「${stage.name}」两个敌人叠在 (${k})`).toBe(false);
        cells.add(k);
      }
    }
  });

  it('敌人的 animSet 都已注册', () => {
    // 拼错只会退回四兵种贴图 + 红 tint，看起来像「这只怪还没做美术」而不是像 bug
    for (const stage of STAGES_MVP) {
      for (const e of stage.enemies) {
        if (!e.animSet) continue;
        expect(
          hasAnimSet(e.animSet),
          `「${stage.name}」的 ${e.name ?? e.defId} animSet 未注册：${e.animSet}`,
        ).toBe(true);
      }
    }
  });

  it('敌人挂的技能皮肤 / 技能 id 都存在', () => {
    for (const stage of STAGES_MVP) {
      for (const e of stage.enemies) {
        const who = `「${stage.name}」的 ${e.name ?? e.defId}`;
        if (e.skillSkin) {
          expect(getEnemySkillSkin(e.skillSkin), `${who} 技能皮肤不存在：${e.skillSkin}`)
            .toBeDefined();
        }
        if (e.skillId) {
          expect(getSkillSpec(e.skillId), `${who} 技能 id 不存在：${e.skillId}`).toBeDefined();
        }
      }
    }
  });

  it('maxDeploy 不超过部署行的可站格数', () => {
    for (const stage of STAGES_MVP) {
      if (stage.maxDeploy === undefined) continue;
      const { w, h } = gridSize(stage.terrain);
      const [top, bottom] = playerDeployRowRange(h);
      let room = 0;
      for (let y = top; y <= bottom; y++) {
        for (let x = 0; x < w; x++) {
          const t = stage.terrain[y]?.[x];
          if (t && isPassable(t)) room += 1;
        }
      }
      expect(stage.maxDeploy, `「${stage.name}」maxDeploy 必须为正`).toBeGreaterThan(0);
      expect(stage.maxDeploy, `「${stage.name}」maxDeploy ${stage.maxDeploy} 超过部署区 ${room} 格`)
        .toBeLessThanOrEqual(room);
    }
  });
});

describe('副本节点与关卡的对应关系', () => {
  /**
   * 章节表（`stagesMvp.CHAPTERS`）和副本表（`DUNGEON_DEFS`）是两份手写清单，
   * 靠位置一一对应。写了一章的关卡却忘了配副本，那一章就是玩不到的死数据；
   * 反过来则会让副本去取不存在的章节。
   */
  it('章节数与副本数一致', () => {
    expect(CHAPTER_STAGE_INDICES.length, '章节表与副本表的章数不一致').toBe(DUNGEON_DEFS.length);
  });

  it('第 n 章的关卡正好被第 n 个副本引用', () => {
    // 顺序错位不会报错，只会表现成「密林深处里打的是要塞的关卡」
    DUNGEON_DEFS.forEach((d, ci) => {
      const used = d.nodes.flatMap((n) => (n.stageIndex === undefined ? [] : [n.stageIndex]));
      expect(used, `${d.id} 引用的关卡与第 ${ci + 1} 章不符`).toEqual([...CHAPTER_STAGE_INDICES[ci]!]);
    });
  });

  it('每个关卡被恰好一个副本节点引用', () => {
    // 漏引用 = 写好的关卡玩不到；重复引用 = 同一关在两章里出现，通关记录还会互相干扰
    const refs = new Map<number, string[]>();
    for (const d of DUNGEON_DEFS) {
      for (const n of d.nodes) {
        if (n.stageIndex === undefined) continue;
        refs.set(n.stageIndex, [...(refs.get(n.stageIndex) ?? []), `${d.id}/${n.name}`]);
      }
    }
    STAGES_MVP.forEach((stage, i) => {
      const owners = refs.get(i) ?? [];
      expect(owners, `「${stage.name}」(stageIndex ${i}) 被 ${owners.length} 个节点引用`)
        .toHaveLength(1);
    });
  });

  it('战斗节点的 stageIndex 都指向真实关卡', () => {
    for (const d of DUNGEON_DEFS) {
      for (const n of d.nodes) {
        if (n.kind === 'shop') {
          expect(n.stageIndex, `${d.id} 的商店节点不该带 stageIndex`).toBeUndefined();
          continue;
        }
        expect(
          STAGES_MVP[n.stageIndex ?? -1],
          `${d.id}/${n.name} 的 stageIndex ${n.stageIndex} 越界`,
        ).toBeDefined();
      }
    }
  });

  /**
   * 解锁链断一环的表现是「有一章永远进不去」——副本页上它就是一直锁着，
   * 而数据看起来完全正常。加新章时最容易漏的就是把上一章接到它前面。
   */
  it('每个副本都能从默认解锁的副本走到', () => {
    const byId = new Map(DUNGEON_DEFS.map((d) => [d.id, d]));
    const reachable = new Set(
      DUNGEON_DEFS.filter((d) => d.unlock.kind === 'default').map((d) => d.id),
    );
    expect(reachable.size, '没有任何默认解锁的副本，新玩家无处可去').toBeGreaterThan(0);

    // 反复扫描直到不再有新副本被解锁（章数很少，不值得建图跑拓扑排序）
    for (let pass = 0; pass < DUNGEON_DEFS.length; pass++) {
      for (const d of DUNGEON_DEFS) {
        if (d.unlock.kind !== 'clearDungeon') continue;
        expect(byId.get(d.unlock.dungeonId), `${d.id} 的前置副本不存在：${d.unlock.dungeonId}`)
          .toBeDefined();
        if (reachable.has(d.unlock.dungeonId)) reachable.add(d.id);
      }
    }

    for (const d of DUNGEON_DEFS) {
      expect(reachable.has(d.id), `${d.id}（${d.name}）解锁链断开，玩家永远进不去`).toBe(true);
    }
  });

  it('每章最后一个战斗节点是 Boss 节点', () => {
    for (const d of DUNGEON_DEFS) {
      const battles = d.nodes.filter((n) => n.kind !== 'shop');
      expect(battles.length, `${d.id} 没有战斗节点`).toBeGreaterThan(0);
      expect(battles[battles.length - 1]!.kind, `${d.id} 最后一战不是 boss`).toBe('boss');
      const bosses = battles.filter((n) => n.kind === 'boss');
      expect(bosses, `${d.id} 有多个 boss 节点`).toHaveLength(1);
    }
  });
});
