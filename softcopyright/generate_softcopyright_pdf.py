#!/usr/bin/env python3
"""
软件著作权登记 - 源程序代码 PDF 生成工具
====================================================
严格按中国版权保护中心常用提交要求生成:
  1. A4 纸张, 纵向, 单面
  2. 页眉左侧: 软件全称 + 版本号 (与申请表完全一致)
  3. 页眉右侧: 阿拉伯数字连续页码
  4. 页眉下方有分隔线
  5. 页脚: 申请人名称
  6. 每页不少于 50 行 (最后一页除外), 纯空白行不计入
  7. 代码字号不大于 13
  8. 代码超过 60 页时取前 30 页 + 后 30 页, 不足 60 页全部提交
  9. 第 1 页第 1 行尽量从程序入口开始
 10. 保留业务注释(注释也是源程序的一部分); 仅剔除含版权/作者/联系方式的注释行
"""

import re
import sys
import warnings
from math import ceil
from pathlib import Path

from fpdf import FPDF

warnings.filterwarnings("ignore", category=DeprecationWarning)

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'softcopyright' / '软著源程序-无尽纹章-V1.0.0.pdf'

SOFTWARE_FULL_NAME = '深圳幸运呱科技有限公司无尽纹章小游戏软件'
SOFTWARE_VERSION = 'V1.0.0'
APPLICANT_NAME = '深圳幸运呱科技有限公司'

LINES_PER_PAGE = 50
FRONT_PAGES = 30
BACK_PAGES = 30

SONGTI_PATH = '/System/Library/Fonts/Supplemental/Songti.ttc'

CODE_FONT_SIZE = 9
HEADER_FONT_SIZE = 10.5
FOOTER_FONT_SIZE = 9
LINENO_FONT_SIZE = 7.5

LINE_HEIGHT = 4.6
LEFT_MARGIN = 20
RIGHT_MARGIN = 15
TOP_MARGIN = 15
BOTTOM_MARGIN = 15

HEADER_TEXT = f'{SOFTWARE_FULL_NAME} {SOFTWARE_VERSION} 源程序'
MAX_CODE_CHARS = 100

IGNORE_DIRS = {
    '.git',
    'node_modules',
    'softcopyright',
    'dist',
    'coverage',
    '.vite',
    'docs',
}

IGNORE_FILE_NAMES = {
    'game-bundle.js',
}

IGNORE_PATH_PARTS = {
    '__tests__',
    'wechat-godot',
    'subpkg_assets',
}

# 入口优先: game.js -> src/main.ts, 再收集其余 TypeScript 与适配层
SOURCE_PATTERNS = [
    'game.js',
    'src/main.ts',
    'src/**/*.ts',
    'minigame/pixi-adapter/**/*.js',
]


class SoftCopyrightPDF(FPDF):
    def __init__(self):
        super().__init__(orientation='P', unit='mm', format='A4')
        self.set_auto_page_break(auto=False)

    def header(self):
        self.set_font('Songti', '', HEADER_FONT_SIZE)
        self.set_text_color(0, 0, 0)
        self.set_xy(LEFT_MARGIN, TOP_MARGIN)
        self.cell(0, 6, HEADER_TEXT, new_x="LEFT", new_y="TOP")
        page_str = str(self.page_no())
        tw = self.get_string_width(page_str)
        self.set_xy(210 - RIGHT_MARGIN - tw, TOP_MARGIN)
        self.cell(tw, 6, page_str, new_x="LEFT", new_y="TOP")
        line_y = TOP_MARGIN + 7
        self.set_draw_color(0, 0, 0)
        self.set_line_width(0.4)
        self.line(LEFT_MARGIN, line_y, 210 - RIGHT_MARGIN, line_y)

    def footer(self):
        footer_y = 297 - BOTTOM_MARGIN
        self.set_xy(LEFT_MARGIN, footer_y)
        self.set_font('Songti', '', FOOTER_FONT_SIZE)
        self.set_text_color(0, 0, 0)
        self.cell(210 - LEFT_MARGIN - RIGHT_MARGIN, 5, APPLICANT_NAME, align='C')


def is_ignored(path: Path) -> bool:
    if path.name in IGNORE_FILE_NAMES:
        return True
    return any(part in IGNORE_DIRS or part in IGNORE_PATH_PARTS for part in path.parts)


def collect_source_files(root: Path):
    files = []
    for pattern in SOURCE_PATTERNS:
        if '*' not in pattern:
            fp = root / pattern
            if fp.exists() and not is_ignored(fp.relative_to(root)):
                files.append(fp)
            continue
        files.extend(
            fp for fp in sorted(root.glob(pattern))
            if fp.is_file() and not is_ignored(fp.relative_to(root))
        )
    seen = set()
    result = []
    for fp in files:
        key = fp.resolve()
        if key not in seen:
            seen.add(key)
            result.append(fp)
    return result


def sanitize_code_line(line: str) -> str:
    stripped = line.strip()
    if stripped.startswith('//') or stripped.startswith('*') or stripped.startswith('/*'):
        if re.search(r'copyright|author|date|created|@|地址|电话|版权', stripped, re.I):
            return ''
    return line.rstrip('\n\r')


def read_all_lines(files):
    all_lines = []
    line_no = 1
    for fp in files:
        try:
            text = fp.read_text(encoding='utf-8')
        except UnicodeDecodeError:
            text = fp.read_text(encoding='utf-8-sig')
        for raw_line in text.splitlines():
            clean = sanitize_code_line(raw_line)
            if clean.strip() == '':
                continue
            all_lines.append((line_no, clean))
            line_no += 1
    return all_lines


def select_lines(all_lines):
    max_lines = (FRONT_PAGES + BACK_PAGES) * LINES_PER_PAGE
    if len(all_lines) <= max_lines:
        return all_lines
    return all_lines[:FRONT_PAGES * LINES_PER_PAGE] + all_lines[-BACK_PAGES * LINES_PER_PAGE:]


def safe_pdf_text(text: str) -> str:
    replacements = {
        '→': '->', '←': '<-', '↑': '^', '↓': 'v',
        '▼': 'v', '◀': '<', '▶': '>',
        '✅': '[OK]', '⚠': '[!]', '…': '...', '—': '-',
    }
    for old, new in replacements.items():
        text = text.replace(old, new)
    return ''.join(c if ord(c) <= 0xFFFF else '?' for c in text)


def truncate_code(text):
    safe = safe_pdf_text(text.replace('\t', '    '))
    if len(safe) <= MAX_CODE_CHARS:
        return safe
    return safe[:MAX_CODE_CHARS - 3] + '...'


def generate_pdf(selected_lines):
    total_pages = ceil(len(selected_lines) / LINES_PER_PAGE)
    pdf = SoftCopyrightPDF()
    pdf.add_font('Songti', '', SONGTI_PATH)
    code_start_y = TOP_MARGIN + 10
    lineno_col_w = 14

    for page_idx in range(total_pages):
        pdf.add_page()
        start = page_idx * LINES_PER_PAGE
        end = min(start + LINES_PER_PAGE, len(selected_lines))
        page_items = selected_lines[start:end]

        for i, (line_no, code) in enumerate(page_items):
            y = code_start_y + i * LINE_HEIGHT
            pdf.set_font('Songti', '', LINENO_FONT_SIZE)
            pdf.set_text_color(140, 140, 140)
            lineno_str = str(line_no)
            lw = pdf.get_string_width(lineno_str)
            pdf.set_xy(LEFT_MARGIN + lineno_col_w - lw - 1, y)
            pdf.cell(lw, LINE_HEIGHT, lineno_str)

            pdf.set_font('Songti', '', CODE_FONT_SIZE)
            pdf.set_text_color(0, 0, 0)
            pdf.set_xy(LEFT_MARGIN + lineno_col_w + 1, y)
            pdf.cell(0, LINE_HEIGHT, truncate_code(code))

    pdf.output(str(OUTPUT))
    return total_pages


def validate_pdf():
    from pypdf import PdfReader
    reader = PdfReader(str(OUTPUT))
    return len(reader.pages)


def main():
    files = collect_source_files(ROOT)
    if not files:
        print('错误: 未找到任何源码文件')
        sys.exit(1)

    all_lines = read_all_lines(files)
    selected = select_lines(all_lines)
    total_pages = generate_pdf(selected)
    validated = validate_pdf()

    total_source = len(all_lines)
    total_source_pages = ceil(total_source / LINES_PER_PAGE)

    print('=' * 50)
    print('  软著源程序 PDF 生成报告')
    print('=' * 50)
    print(f'  软件名称:     {SOFTWARE_FULL_NAME} {SOFTWARE_VERSION}')
    print(f'  申请人:       {APPLICANT_NAME}')
    print(f'  源码文件数:   {len(files)} 个')
    print(f'  源码总行数:   {total_source} 行')
    print(f'  源码总页数:   {total_source_pages} 页')
    print(f'  提取方式:     {"全部提交" if total_source_pages <= FRONT_PAGES + BACK_PAGES else f"前 {FRONT_PAGES} 页 + 后 {BACK_PAGES} 页"}')
    print(f'  选取行数:     {len(selected)} 行')
    print(f'  每页行数:     {LINES_PER_PAGE} 行')
    print(f'  生成页数:     {total_pages} 页')
    print(f'  PDF验证页数:  {validated} 页')
    print(f'  输出文件:     {OUTPUT}')
    print('=' * 50)
    print(f'  第1行: {selected[0][1][:60] if selected else ""}')
    print(f'  末行:  {selected[-1][1][:60] if selected else ""}')
    print('  PDF 生成验证通过' if validated == total_pages else '  警告: PDF 页数与预期不一致')


if __name__ == '__main__':
    main()
