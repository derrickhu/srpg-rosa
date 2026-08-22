import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  applyStageEdit,
  parseStageFile,
  stageIndexMap,
  type StageEdit,
} from '../stageSource';

/**
 * GM 地图编辑器的源码读写守卫。
 *
 * 这套测试守的是**数据不被工具毁掉**。编辑器写回的是 `stagesMvp.ts` 本身，
 * 而那个文件里的调参注释（「血 240→242，裸打胜率 37%→20%」这类）重来一次要跑几百局模拟。
 * 所以这里逐条钉住：能解析全部关卡、不改就一个字节都不动、改一格只动那一格、
 * 注释跟着锚点走、锚点没了要报出来而不是静默丢掉。
 */
describe('stagesMvp 源码读写', () => {
  const SOURCE_PATH = path.resolve(__dirname, '../../../../src/data/stagesMvp.ts');
  const source = fs.readFileSync(SOURCE_PATH, 'utf8');
  const parsed = parseStageFile(source);

  /** 从解析结果造一份「什么都没改」的编辑请求 */
  const identityEdit = (key: string): StageEdit => {
    const s = parsed.stages[key]!;
    return {
      key,
      width: s.terrain.width,
      height: s.terrain.height,
      grid: s.terrain.grid.map((row) => [...row]),
      enemies: s.enemies.map((e) => ({
        origIndex: e.index,
        defId: e.defId,
        x: e.x,
        y: e.y,
        template: e.template,
      })),
    };
  };

  it('解析出全部 29 关，且章节分组与 CHAPTERS 一致', () => {
    const keys = Object.keys(parsed.stages);
    expect(keys.length).toBe(29);
    expect(parsed.chapters.map((c) => c.length)).toEqual([4, 5, 6, 7, 7]);
    // CHAPTERS 里引用的每个常量都必须真的存在，否则编辑器会开出一个空白关卡
    for (const row of parsed.chapters) {
      for (const key of row) expect(parsed.stages[key], `${key} 未解析到`).toBeDefined();
    }
    const map = stageIndexMap(parsed.chapters);
    expect(map.c1_1).toEqual({ chapter: 1, indexInChapter: 1, globalIndex: 0 });
    // 第二章第一关的全局下标接在第一章 4 关之后
    expect(map.c2_1!.globalIndex).toBe(4);
  });

  it('每关都解析出矩形地形和至少一个敌人', () => {
    for (const [key, s] of Object.entries(parsed.stages)) {
      expect(s.terrain.grid.length, `${key} 行数`).toBe(s.terrain.height);
      for (const row of s.terrain.grid) expect(row.length, `${key} 列数`).toBe(s.terrain.width);
      expect(s.enemies.length, `${key} 没有敌人`).toBeGreaterThan(0);
    }
  });

  it('敌人的 x / y 偏移定位准确（照偏移取出来就是那两个数字）', () => {
    for (const [key, s] of Object.entries(parsed.stages)) {
      for (const e of s.enemies) {
        const xText = e.text.slice(e.xOffset.start, e.xOffset.end);
        const yText = e.text.slice(e.yOffset.start, e.yOffset.end);
        expect(Number(xText), `${key} 的 ${e.defId} x 偏移错位`).toBe(e.x);
        expect(Number(yText), `${key} 的 ${e.defId} y 偏移错位`).toBe(e.y);
      }
    }
  });

  it('模板 helper 被认了出来，没有整章退化成裸字面量', () => {
    // 认不出模板的后果是「新加敌人只能写裸字面量」，那样面板会和 UNIT_DEFS 走岔
    expect(parsed.stages.c1_1!.enemies.every((e) => e.template === 'rookie')).toBe(true);
    expect(parsed.stages.c2_1!.enemies.map((e) => e.template))
      .toEqual(['forest', 'forest', 'forest', 'forestYoung']);
    expect(parsed.stages.c3_1!.enemies.map((e) => e.template))
      .toEqual(['garrison', 'garrison', 'garrison', 'garrisonGreen']);
    // 第四、五章各有专属魔物之后也走模板了（以前这两章是裸字面量）
    expect(parsed.stages.c4_1!.enemies.every((e) => e.template === 'mire')).toBe(true);
    expect(parsed.stages.c5_1!.enemies.every((e) => e.template === 'drake')).toBe(true);
    // 裸字面量分支仍要有覆盖：Boss / 精英是手写对象（要挂 name / boss / skillSkin），
    // 认成 null 才对。杂兵全走模板之后，这是唯一还会走「形式三」的写法。
    expect(parsed.stages.c1_4!.enemies.map((e) => e.template))
      .toEqual([null, 'rookie', 'rookie']);
  });

  it('什么都没改时，输出与原文件逐字节相同', () => {
    // 这条是最重要的一条：编辑器打开再关上不该产生任何 diff，
    // 否则每次保存都会带一片无关改动，真正的改动就被埋了
    for (const key of Object.keys(parsed.stages)) {
      const out = applyStageEdit(source, identityEdit(key));
      expect(out.text, `${key} 空改写产生了 diff`).toBe(source);
      expect(out.changedFields, `${key} 空改写报了字段变更`).toEqual([]);
    }
  });

  it('挪动一个敌人只改那两个数字，helper 形式和 stats 覆盖都留着', () => {
    // c1_3（前哨围剿）的弓手是 `{ ...rookie('bow', 2, 1), stats: { maxHp: 55, atk: 20 } }`——
    // 摊平成裸字面量就等于把这条数值覆盖和模板的关系弄丢了
    const edit = identityEdit('c1_3');
    edit.enemies[1] = { ...edit.enemies[1]!, x: 3, y: 4 };
    const out = applyStageEdit(source, edit);
    expect(out.text).toContain("...rookie('bow', 3, 4)");
    expect(out.text).toContain('stats: { maxHp: 55, atk: 20 }');
    expect(out.changedFields).toEqual(['enemies']);
    // 地形没动，那一段必须一字未改
    const before = source.slice(parsed.stages.c1_3!.terrain.start, parsed.stages.c1_3!.terrain.end);
    expect(out.text).toContain(before);
  });

  it('改地形会重写格子表，行注释跟着它锚定的那一行走', () => {
    // c4_2（涸河林隘）的滩口林子上面有一条设计注释，锚在 y=4 那行
    const anchor = '// 浅滩在 x=3 / x=5，滩口的林子是守方的便宜——烧掉它能把盾位怪从掩体里赶出来';
    expect(source).toContain(anchor);
    const edit = identityEdit('c4_2');
    edit.grid[8]![0] = 'high';
    const out = applyStageEdit(source, edit);
    expect(out.changedFields).toContain('terrain');
    expect(out.text).toContain(anchor);
    expect(out.text).toContain("{ x: 0, y: 8, t: 'high' }");
    expect(out.droppedComments).toEqual([]);
  });

  it('注释的锚点被删掉时，会报出来而不是静默丢掉', () => {
    const edit = identityEdit('c4_2');
    // 把 y=4 整行（那条注释的锚）刷成平原
    for (let x = 0; x < edit.width; x += 1) edit.grid[4]![x] = 'plain';
    const out = applyStageEdit(source, edit);
    expect(out.droppedComments.some((c) => c.includes('浅滩在'))).toBe(true);
  });

  it('新加的敌人按同章模板生成，不是裸字面量', () => {
    const edit = identityEdit('c2_1');
    edit.enemies.push({ origIndex: null, defId: 'bow', x: 8, y: 1, template: 'forest' });
    const out = applyStageEdit(source, edit);
    expect(out.text).toContain("forest('bow', 8, 1)");
  });

  it('删敌人不会留下孤立的逗号或空行', () => {
    const edit = identityEdit('c4_1');
    edit.enemies.splice(1, 1);
    const out = applyStageEdit(source, edit);
    const re = parseStageFile(out.text).stages.c4_1!;
    expect(re.enemies).toHaveLength(2);
    expect(out.text).not.toContain(',,');
  });

  it('标量属性能改、能加、能删', () => {
    const edit = identityEdit('c1_1');
    edit.goldReward = 99;
    edit.aiDifficulty = 'hard';
    edit.maxDeploy = null;
    const out = applyStageEdit(source, edit);
    expect(out.text).toContain('goldReward: 99');
    expect(out.text).toContain("aiDifficulty: 'hard'");
    const re = parseStageFile(out.text).stages.c1_1!;
    expect(re.props.maxDeploy).toBeUndefined();
  });

  it('给原本没有这个属性的关卡补 isBoss 会插进对象里', () => {
    const edit = identityEdit('c1_1');
    edit.isBoss = true;
    const out = applyStageEdit(source, edit);
    const re = parseStageFile(out.text).stages.c1_1!;
    expect(re.props.isBoss).toBeDefined();
  });

  it('改一关不会碰到别的关卡', () => {
    const edit = identityEdit('c3_3');
    edit.grid[0]![0] = 'high';
    const out = applyStageEdit(source, edit);
    const after = parseStageFile(out.text);
    for (const key of Object.keys(parsed.stages)) {
      if (key === 'c3_3') continue;
      const a = parsed.stages[key]!;
      const b = after.stages[key]!;
      expect(b.terrain.grid, `${key} 被连带改了`).toEqual(a.terrain.grid);
      expect(b.enemies.map((e) => [e.defId, e.x, e.y]), `${key} 的敌人被连带改了`)
        .toEqual(a.enemies.map((e) => [e.defId, e.x, e.y]));
    }
  });
});
