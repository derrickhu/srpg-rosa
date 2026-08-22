import ts from 'typescript';

/**
 * `stagesMvp.ts` 的源码级读写。
 *
 * ## 为什么不走「导出 JSON、编辑、再生成整个文件」
 *
 * 那个文件里最值钱的东西不是数字，是数字旁边的**注释**——「血 240→242 只差 2 点，
 * 裸打胜率却从 37% 掉到 20%」这类实测结论重来一次要跑几百局模拟。整文件重生成会把
 * 它们全部抹掉，而且抹掉不报错，只是下一个人（或下一次的我）在同一个坑里重走一遍。
 *
 * 所以这里做的是**外科手术式改写**：解析出每个字段在源文件里的字节范围，只替换真正
 * 改动的那几段，其余字节原样保留。更进一步：
 *
 * - 敌人元素**原样复用源码文本**，只把里面的 x / y 两个数字换掉。于是
 *   `{ ...rookie('bow', 2, 1), stats: { maxHp: 55, atk: 20 } }` 拖动后仍是这个形状，
 *   `rookie` / `forest` / `garrison` 这些模板 helper 不会被摊平成裸字面量
 *   （摊平的代价是敌人面板从此和 `UNIT_DEFS` 走岔，而走岔只表现为「这只怪好像有点软」）。
 * - 注释按「它原本贴着谁」锚定：敌人的前导注释跟着那个敌人走，地形格的注释锚到它所在的行。
 *   锚点还在就照原样写回去，锚点被删了就在保存结果里报出来，而不是静默丢掉。
 *
 * ## 安全网
 *
 * `applyStageEdit` 生成新文本后会**重新解析一遍并比对模型**（见 `verifyRoundTrip`）。
 * 对不上就直接抛错、不落盘——宁可保存失败，也不要写出一个语法正确但内容错位的关卡表。
 */

/** 关卡蓝图常量名，如 `c1_1` */
const STAGE_KEY_RE = /^c\d+_\d+$/;

/**
 * 敌人模板 helper：`rookie('sword', 2, 1)` 这种 (defId, x, y) 三参形式。
 *
 * **每章新增一套敌人模板就要在这里加一行**（`stagesMvp.ts` 里的 `CHAPTER*` 那批 helper）。
 * 白名单是故意的：不认识的写法直接抛，而不是猜。漏加的表现是 GM 工具整个打不开、
 * 报「无法识别的敌人写法」——响亮的失败，比猜错以后静默写出错位的关卡表好得多。
 */
const ENEMY_TEMPLATES = [
  'rookie',
  'forest',
  'forestYoung',
  'garrison',
  'garrisonGreen',
  'mire',
  'mireYoung',
  'drake',
  'drakeYoung',
] as const;

export type EnemyTemplate = (typeof ENEMY_TEMPLATES)[number];

export interface SourceRange {
  start: number;
  end: number;
}

export interface ParsedEnemy extends SourceRange {
  /** 在 `enemies` 数组里的下标，编辑器用它作稳定 id */
  index: number;
  defId: string;
  x: number;
  y: number;
  /** 元素源码原文（不含前导注释） */
  text: string;
  /** 前导注释（已去掉缩进的多行原文），没有则为空串 */
  leadingComments: string[];
  /** x / y 数字字面量在 `text` 内的相对范围，拖动时只改这两处 */
  xOffset: SourceRange;
  yOffset: SourceRange;
  /** 用了哪个模板 helper；裸字面量为 null */
  template: EnemyTemplate | null;
}

export interface ParsedTerrain extends SourceRange {
  width: number;
  height: number;
  /** `grid[y][x]` = TerrainId 字符串 */
  grid: string[][];
  /** 行注释锚定：y → 该行前面原本那几条注释 */
  rowComments: Record<number, string[]>;
}

export interface ParsedProp extends SourceRange {
  /** 值表达式的范围（替换值时用） */
  value: SourceRange;
  /** 整条属性 + 尾随逗号的范围（删除属性时用） */
  whole: SourceRange;
}

export interface ParsedStage {
  key: string;
  /** blueprint 对象字面量 `{ ... }` 的范围 */
  object: SourceRange;
  props: Record<string, ParsedProp>;
  terrain: ParsedTerrain;
  enemies: ParsedEnemy[];
  /** `enemies` 数组字面量的范围 */
  enemiesArray: SourceRange;
}

export interface ParsedStageFile {
  stages: Record<string, ParsedStage>;
  /** `CHAPTERS` 里的分组：chapters[章下标] = ['c1_1', ...] */
  chapters: string[][];
}

// ─────────────────────────── 解析 ───────────────────────────

function createSource(text: string): ts.SourceFile {
  return ts.createSourceFile('stagesMvp.ts', text, ts.ScriptTarget.Latest, true);
}

/** 取节点前面那几条注释的原文（每条一行，已去掉行首缩进） */
function leadingCommentsOf(text: string, node: ts.Node): string[] {
  const ranges = ts.getLeadingCommentRanges(text, node.getFullStart()) ?? [];
  return ranges.map((r) => text.slice(r.pos, r.end).trim());
}

function numberOf(node: ts.Node): number {
  if (ts.isNumericLiteral(node)) return Number(node.text);
  if (ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.MinusToken) {
    return -numberOf(node.operand);
  }
  throw new Error(`不是数字字面量：${node.getText()}`);
}

function stringOf(node: ts.Node): string {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  throw new Error(`不是字符串字面量：${node.getText()}`);
}

function boolOf(node: ts.Node): boolean {
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
  throw new Error(`不是布尔字面量：${node.getText()}`);
}

interface TerrainAccum {
  width: number;
  height: number;
  grid: string[][];
  rowComments: Record<number, string[]>;
}

/**
 * 求值 `withCells(withHighCells(emptyTerrain(9, 10), [...]), [...])` 这一族表达式。
 *
 * 只支持这三个 helper——它们是这份数据里唯一出现过的形式。碰到别的写法直接抛，
 * 而不是猜：猜错的表现是编辑器显示的地图和游戏里跑的地图不一样，那比打不开更糟。
 */
function evalTerrain(text: string, node: ts.Node, acc?: TerrainAccum): TerrainAccum {
  if (!ts.isCallExpression(node) || !ts.isIdentifier(node.expression)) {
    throw new Error(`terrain 不是可识别的 helper 调用：${node.getText().slice(0, 60)}`);
  }
  const fn = node.expression.text;

  if (fn === 'emptyTerrain') {
    const width = numberOf(node.arguments[0]!);
    const height = numberOf(node.arguments[1]!);
    return {
      width,
      height,
      grid: Array.from({ length: height }, () => Array.from({ length: width }, () => 'plain')),
      rowComments: {},
    };
  }

  if (fn === 'withCells' || fn === 'withHighCells') {
    const base = evalTerrain(text, node.arguments[0]!, acc);
    const arr = node.arguments[1]!;
    if (!ts.isArrayLiteralExpression(arr)) throw new Error(`${fn} 的第二个参数不是数组字面量`);
    for (const el of arr.elements) {
      if (!ts.isObjectLiteralExpression(el)) throw new Error(`${fn} 的格子不是对象字面量`);
      let x: number | undefined;
      let y: number | undefined;
      let t = fn === 'withHighCells' ? 'high' : undefined;
      for (const p of el.properties) {
        if (!ts.isPropertyAssignment(p) || !ts.isIdentifier(p.name)) continue;
        if (p.name.text === 'x') x = numberOf(p.initializer);
        else if (p.name.text === 'y') y = numberOf(p.initializer);
        else if (p.name.text === 't') t = stringOf(p.initializer);
      }
      if (x === undefined || y === undefined || t === undefined) {
        throw new Error(`${fn} 的格子缺 x / y / t：${el.getText()}`);
      }
      if (base.grid[y]?.[x] !== undefined) base.grid[y]![x] = t;
      const comments = leadingCommentsOf(text, el);
      if (comments.length > 0) {
        base.rowComments[y] = [...(base.rowComments[y] ?? []), ...comments];
      }
    }
    return base;
  }

  throw new Error(`terrain 用了未支持的 helper：${fn}`);
}

/** 在敌人元素里定位 x / y 两个数字字面量，并识别它用的模板 helper */
function locateEnemyCoords(node: ts.Expression): {
  defId: string;
  x: ts.Node;
  y: ts.Node;
  template: EnemyTemplate | null;
} {
  // 形式一：rookie('sword', 2, 1)
  if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
    const fn = node.expression.text as EnemyTemplate;
    if ((ENEMY_TEMPLATES as readonly string[]).includes(fn)) {
      return {
        defId: stringOf(node.arguments[0]!),
        x: node.arguments[1]!,
        y: node.arguments[2]!,
        template: fn,
      };
    }
  }

  if (ts.isObjectLiteralExpression(node)) {
    // 形式二：{ ...rookie('bow', 2, 1), stats: { ... } }
    for (const p of node.properties) {
      if (ts.isSpreadAssignment(p)) return locateEnemyCoords(p.expression);
    }
    // 形式三：{ defId: 'cavalry', x: 4, y: 1, uid: euid() }
    let defId: string | undefined;
    let x: ts.Node | undefined;
    let y: ts.Node | undefined;
    for (const p of node.properties) {
      if (!ts.isPropertyAssignment(p) || !ts.isIdentifier(p.name)) continue;
      if (p.name.text === 'defId') defId = stringOf(p.initializer);
      else if (p.name.text === 'x') x = p.initializer;
      else if (p.name.text === 'y') y = p.initializer;
    }
    if (defId && x && y) return { defId, x, y, template: null };
  }

  throw new Error(`无法识别的敌人写法：${node.getText().slice(0, 80)}`);
}

function parseStage(text: string, sf: ts.SourceFile, decl: ts.VariableDeclaration): ParsedStage {
  const key = (decl.name as ts.Identifier).text;
  const obj = decl.initializer;
  if (!obj || !ts.isObjectLiteralExpression(obj)) {
    throw new Error(`${key} 的初始值不是对象字面量`);
  }

  const props: Record<string, ParsedProp> = {};
  let terrain: ParsedTerrain | undefined;
  let enemies: ParsedEnemy[] | undefined;
  let enemiesArray: SourceRange | undefined;

  for (const p of obj.properties) {
    if (!ts.isPropertyAssignment(p) || !ts.isIdentifier(p.name)) continue;
    const name = p.name.text;
    // 尾随逗号也算进「整条属性」，否则删掉属性会留下一个孤立的逗号
    const afterEnd = p.getEnd();
    const comma = text[afterEnd] === ',' ? afterEnd + 1 : afterEnd;
    props[name] = {
      start: p.getStart(sf),
      end: afterEnd,
      value: { start: p.initializer.getStart(sf), end: p.initializer.getEnd() },
      whole: { start: p.getStart(sf), end: comma },
    };

    if (name === 'terrain') {
      const acc = evalTerrain(text, p.initializer);
      terrain = {
        start: p.initializer.getStart(sf),
        end: p.initializer.getEnd(),
        width: acc.width,
        height: acc.height,
        grid: acc.grid,
        rowComments: acc.rowComments,
      };
    } else if (name === 'enemies') {
      const arr = p.initializer;
      if (!ts.isArrayLiteralExpression(arr)) throw new Error(`${key} 的 enemies 不是数组字面量`);
      enemiesArray = { start: arr.getStart(sf), end: arr.getEnd() };
      enemies = arr.elements.map((el, index) => {
        const { defId, x, y, template } = locateEnemyCoords(el);
        const start = el.getStart(sf);
        const end = el.getEnd();
        return {
          index,
          defId,
          x: numberOf(x),
          y: numberOf(y),
          start,
          end,
          text: text.slice(start, end),
          leadingComments: leadingCommentsOf(text, el),
          xOffset: { start: x.getStart(sf) - start, end: x.getEnd() - start },
          yOffset: { start: y.getStart(sf) - start, end: y.getEnd() - start },
          template,
        };
      });
    }
  }

  if (!terrain) throw new Error(`${key} 没有 terrain`);
  if (!enemies || !enemiesArray) throw new Error(`${key} 没有 enemies`);

  return {
    key,
    object: { start: obj.getStart(sf), end: obj.getEnd() },
    props,
    terrain,
    enemies,
    enemiesArray,
  };
}

/** 解析 `CHAPTERS` 那张二维表，拿到章节分组（关卡序号的唯一来源） */
function parseChapters(sf: ts.SourceFile): string[][] {
  for (const stmt of sf.statements) {
    if (!ts.isVariableStatement(stmt)) continue;
    for (const d of stmt.declarationList.declarations) {
      if (!ts.isIdentifier(d.name) || d.name.text !== 'CHAPTERS') continue;
      const init = d.initializer;
      if (!init || !ts.isArrayLiteralExpression(init)) continue;
      return init.elements.map((row) => {
        if (!ts.isArrayLiteralExpression(row)) throw new Error('CHAPTERS 的元素不是数组');
        return row.elements.map((e) => {
          if (!ts.isIdentifier(e)) throw new Error('CHAPTERS 里出现了非标识符');
          return e.text;
        });
      });
    }
  }
  throw new Error('没有找到 CHAPTERS');
}

export function parseStageFile(text: string): ParsedStageFile {
  const sf = createSource(text);
  const stages: Record<string, ParsedStage> = {};
  for (const stmt of sf.statements) {
    if (!ts.isVariableStatement(stmt)) continue;
    for (const d of stmt.declarationList.declarations) {
      if (!ts.isIdentifier(d.name) || !STAGE_KEY_RE.test(d.name.text)) continue;
      stages[d.name.text] = parseStage(text, sf, d);
    }
  }
  return { stages, chapters: parseChapters(sf) };
}

// ─────────────────────────── 序列化 ───────────────────────────

export interface EditedEnemy {
  /** 原下标；新加的敌人为 null */
  origIndex: number | null;
  defId: string;
  x: number;
  y: number;
  /** 新加敌人时照哪个模板生成；null = 裸字面量 */
  template?: EnemyTemplate | null;
}

export interface StageEdit {
  key: string;
  title?: string;
  goldReward?: number;
  /** null 表示删掉这个可选属性 */
  aiDifficulty?: string | null;
  maxDeploy?: number | null;
  isBoss?: boolean | null;
  width: number;
  height: number;
  grid: string[][];
  enemies: EditedEnemy[];
}

export interface ApplyResult {
  text: string;
  /** 锚点被删掉、写不回去的注释，交给调用方提醒用户 */
  droppedComments: string[];
  /** 这次实际改了哪几个字段，用于给出可读的保存结果 */
  changedFields: string[];
}

const PROP_INDENT = '  ';
const ITEM_INDENT = '    ';

function terrainText(edit: StageEdit, rowComments: Record<number, string[]>): {
  text: string;
  used: Set<string>;
} {
  const byRow = new Map<number, string[]>();
  for (let y = 0; y < edit.height; y += 1) {
    for (let x = 0; x < edit.width; x += 1) {
      const t = edit.grid[y]?.[x] ?? 'plain';
      if (t === 'plain') continue;
      const list = byRow.get(y) ?? [];
      list.push(`{ x: ${x}, y: ${y}, t: '${t}' }`);
      byRow.set(y, list);
    }
  }

  const base = `emptyTerrain(${edit.width}, ${edit.height})`;
  if (byRow.size === 0) return { text: base, used: new Set() };

  const used = new Set<string>();
  const lines: string[] = [];
  for (const y of [...byRow.keys()].sort((a, b) => a - b)) {
    for (const c of rowComments[y] ?? []) {
      lines.push(`${ITEM_INDENT}${c}`);
      used.add(c);
    }
    lines.push(`${ITEM_INDENT}${byRow.get(y)!.join(', ')},`);
  }
  return {
    text: `withCells(${base}, [\n${lines.join('\n')}\n${PROP_INDENT}])`,
    used,
  };
}

function enemyItemText(e: EditedEnemy, parsed: ParsedEnemy | undefined): string {
  if (parsed) {
    // 原样复用源码，只把 x / y 两个数字换掉——helper 形式、stats 覆盖、技能皮肤全部原封不动。
    // 先改后面那个偏移，否则前一处替换会把后一处的偏移顶歪。
    const [first, second] =
      parsed.xOffset.start < parsed.yOffset.start
        ? ([{ r: parsed.xOffset, v: e.x }, { r: parsed.yOffset, v: e.y }] as const)
        : ([{ r: parsed.yOffset, v: e.y }, { r: parsed.xOffset, v: e.x }] as const);
    let t = parsed.text;
    t = t.slice(0, second.r.start) + String(second.v) + t.slice(second.r.end);
    t = t.slice(0, first.r.start) + String(first.v) + t.slice(first.r.end);
    return t;
  }
  if (e.template) return `${e.template}('${e.defId}', ${e.x}, ${e.y})`;
  return `{ defId: '${e.defId}', x: ${e.x}, y: ${e.y}, uid: euid() }`;
}

function enemiesText(edit: StageEdit, parsed: ParsedStage): { text: string; used: Set<string> } {
  const used = new Set<string>();
  const lines: string[] = [];
  for (const e of edit.enemies) {
    const src = e.origIndex === null ? undefined : parsed.enemies[e.origIndex];
    for (const c of src?.leadingComments ?? []) {
      lines.push(`${ITEM_INDENT}${c}`);
      used.add(c);
    }
    // 多行元素（带 stats 的字面量）整块缩进跟着走，否则第二行会贴到行首
    const body = enemyItemText(e, src).split('\n').join(`\n`);
    lines.push(`${ITEM_INDENT}${body},`);
  }
  return { text: `[\n${lines.join('\n')}\n${PROP_INDENT}]`, used };
}

function sameGrid(a: string[][], b: string[][]): boolean {
  if (a.length !== b.length) return false;
  return a.every((row, y) => row.length === b[y]!.length && row.every((t, x) => t === b[y]![x]));
}

function sameEnemies(edit: StageEdit, parsed: ParsedStage): boolean {
  if (edit.enemies.length !== parsed.enemies.length) return false;
  return edit.enemies.every((e, i) => {
    const p = parsed.enemies[i];
    return !!p && e.origIndex === i && e.x === p.x && e.y === p.y && e.defId === p.defId;
  });
}

function literal(v: string | number | boolean): string {
  return typeof v === 'string' ? `'${v}'` : String(v);
}

/** 把若干「替换某段字节」的编辑倒序应用，避免前面的替换顶歪后面的偏移 */
function splice(text: string, edits: { start: number; end: number; text: string }[]): string {
  let out = text;
  for (const e of [...edits].sort((a, b) => b.start - a.start)) {
    out = out.slice(0, e.start) + e.text + out.slice(e.end);
  }
  return out;
}

export function applyStageEdit(source: string, edit: StageEdit): ApplyResult {
  const parsedFile = parseStageFile(source);
  const stage = parsedFile.stages[edit.key];
  if (!stage) throw new Error(`没有找到关卡 ${edit.key}`);

  const edits: { start: number; end: number; text: string }[] = [];
  const changedFields: string[] = [];
  const usedComments = new Set<string>();

  // ── 地形：只有真的变了才重写。没变就别动，那样 `withHighCells` 之类的原写法能留着 ──
  const gridChanged =
    edit.width !== stage.terrain.width ||
    edit.height !== stage.terrain.height ||
    !sameGrid(edit.grid, stage.terrain.grid);
  if (gridChanged) {
    const t = terrainText(edit, stage.terrain.rowComments);
    for (const c of t.used) usedComments.add(c);
    edits.push({ ...stage.terrain, text: t.text });
    changedFields.push('terrain');
  } else {
    for (const list of Object.values(stage.terrain.rowComments)) {
      for (const c of list) usedComments.add(c);
    }
  }

  // ── 敌人 ──
  if (!sameEnemies(edit, stage)) {
    const t = enemiesText(edit, stage);
    for (const c of t.used) usedComments.add(c);
    edits.push({ ...stage.enemiesArray, text: t.text });
    changedFields.push('enemies');
  } else {
    for (const e of stage.enemies) for (const c of e.leadingComments) usedComments.add(c);
  }

  // ── 标量属性 ──
  const scalars: [string, string | number | boolean | null | undefined][] = [
    ['title', edit.title],
    ['goldReward', edit.goldReward],
    ['aiDifficulty', edit.aiDifficulty],
    ['maxDeploy', edit.maxDeploy],
    ['isBoss', edit.isBoss],
  ];
  // 插入新属性统一放到 `}` 前一行，一次保存可能插好几条，倒序算偏移会互相打架，
  // 所以先攒起来最后一起拼
  const inserts: string[] = [];
  for (const [name, value] of scalars) {
    if (value === undefined) continue;
    const prop = stage.props[name];
    if (value === null) {
      if (prop) {
        edits.push({ start: prop.whole.start, end: prop.whole.end, text: '' });
        changedFields.push(`-${name}`);
      }
      continue;
    }
    if (!prop) {
      inserts.push(`${PROP_INDENT}${name}: ${literal(value)},`);
      changedFields.push(`+${name}`);
      continue;
    }
    const current = source.slice(prop.value.start, prop.value.end);
    const next = literal(value);
    if (current !== next) {
      edits.push({ ...prop.value, text: next });
      changedFields.push(name);
    }
  }
  if (inserts.length > 0) {
    const lineStart = source.lastIndexOf('\n', stage.object.end) + 1;
    edits.push({ start: lineStart, end: lineStart, text: `${inserts.join('\n')}\n` });
  }

  const text = edits.length === 0 ? source : splice(source, edits);

  const droppedComments: string[] = [];
  for (const list of Object.values(stage.terrain.rowComments)) {
    for (const c of list) if (!usedComments.has(c)) droppedComments.push(c);
  }
  for (const e of stage.enemies) {
    if (edit.enemies.some((x) => x.origIndex === e.index)) continue;
    for (const c of e.leadingComments) if (!usedComments.has(c)) droppedComments.push(c);
  }

  if (edits.length > 0) verifyRoundTrip(text, edit);
  return { text, droppedComments, changedFields };
}

/**
 * 生成的文本必须能重新解析出**一模一样**的模型。
 *
 * 这一步是整个工具的安全网：外科手术式改写一旦偏一个字节，产出仍可能是合法 TS
 * （比如少了个逗号导致两个格子合成一个对象），而错的关卡数据是静默的——
 * 单测要跑完整关列表才发现，真机上则是某一关莫名变样。宁可保存失败。
 */
function verifyRoundTrip(text: string, edit: StageEdit): void {
  const re = parseStageFile(text).stages[edit.key];
  if (!re) throw new Error(`回读校验失败：改写后找不到 ${edit.key}`);
  if (re.terrain.width !== edit.width || re.terrain.height !== edit.height) {
    throw new Error(
      `回读校验失败：${edit.key} 尺寸对不上（期望 ${edit.width}x${edit.height}，`
      + `实得 ${re.terrain.width}x${re.terrain.height}）`,
    );
  }
  if (!sameGrid(re.terrain.grid, edit.grid)) {
    throw new Error(`回读校验失败：${edit.key} 地形与期望不一致`);
  }
  if (re.enemies.length !== edit.enemies.length) {
    throw new Error(
      `回读校验失败：${edit.key} 敌人数量对不上（期望 ${edit.enemies.length}，实得 ${re.enemies.length}）`,
    );
  }
  re.enemies.forEach((got, i) => {
    const want = edit.enemies[i]!;
    if (got.x !== want.x || got.y !== want.y || got.defId !== want.defId) {
      throw new Error(
        `回读校验失败：${edit.key} 第 ${i + 1} 个敌人对不上`
        + `（期望 ${want.defId}(${want.x},${want.y})，实得 ${got.defId}(${got.x},${got.y})）`,
      );
    }
  });
}

/** 章节分组 → 每关的章号 / 章内序号 / 全局下标（与 `STAGES_MVP` 一致） */
export function stageIndexMap(chapters: string[][]): Record<
  string,
  { chapter: number; indexInChapter: number; globalIndex: number }
> {
  const out: Record<string, { chapter: number; indexInChapter: number; globalIndex: number }> = {};
  let g = 0;
  chapters.forEach((keys, ci) => {
    keys.forEach((key, si) => {
      out[key] = { chapter: ci + 1, indexInChapter: si + 1, globalIndex: g };
      g += 1;
    });
  });
  return out;
}
