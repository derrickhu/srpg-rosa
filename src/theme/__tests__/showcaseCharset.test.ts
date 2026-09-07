import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * 得意黑子集一过期，标题/按钮/技能名就会「一个词里两种字」。
 * 这里扫非测试源码字符串，对照 `fonts/SmileySans-subset.ttf` 的 cmap。
 */

const ROOT = process.cwd();
const FONT = join(ROOT, 'fonts/SmileySans-subset.ttf');
const SRC = join(ROOT, 'src');

const ESSENTIAL = new Set(
  (
    ' ·：，。、！？；：（）【】《》/%+-×=~<>　'
    + '0123456789'
    + 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
  ).split(''),
);

const STR_RE = /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`/g;
const COMMENT_RE = /\/\/.*?$|\/\*[\s\S]*?\*\//gm;

function isGameChar(ch: string): boolean {
  if (ch === '\n' || ch === '\t' || ch === '\r') return false;
  if (ch === ' ') return true;
  const code = ch.codePointAt(0)!;
  if (code < 128) return ESSENTIAL.has(ch);
  if (code >= 0x4e00 && code <= 0x9fff) return true;
  if (code >= 0x3000 && code <= 0x303f) return true;
  if (code >= 0xff00 && code <= 0xffef) return true;
  return '·、【】《》。！？（）：；×　'.includes(ch);
}

function unescapeLiteral(literal: string): string {
  return literal
    .slice(1, -1)
    .replace(/\\\\/g, '\0')
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\"/g, '"')
    .replace(/\\'/g, "'")
    .replace(/\\`/g, '`')
    .replace(/\0/g, '\\');
}

function isTestFile(rel: string): boolean {
  return rel.includes('/__tests__/') || rel.endsWith('.test.ts');
}

function walkTs(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walkTs(p, out);
    else if (name.endsWith('.ts')) out.push(p);
  }
  return out;
}

function collectGameChars(): Set<string> {
  const chars = new Set(ESSENTIAL);
  for (const file of walkTs(SRC)) {
    const rel = relative(ROOT, file).replace(/\\/g, '/');
    if (isTestFile(rel)) continue;
    const text = readFileSync(file, 'utf8').replace(COMMENT_RE, '');
    for (const m of text.matchAll(STR_RE)) {
      for (const ch of unescapeLiteral(m[0]!)) {
        if (isGameChar(ch)) chars.add(ch);
      }
    }
  }
  return chars;
}

function readU16(buf: Buffer, o: number): number {
  return buf.readUInt16BE(o);
}
function readU32(buf: Buffer, o: number): number {
  return buf.readUInt32BE(o);
}

function parseFmt4(buf: Buffer, off: number, cps: Set<number>): void {
  const segCount = readU16(buf, off + 6) / 2;
  const endO = off + 14;
  const startO = endO + segCount * 2 + 2;
  const deltaO = startO + segCount * 2;
  const rangeO = deltaO + segCount * 2;
  for (let i = 0; i < segCount; i++) {
    const end = readU16(buf, endO + i * 2);
    const start = readU16(buf, startO + i * 2);
    const delta = buf.readInt16BE(deltaO + i * 2);
    const range = readU16(buf, rangeO + i * 2);
    for (let c = start; c <= end; c++) {
      let glyph = 0;
      if (range === 0) {
        glyph = (c + delta) & 0xffff;
      } else {
        const glyphOff = rangeO + i * 2 + range + (c - start) * 2;
        const raw = readU16(buf, glyphOff);
        if (raw !== 0) glyph = (raw + delta) & 0xffff;
      }
      if (glyph !== 0) cps.add(c);
    }
  }
}

function parseFmt12(buf: Buffer, off: number, cps: Set<number>): void {
  const n = readU32(buf, off + 12);
  let p = off + 16;
  for (let i = 0; i < n; i++) {
    const start = readU32(buf, p);
    const end = readU32(buf, p + 4);
    p += 12;
    for (let c = start; c <= end; c++) cps.add(c);
  }
}

/** 读 TTF cmap，收 Unicode 码点。glyph id 映射只用来判断「有没有这个字」。 */
export function readFontCodepoints(buf: Buffer): Set<number> {
  const nTables = readU16(buf, 4);
  let cmap = 0;
  for (let i = 0; i < nTables; i++) {
    const o = 12 + i * 16;
    if (buf.toString('ascii', o, o + 4) === 'cmap') {
      cmap = readU32(buf, o + 8);
      break;
    }
  }
  if (!cmap) throw new Error('no cmap');
  const nEnc = readU16(buf, cmap + 2);
  const cps = new Set<number>();
  for (let i = 0; i < nEnc; i++) {
    const rec = cmap + 4 + i * 8;
    const off = cmap + readU32(buf, rec + 4);
    const format = readU16(buf, off);
    if (format === 4) parseFmt4(buf, off, cps);
    if (format === 12) parseFmt12(buf, off, cps);
  }
  return cps;
}

describe('得意黑子集盖住展示向文案', () => {
  it('非测试源码里的字都在 SmileySans-subset 里', () => {
    expect(existsSync(FONT), '缺少 fonts/SmileySans-subset.ttf').toBe(true);
    const fontCps = readFontCodepoints(readFileSync(FONT));
    const needed = [...collectGameChars()].filter((ch) => ch !== ' ');
    const missing = needed.filter((ch) => !fontCps.has(ch.codePointAt(0)!));
    expect(
      missing,
      `子集缺字，屏幕上会混成两种字体。缺：${missing.join('')}。请跑 npm run font:subset`,
    ).toEqual([]);
  });
});
