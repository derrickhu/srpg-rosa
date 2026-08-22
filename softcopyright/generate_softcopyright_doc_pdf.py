#!/usr/bin/env python3
"""
软件著作权登记 - 文档鉴别材料（设计说明书）PDF 生成工具
====================================================
严格按中国版权保护中心常用提交要求:
  1. A4 纸张, 纵向
  2. 页眉左侧: 软件全称 + 版本号 (与申请表完全一致)
  3. 页眉右侧: 阿拉伯数字连续页码
  4. 页脚: 申请人名称
  5. 每页不少于 30 行 (有图除外)
  6. 不足 60 页全部提交, 超过 60 页取前 30 页 + 后 30 页
  7. 文档类型: 设计说明书
  8. 截图缺失时生成占位框, 后续补图后重跑脚本即可替换
"""

import warnings
from pathlib import Path

from fpdf import FPDF
from fpdf.enums import WrapMode
from PIL import Image

warnings.filterwarnings("ignore", category=DeprecationWarning)

# ======================= 配置区 =======================

ROOT = Path(__file__).resolve().parents[1]
SOFTCOPYRIGHT_DIR = ROOT / 'softcopyright'
OUTPUT = SOFTCOPYRIGHT_DIR / '软著文档-无尽纹章-V1.0.0.pdf'

SOFTWARE_FULL_NAME = '深圳幸运呱科技有限公司无尽纹章小游戏软件'
SOFTWARE_VERSION = 'V1.0.0'
APPLICANT_NAME = '深圳幸运呱科技有限公司'

SONGTI_PATH = '/System/Library/Fonts/Supplemental/Songti.ttc'

BODY_FONT_SIZE = 10.5
H1_FONT_SIZE = 16
H2_FONT_SIZE = 14
H3_FONT_SIZE = 12
CODE_FONT_SIZE = 9
HEADER_FONT_SIZE = 10
FOOTER_FONT_SIZE = 9

LINE_HEIGHT = 6.5
CODE_LINE_HEIGHT = 5.0
H1_LINE_HEIGHT = 10
H2_LINE_HEIGHT = 8.5
H3_LINE_HEIGHT = 7.5

LEFT_MARGIN = 25
RIGHT_MARGIN = 20
TOP_MARGIN = 15
BOTTOM_MARGIN = 15

PAGE_W = 210
PAGE_H = 297
CONTENT_W = PAGE_W - LEFT_MARGIN - RIGHT_MARGIN
CONTENT_TOP = TOP_MARGIN + 10
HEADER_TEXT = f'{SOFTWARE_FULL_NAME} {SOFTWARE_VERSION} 设计说明书'

PICS_DIR = SOFTCOPYRIGHT_DIR / 'pics'

# (文件名, 图注, 截图要求说明) — 按版署补正要求编排全流程截图
PIC_SPECS = [
    ('01_boot.jpg', '图1  启动加载界面与健康游戏忠告',
     '展示草原战线底图、游戏名称 Logo、加载进度及底部健康游戏忠告全文。'),
    ('02_hub.jpg', '图2  大厅界面 - 冒险页与底部导航',
     '展示大厅顶部魂晶、冒险章节入口及底部招募/角色/冒险/副本四个 Tab。'),
    ('03_recruit.jpg', '图3  招募界面',
     '展示可解锁角色列表、魂晶消耗与招募入口。'),
    ('04_roster.jpg', '图4  角色养成界面',
     '展示已拥有角色列表、等级与职业。'),
    ('05_roster_detail.jpg', '图5  角色详情与技能装配',
     '展示单个角色面板、主技能切换与可学技能。'),
    ('06_adventure.jpg', '图6  冒险章节地图',
     '展示草原战线等章节节点(战斗/Boss/补给点)与推进进度。'),
    ('07_deploy.jpg', '图7  布阵界面',
     '展示棋盘、可上阵角色、地形放置与开战按钮。'),
    ('08_battle.jpg', '图8  战斗界面',
     '展示战棋对战进行中画面, 含单位、血条、技能栏与行动顺序。'),
    ('09_loot.jpg', '图9  战后三选一战利品',
     '展示战斗胜利后的词条/药剂三选一卡片。'),
    ('10_shop.jpg', '图10 局内补给点商店',
     '展示药剂、地形券、临时技能等局内商品。'),
    ('11_challenge.jpg', '图11 副本界面 - 无尽试炼入口',
     '展示副本页、无尽试炼说明与挑战入口。'),
    ('12_endless.jpg', '图12  无尽试炼布阵',
     '展示无尽试炼第 1/10 波开场布阵、上阵人数与开战入口。'),
    ('13_clear.jpg', '图13 通关结算',
     '展示章节通关或无尽试炼结束结算、魂晶奖励。'),
    ('14_unit_info_base.jpg', '图14  布阵时查看上场单位技能信息(初始)',
     '展示点击单位后的详情面板: 基础属性、普通攻击与装备技能, 尚无局内词条与临时技能。'),
    ('15_unit_info_run.jpg', '图15  战斗中查看单位信息(局内加成与临时技能)',
     '展示战斗中点击单位的详情: 本局词条加成, 以及补给点购入的临时技能。'),
    ('16_terrain_bonus.jpg', '图16  高地攻击加成与森林减伤',
     '展示站上高地时攻击 +25%、森林承伤 -25%, 以及技能命中飘字。'),
    ('17_potion.jpg', '图17  战斗中使用治疗药剂',
     '展示点击治疗药剂后的全场生效提示, 以及底部药剂栏剩余数量。'),
]


class DocPDF(FPDF):
    def __init__(self):
        super().__init__(orientation='P', unit='mm', format='A4')
        self.set_left_margin(LEFT_MARGIN)
        self.set_right_margin(RIGHT_MARGIN)
        self.set_top_margin(CONTENT_TOP)
        self.set_auto_page_break(auto=True, margin=BOTTOM_MARGIN + 10)

    def header(self):
        self.set_font('Songti', '', HEADER_FONT_SIZE)
        self.set_text_color(0, 0, 0)
        self.set_xy(LEFT_MARGIN, TOP_MARGIN)
        self.cell(0, 6, HEADER_TEXT, new_x="LEFT", new_y="TOP")
        page_str = str(self.page_no())
        tw = self.get_string_width(page_str)
        self.set_xy(PAGE_W - RIGHT_MARGIN - tw, TOP_MARGIN)
        self.cell(tw, 6, page_str, new_x="LEFT", new_y="TOP")
        line_y = TOP_MARGIN + 7
        self.set_draw_color(0, 0, 0)
        self.set_line_width(0.4)
        self.line(LEFT_MARGIN, line_y, PAGE_W - RIGHT_MARGIN, line_y)
        self.set_y(CONTENT_TOP)

    def footer(self):
        self.set_xy(LEFT_MARGIN, PAGE_H - BOTTOM_MARGIN)
        self.set_font('Songti', '', FOOTER_FONT_SIZE)
        self.set_text_color(0, 0, 0)
        self.cell(CONTENT_W, 5, APPLICANT_NAME, align='C')

    def check_page_break(self, h):
        if self.get_y() + h > PAGE_H - BOTTOM_MARGIN - 10:
            self.add_page()

    def write_h1(self, text):
        self.check_page_break(H1_LINE_HEIGHT + 4)
        self.ln(4)
        self.set_font('Songti', '', H1_FONT_SIZE)
        self.set_text_color(0, 0, 0)
        self.set_x(LEFT_MARGIN)
        self.cell(CONTENT_W, H1_LINE_HEIGHT, safe_text(text), new_x="LMARGIN", new_y="NEXT")
        self.ln(2)

    def write_h2(self, text):
        self.check_page_break(H2_LINE_HEIGHT + 3)
        self.ln(3)
        self.set_font('Songti', '', H2_FONT_SIZE)
        self.set_text_color(0, 0, 0)
        self.set_x(LEFT_MARGIN)
        self.cell(CONTENT_W, H2_LINE_HEIGHT, safe_text(text), new_x="LMARGIN", new_y="NEXT")
        self.ln(1.5)

    def write_h3(self, text):
        self.check_page_break(H3_LINE_HEIGHT + 2)
        self.ln(2)
        self.set_font('Songti', '', H3_FONT_SIZE)
        self.set_text_color(0, 0, 0)
        self.set_x(LEFT_MARGIN)
        self.cell(CONTENT_W, H3_LINE_HEIGHT, safe_text(text), new_x="LMARGIN", new_y="NEXT")
        self.ln(1)

    def write_body(self, text, indent=0):
        self.set_font('Songti', '', BODY_FONT_SIZE)
        self.set_text_color(30, 30, 30)
        self.set_x(LEFT_MARGIN + indent)
        self.multi_cell(
            CONTENT_W - indent, LINE_HEIGHT, safe_text(text),
            new_x="LMARGIN", new_y="NEXT", wrapmode=WrapMode.CHAR,
        )

    def write_bullet(self, text, level=0):
        indent = 4 + level * 4
        bullet = '  ' * level + ('- ' if level > 0 else '* ')
        self.write_body(bullet + text, indent=indent)

    def write_code_block(self, lines):
        self.ln(1)
        self.set_font('Songti', '', CODE_FONT_SIZE)
        self.set_text_color(40, 40, 40)
        for line in lines:
            self.check_page_break(CODE_LINE_HEIGHT)
            self.set_fill_color(245, 245, 245)
            self.set_x(LEFT_MARGIN + 4)
            self.cell(
                CONTENT_W - 4, CODE_LINE_HEIGHT,
                safe_text(line.replace('\t', '    ')),
                fill=True, new_x="LMARGIN", new_y="NEXT",
            )
        self.ln(1)

    def write_table_auto(self, headers, rows, col_widths=None):
        self.ln(1)
        if col_widths is None:
            col_widths = [CONTENT_W / len(headers)] * len(headers)
        self.set_font('Songti', '', BODY_FONT_SIZE)
        self.set_fill_color(230, 230, 230)
        self.set_text_color(0, 0, 0)
        cx = LEFT_MARGIN
        for i, h in enumerate(headers):
            self.set_x(cx)
            self.cell(col_widths[i], LINE_HEIGHT, safe_text(h), border=1, fill=True, new_x="LEFT", new_y="TOP")
            cx += col_widths[i]
        self.ln(LINE_HEIGHT)
        self.set_fill_color(255, 255, 255)
        self.set_text_color(30, 30, 30)
        for row in rows:
            self.check_page_break(LINE_HEIGHT)
            cx = LEFT_MARGIN
            for i, cell in enumerate(row):
                self.set_x(cx)
                self.cell(col_widths[i], LINE_HEIGHT, safe_text(str(cell)), border=1, new_x="LEFT", new_y="TOP")
                cx += col_widths[i]
            self.ln(LINE_HEIGHT)
        self.ln(1)

    def write_image_or_placeholder(self, filename, caption, requirement, max_h=95):
        img_path = resolve_pic(filename)
        if img_path.exists():
            self.write_image(img_path, caption, max_h=max_h)
            return
        self.write_placeholder(filename, caption, requirement)

    def write_image(self, img_path, caption='', max_h=95):
        img = Image.open(img_path)
        iw, ih = img.size
        max_w = CONTENT_W * 0.48
        ratio = min(max_w / iw, max_h / ih)
        draw_w = iw * ratio
        draw_h = ih * ratio
        total_h = draw_h + 18
        self.check_page_break(total_h)
        self.ln(3)
        x = LEFT_MARGIN + (CONTENT_W - draw_w) / 2
        self.image(str(img_path), x=x, y=self.get_y(), w=draw_w, h=draw_h)
        self.set_y(self.get_y() + draw_h + 2)
        self.write_caption(caption)
        self.ln(3)

    def write_placeholder(self, filename, caption, requirement):
        box_w = CONTENT_W * 0.62
        box_h = 72
        self.check_page_break(box_h + 20)
        self.ln(3)
        x = LEFT_MARGIN + (CONTENT_W - box_w) / 2
        y = self.get_y()
        self.set_draw_color(150, 150, 150)
        self.set_line_width(0.4)
        self.rect(x, y, box_w, box_h)
        self.set_fill_color(245, 245, 245)
        self.rect(x + 1, y + 1, box_w - 2, box_h - 2, style='F')
        self.set_font('Songti', '', 11)
        self.set_text_color(80, 80, 80)
        self.set_xy(x + 4, y + 10)
        self.multi_cell(box_w - 8, 6, safe_text(f'截图占位: {filename}'), align='C', wrapmode=WrapMode.CHAR)
        self.set_font('Songti', '', 9)
        self.set_xy(x + 8, y + 28)
        self.multi_cell(box_w - 16, 5.5, safe_text(requirement), align='C', wrapmode=WrapMode.CHAR)
        self.set_y(y + box_h + 2)
        self.write_caption(caption)
        self.ln(3)

    def write_caption(self, caption):
        if not caption:
            return
        self.set_font('Songti', '', 9)
        self.set_text_color(100, 100, 100)
        self.set_x(LEFT_MARGIN)
        self.cell(CONTENT_W, 5, safe_text(caption), align='C', new_x="LMARGIN", new_y="NEXT")
        self.set_text_color(30, 30, 30)

    def write_spacer(self, h=3):
        self.ln(h)


def safe_text(text):
    replacements = {
        '→': '->', '←': '<-', '↑': '^', '↓': 'v',
        '✅': '[OK]', '⚠': '[!]', '★': '*', '…': '...', '—': '-',
        '"': '"', '"': '"',
    }
    for old, new in replacements.items():
        text = text.replace(old, new)
    return ''.join(c if ord(c) <= 0xFFFF else '?' for c in text)


def resolve_pic(filename):
    path = PICS_DIR / filename
    if path.exists():
        return path
    stem = Path(filename).stem
    for ext in ('.jpg', '.jpeg', '.png', '.JPG', '.PNG'):
        alt = PICS_DIR / f'{stem}{ext}'
        if alt.exists():
            return alt
    return path


def pic(filename):
    for item in PIC_SPECS:
        if item[0] == filename:
            return item
    raise KeyError(filename)


def show_pic(pdf, filename):
    name, caption, requirement = pic(filename)
    pdf.write_image_or_placeholder(name, caption, requirement)


def write_document(pdf):
    pdf.add_page()
    pdf.write_h1('目  录')
    for item in [
        '一、引言',
        '    1.1 编写目的',
        '    1.2 软件概述',
        '    1.3 主要特点',
        '    1.4 运行环境',
        '    1.5 术语与缩略语',
        '二、游戏全流程说明',
        '    2.1 启动与健康游戏忠告',
        '    2.2 大厅主界面',
        '    2.3 招募系统',
        '    2.4 角色养成系统',
        '    2.5 冒险章节玩法流程',
        '    2.6 副本与无尽试炼',
        '三、游戏角色与元素说明',
        '四、可进入场景一览',
        '五、游戏操作方法',
        '    5.1 基本操作',
        '    5.2 战斗与胜负规则',
        '    5.3 资源与进度规则',
        '    5.4 地形效果',
        '    5.5 药剂使用',
        '六、软件总体设计',
        '    6.1 软件需求概括',
        '    6.2 总体架构设计',
        '    6.3 模块划分与关系',
        '    6.4 场景系统设计',
        '七、核心模块详细设计',
        '    7.1 游戏入口模块',
        '    7.2 场景管理与大厅模块',
        '    7.3 战斗引擎模块',
        '    7.4 布阵与地形模块',
        '    7.5 冒险进度与战利品模块',
        '    7.6 无尽试炼模块',
        '    7.7 存档与平台能力模块',
        '八、数据结构设计',
        '九、数据接口设计',
        '十、出错处理设计',
        '十一、性能优化设计',
    ]:
        pdf.write_body(item)

    # ==================== 一、引言 ====================
    pdf.write_h1('一、引言')
    pdf.write_h2('1.1 编写目的')
    pdf.write_body(
        '编写本设计说明书是软件开发过程的重要组成部分。本文档旨在详细描述'
        '深圳幸运呱科技有限公司无尽纹章小游戏软件(以下简称"本软件")的软件架构设计、'
        '核心模块设计、数据结构设计、接口设计及出错处理设计, 为软件著作权登记提供技术性文档依据。'
    )
    pdf.write_body(
        '同时, 本文档以图文结合方式介绍游戏从启动到结束的完整游玩流程, 涵盖健康游戏忠告、主界面、'
        '全部角色形象、全部可进入场景、全部可体验系统及游戏操作方法。'
        '本文档面向软件著作权审查人员, 全面展示本软件的技术架构、设计思路和实现方案, '
        '证明本软件为独立开发的原创作品。'
    )

    pdf.write_h2('1.2 软件概述')
    pdf.write_body(
        '无尽纹章是一款基于微信小游戏平台的战棋休闲小游戏。玩家在大厅招募并养成固定角色, '
        '通过冒险章节推进主线: 进入节点后先布阵再战斗, 战后从三选一战利品中强化本局队伍, '
        '并在补给点购买药剂、地形券与临时技能。副本页提供可重复挑战的无尽试炼: 同一战场布阵一次, '
        '连续迎敌最多十波。局外成长资源为魂晶, 用于解锁角色与学习技能; 局内资源随本局结束清空。'
    )

    pdf.write_h2('1.3 主要特点')
    for feature in [
        '两层循环: 大厅 Meta(招募/角色/冒险/副本)与局内 Run(布阵->战斗->三选一/商店)分离',
        '固定角色名册: 雷恩、希尔、格隆等角色与职业绑定, 成长来自等级与技能装配, 不随机招募',
        '战棋对战: 网格移动、普攻与主动技能、嘲讽、地形加成; 可手动操作, 也可切换托管由程序决策代打',
        '战后三选一: 战斗胜利掉落词条或药剂, 玩家为当前上阵角色选择强化方向',
        '局内补给点: 购买治疗/蛮力/迟缓药剂、地形券与临时技能, 仅本局有效',
        '无尽试炼: 同一张图布阵一次, 最多十波连战, 击杀掉落药剂需走过去拾取',
        '地形策略: 高地加攻击、森林减承伤、城墙阻挡通行, 布阵阶段用地形券放置',
        '本地持久化: Meta 进度与局内存档分离保存, 支持断线续打当前 Run',
    ]:
        pdf.write_bullet(feature)

    pdf.write_h2('1.4 运行环境')
    pdf.write_table_auto(
        ['项目', '要求'],
        [
            ['运行平台', '微信小游戏'],
            ['操作系统', 'iOS 10.0及以上 / Android 5.0及以上'],
            ['微信版本', '微信客户端 6.7.2 及以上'],
            ['屏幕方向', '竖屏(Portrait)'],
            ['开发语言', 'TypeScript / JavaScript (ES6+)'],
            ['渲染技术', 'PixiJS 7 + WebGL/Canvas'],
            ['构建工具', 'Vite'],
            ['云服务', '腾讯云 CloudBase (资源 CDN / 后续 API)'],
            ['网络要求', '核心玩法可本地运行, 资源预取与广告需要网络连接'],
        ],
        col_widths=[40, CONTENT_W - 40],
    )

    pdf.write_h2('1.5 术语与缩略语')
    pdf.write_table_auto(
        ['术语/缩略语', '含义说明'],
        [
            ['Meta', '局外大厅层, 管理角色解锁、等级、魂晶与章节进度'],
            ['Run', '一次进入冒险或试炼后的局内状态, 含药剂、词条、地形券'],
            ['魂晶', '局外永久货币, 用于招募角色与学习技能'],
            ['词条', '战后三选一获得的技能强化, 按角色存储, 仅本局有效'],
            ['地形券', '局内消耗品, 布阵时放置到格子, 赋予高地/森林/城墙等加成或阻挡'],
            ['托管', '战斗中由程序决策代为操作我方单位, 玩家可随时接手改为手动'],
            ['无尽试炼', '同一战场连续迎敌, 最多十波的可重复挑战模式'],
            ['PixiJS', '用于小游戏渲染的 2D WebGL 渲染引擎'],
            ['Scene', '游戏场景, 负责独立界面生命周期、渲染和输入处理'],
            ['SDK', 'Software Development Kit, 软件开发工具包'],
            ['API', 'Application Programming Interface, 应用程序接口'],
        ],
        col_widths=[35, CONTENT_W - 35],
    )

    # ==================== 二、游戏全流程 ====================
    pdf.write_h1('二、游戏全流程说明')
    pdf.write_body(
        '以下按玩家实际游玩顺序, 图文介绍从打开游戏到结束一局的完整流程。'
        '玩家启动游戏后依次经历: 加载与健康忠告 -> 大厅 -> 选择招募/角色/冒险/副本 -> '
        '布阵与战斗 -> 三选一或商店 -> 结算回大厅。'
    )

    pdf.write_h2('2.1 启动与健康游戏忠告')
    pdf.write_body(
        '玩家在微信中打开"无尽纹章"小游戏后, 首先进入加载界面。界面铺满草原战线启动底图, '
        '上方展示游戏 Logo"无尽纹章", 中下部为加载进度条, '
        '界面最下方展示国家要求的健康游戏忠告全文, 内容如下:'
    )
    for line in [
        '抵制不良游戏, 拒绝盗版游戏。',
        '注意自我保护, 谨防受骗上当。',
        '适度游戏益脑, 沉迷游戏伤身。',
        '合理安排时间, 享受健康生活。',
    ]:
        pdf.write_bullet(line)
    pdf.write_body('资源加载完成后自动进入大厅主界面。')
    show_pic(pdf, '01_boot.jpg')

    pdf.write_h2('2.2 大厅主界面')
    pdf.write_body(
        '加载完成后直接进入大厅 Shell, 不再经过单独的开始页。'
        '大厅顶部显示魂晶等局外资源, 底部常驻四个 Tab, 各管一件事、互不重叠:'
    )
    pdf.write_bullet('招募: 解锁尚未拥有的角色')
    pdf.write_bullet('角色: 已有角色的养成、等级与技能装配')
    pdf.write_bullet('冒险: 推进主线章节节点')
    pdf.write_bullet('副本: 可重复刷的内容, 含无尽试炼')
    pdf.write_body('默认进入冒险 Tab。玩家可随时切换 Tab, 切换后保留冒险章节页码。')
    show_pic(pdf, '02_hub.jpg')

    pdf.write_h2('2.3 招募系统')
    pdf.write_body(
        '点击底部"招募"进入招募界面。本软件采用固定角色名册, 不通过商店随机抽卡。'
        '角色解锁方式分为三类: 开局即拥有、消耗魂晶解锁、通关指定章节后解锁。'
        '玩家查看角色职业、技能路线与消耗后, 支付魂晶完成招募, 角色进入名册。'
    )
    show_pic(pdf, '03_recruit.jpg')

    pdf.write_h2('2.4 角色养成系统')
    pdf.write_body(
        '点击底部"角色"进入名册列表, 展示已拥有角色的头像、名称、职业与等级。'
        '点入单个角色可查看基础面板(生命、攻击、速度、移动力)与成长, 并装配主技能。'
        '每个角色绑定一条技能路线(输出/控制/辅助), 可学技能必须与路线一致, '
        '避免切换主技能后已获得的词条失效。可用魂晶学习解锁技能。'
    )
    show_pic(pdf, '04_roster.jpg')
    show_pic(pdf, '05_roster_detail.jpg')

    pdf.write_h2('2.5 冒险章节玩法流程')
    pdf.write_h3('2.5.1 选择章节与节点')
    pdf.write_body(
        '冒险页以章节地图展示主线副本。当前版本包含草原战线、密林深处、要塞攻防、毒沼泥潭、龙岭绝巅等章节。'
        '每个副本由有序节点组成: 普通战斗、Boss 战斗与补给点(商店)。'
        '玩家沿节点推进, 已通关节点可扫荡或重打, 未解锁节点保持锁定。'
    )
    show_pic(pdf, '06_adventure.jpg')

    pdf.write_h3('2.5.2 布阵')
    pdf.write_body(
        '进入战斗节点后先进入布阵界面。玩家从名册中选择上阵角色(受副本 maxParty 限制), '
        '在己方部署行内放置单位。点击己方或敌方单位可打开详情面板, 查看生命、攻击、技能与状态。'
        '玩家还可消耗本局地形券, 把高地、森林或城墙放到格子上: 高地站上攻击提高, 森林站上承伤降低, '
        '城墙不可通行用于卡位。确认后开战, 进入战斗回放。'
        '点击单位打开的详情面板展示初始上场信息: 基础属性、普通攻击与当前装备技能, '
        '此时尚未写入本局词条, 也还没有补给点购入的临时技能。'
    )
    show_pic(pdf, '07_deploy.jpg')
    show_pic(pdf, '14_unit_info_base.jpg')

    pdf.write_h3('2.5.3 战斗')
    pdf.write_body(
        '战斗在网格棋盘上进行。单位按速度行动, 可移动、普攻或施放主动技能。'
        '盾卫职业带嘲讽, 弓手远程攻击, 骑兵移动力更高。'
        '点击棋盘上的敌方或我方单位, 可打开详情面板, 查看当前生命、攻击、速度、移动力、'
        '装备技能、冷却以及嘲讽/中毒等状态, 不改变战局, 托管与手动模式下均可查看。'
        '界面下方可点击本局药剂立即使用(治疗、蛮力或迟缓, 全场生效并消耗一瓶)。'
        '玩家可随时在托管与手动之间切换: 托管时由战斗引擎的程序决策代为走位与出手; '
        '手动时玩家自行点选移动、技能与普攻。敌方单位始终由同一套程序决策控制。'
        '我方全灭判定失败; 清空敌军判定胜利。'
        '获得局内词条或在补给点购买临时技能后, 再次打开详情即可看到本局加成与第二技能位, '
        '与上场时的初始面板对照。站上高地时界面提示攻击提高, 站上森林时提示承伤降低。'
    )
    show_pic(pdf, '08_battle.jpg')
    show_pic(pdf, '15_unit_info_run.jpg')
    show_pic(pdf, '16_terrain_bonus.jpg')
    show_pic(pdf, '17_potion.jpg')

    pdf.write_h3('2.5.4 战后三选一')
    pdf.write_body(
        '战斗胜利后弹出战利品界面, 提供三张卡片供玩家选择其一。卡片可能是技能词条(绑定到具体上阵角色)或药剂。'
        '词条按角色存储并随当前主技能生效; 药剂进入本局背包, 可在后续战斗中手动使用。'
        '玩家也可跳过本次选择。首通节点当场发放魂晶。'
    )
    show_pic(pdf, '09_loot.jpg')

    pdf.write_h3('2.5.5 补给点商店')
    pdf.write_body(
        '到达补给点节点时进入局内商店。商品来自当前副本的 roguelike 池, 包括:'
    )
    pdf.write_bullet('药剂: 治疗药剂、蛮力药剂、迟缓药剂')
    pdf.write_bullet('地形券: 按地形类型计数, 布阵时放置')
    pdf.write_bullet('临时技能: 本局附加的通用技能, 不挑职业')
    pdf.write_body('商店使用局内金币购买。商品仅本局有效, 退出 Run 后清空。')
    show_pic(pdf, '10_shop.jpg')
    pdf.write_body(
        '打通当前副本全部节点后进入通关结算, 发放 meta 通关奖励并解锁后续章节或角色, 然后返回大厅。'
    )
    show_pic(pdf, '13_clear.jpg')

    pdf.write_h2('2.6 副本与无尽试炼')
    pdf.write_body(
        '点击底部"副本"进入挑战列表。副本页负责可重复刷的内容, 与冒险页的主线推进分开:'
    )
    pdf.write_bullet('章节重打: 已通关章节可再次挑战, 条目由通关记录派生')
    pdf.write_bullet('活动副本: 限时活动入口(后续开放)')
    pdf.write_bullet('无尽试炼: 同一战场布阵一次, 按波刷怪, 最多十波, 没有补给点')
    show_pic(pdf, '11_challenge.jpg')
    pdf.write_body(
        '无尽试炼同一张图只布阵一次, 上阵确认后按波刷怪, 最多十波, 没有补给点。'
        '击杀掉落的药剂需要单位走过去待机拾取。每清一波当场入账魂晶, '
        '打完第十波额外发放通关奖励。中途失败或主动结束则结算已获魂晶并返回大厅。'
        '下一波沿用上一波结束时的血量与站位。'
    )
    show_pic(pdf, '12_endless.jpg')

    # ==================== 三、角色与元素 ====================
    pdf.write_h1('三、游戏角色与元素说明')
    pdf.write_body(
        '本软件以固定英雄角色为核心形象。角色绑定职业与技能路线, 长期成长来自等级与技能学习。'
        '当前可体验角色如下。'
    )
    pdf.write_h2('3.1 可操作角色')
    pdf.write_table_auto(
        ['角色', '职业', '解锁方式', '技能路线'],
        [
            ['雷恩', '剑士', '开局拥有', '输出'],
            ['希尔', '弓手', '开局拥有', '输出'],
            ['格隆', '盾卫', '开局拥有', '输出'],
            ['岚骑', '骑兵', '魂晶解锁', '输出'],
            ['凯尔', '剑士', '通关草原战线', '输出'],
            ['薇恩', '弓手', '通关密林深处', '输出'],
        ],
        col_widths=[22, 22, 40, CONTENT_W - 84],
    )

    pdf.write_h2('3.2 职业与战斗定位')
    pdf.write_table_auto(
        ['职业', '定位说明'],
        [
            ['剑士', '近战输出, 移动力中等, 可学旋风斩、突进等技能'],
            ['弓手', '远程输出, 生命较低, 技能多为穿透射线'],
            ['盾卫', '高生命近战, 普攻带嘲讽, 保护队友'],
            ['骑兵', '高移动近战, 适合冲锋与践踏'],
        ],
        col_widths=[28, CONTENT_W - 28],
    )

    pdf.write_h2('3.3 局内元素')
    pdf.write_table_auto(
        ['元素', '说明'],
        [
            ['药剂', '治疗/蛮力/迟缓; 战斗中点击使用, 全场生效, 用一瓶少一瓶'],
            ['词条', '战后三选一强化技能, 按角色存储, 仅本局有效'],
            ['地形券', '布阵时放置一格; 高地加攻、森林减伤、城墙阻挡'],
            ['临时技能', '商店购入的通用技能, 本局附加到队伍'],
            ['魂晶', '局外永久货币, 招募与学技能'],
            ['金币', '局内商店货币, 随 Run 结束清空'],
        ],
        col_widths=[28, CONTENT_W - 28],
    )

    # ==================== 四、场景一览 ====================
    pdf.write_h1('四、可进入场景一览')
    pdf.write_body('本软件共包含以下可进入场景, 由 GameFlow 与 SceneManager 切换:')
    pdf.write_table_auto(
        ['场景名称', '进入方式', '场景功能', '对应截图'],
        [
            ['加载场景', '启动游戏自动进入', '底图、Logo、进度与健康忠告', '图1'],
            ['大厅-冒险', '加载完成 / 底部冒险 Tab', '章节地图与节点推进', '图2、图6'],
            ['大厅-招募', '底部招募 Tab', '解锁未拥有角色', '图3'],
            ['大厅-角色', '底部角色 Tab', '名册列表与养成详情', '图4、图5'],
            ['大厅-副本', '底部副本 Tab', '重打、活动与无尽试炼', '图11、图12'],
            ['布阵场景', '进入战斗节点或试炼', '上阵、放地形、查看单位、开战', '图7、图12、图14'],
            ['战斗场景', '布阵确认后', '战棋对战、查看单位、地形加成、使用药剂', '图8、图15、图16、图17'],
            ['战利品场景', '战斗胜利后', '三选一词条或药剂', '图9'],
            ['商店场景', '补给点节点', '购买局内消耗品', '图10'],
            ['结算场景', '通关或试炼结束', '展示魂晶奖励', '图13'],
        ],
        col_widths=[28, 36, 48, CONTENT_W - 112],
    )
    pdf.write_body('弹窗与 Toast 以覆盖层形式叠加在当前场景之上, 不改变底层场景。')

    # ==================== 五、操作方法 ====================
    pdf.write_h1('五、游戏操作方法')
    pdf.write_h2('5.1 基本操作')
    pdf.write_body('本游戏所有操作通过触摸屏点击完成, 无需键盘或手柄。核心操作如下:')
    for step in [
        '大厅导航: 点击底部四个 Tab 在招募、角色、冒险、副本之间切换',
        '招募与养成: 点击角色卡片查看详情, 点击解锁或学习技能并确认消耗魂晶',
        '进入节点: 在冒险地图点击已解锁节点开始一次 Run 或继续当前进度',
        '布阵: 点击名册单位再点击己方部署格放置; 点击地形券再点击格子放置地形; 点击棋盘单位查看详情',
        '开战: 点击开战按钮进入战斗回放',
        '查看单位: 战斗中点击敌方或我方棋子, 弹出详情面板(生命、攻击、技能、状态), 点空白处关闭; 上场初始信息见图14, 局内加成与临时技能见图15',
        '战斗操作: 托管时观看回放, 右上角「接手」改为手动; 手动时点选移动/技能/普攻, 右上角可再切回托管',
        '使用药剂: 点击战斗界面药剂图标立即生效, 消耗本局背包中对应药剂一瓶, 见图17',
        '三选一: 点击三张战利品卡片之一确认, 或点击跳过',
        '商店: 点击商品购买, 金币不足时按钮不可用',
        '返回: 左上角或确认弹窗返回上一级, 放弃 Run 需二次确认',
    ]:
        pdf.write_bullet(step)

    pdf.write_h2('5.2 战斗与胜负规则')
    for rule in [
        '回合顺序: 按单位速度决定行动顺序',
        '移动与攻击: 移动力决定可走格数, 普攻受职业射程约束',
        '技能: 主动技能按形状选择目标(邻域、圆盘、射线等), 消耗或冷却由技能配置决定',
        '查看信息: 点击单位打开详情, 与布阵页同一套面板, 数值与战斗结算一致',
        '胜利: 清空全部敌军',
        '失败: 我方全部阵亡; 可选择看广告复活等平台能力(不可用时降级)',
        '无尽试炼: 清波后血量与站位带入下一波, 最多十波或全灭结束',
    ]:
        pdf.write_bullet(rule)

    pdf.write_h2('5.3 资源与进度规则')
    for rule in [
        '魂晶为局外永久资源, 首通节点与无尽清波当场发放',
        '金币、药剂、词条、地形券、临时技能均属于 Run, 结束本局后清空',
        '角色解锁与技能学习写入 Meta 存档, 下次启动保留',
        '局内存档与 Meta 存档分 key 存储, 支持中途退出后继续当前 Run',
    ]:
        pdf.write_bullet(rule)

    pdf.write_h2('5.4 地形效果')
    pdf.write_body(
        '棋盘格子带地形。关卡自带部分地形, 玩家也可在布阵阶段消耗地形券额外放置。'
        '每种地形只提供一种确定性效果, 便于布阵时权衡站位与射程。'
    )
    pdf.write_table_auto(
        ['地形', '通行', '战斗加成'],
        [
            ['平原', '移动消耗 1', '无加成, 默认地面'],
            ['高地', '移动消耗 1', '站上造成的伤害 +25%'],
            ['森林', '移动消耗 2', '站上受到的伤害 -25%'],
            ['河流', '移动消耗 3', '站上造成的伤害 -20%'],
            ['沼泽', '移动消耗 2', '站上每回合流失 5 点生命'],
            ['城墙', '不可通行', '阻挡走位, 用于卡位与分割战场'],
            ['深渊', '不可通行', '关卡固有阻挡, 不可用地形券放置'],
        ],
        col_widths=[28, 32, CONTENT_W - 60],
    )
    pdf.write_body(
        '可放置的地形券为高地、森林、城墙三类, 在补给点商店购入, 仅本局有效。'
        '放置后从库存扣除一张。战斗中站上对应格子即享受上述加成, 伤害飘字会提示地形来源, '
        '例如高地显示"高地 +25%"与"攻 +25%", 森林显示"承 -25%"。'
    )
    show_pic(pdf, '16_terrain_bonus.jpg')

    pdf.write_h2('5.5 药剂使用')
    pdf.write_body(
        '药剂来自战后三选一或补给点商店, 进入本局背包。战斗界面显示已有药剂图标与剩余数量。'
        '玩家在战斗中点击图标立即使用, 效果对全场生效, 不占用单位行动次数, 用一瓶少一瓶。'
        '托管与手动模式下均可使用。当前药剂如下:'
    )
    pdf.write_table_auto(
        ['药剂', '效果', '使用方式'],
        [
            ['治疗药剂', '全体友军回复 35% 最大生命', '战斗中点击, 立即生效'],
            ['蛮力药剂', '全体友军攻击 +30%, 持续 2 回合', '战斗中点击, 立即生效'],
            ['迟缓药剂', '全体敌军速度 -2, 持续 2 回合', '战斗中点击, 立即生效'],
        ],
        col_widths=[28, 62, CONTENT_W - 90],
    )
    pdf.write_body('药剂、地形券均属于 Run 内资源, 本局结束后清空, 不带入下一局。')
    show_pic(pdf, '17_potion.jpg')

    # ==================== 六、软件总体设计 ====================
    pdf.write_h1('六、软件总体设计')
    pdf.write_h2('6.1 软件需求概括')
    pdf.write_body(
        '本软件采用模块化的软件设计方法, 以微信小游戏框架为基础平台, 使用 TypeScript 编写核心逻辑, '
        '通过 Vite 构建为小游戏可运行的 JavaScript bundle。软件采用单页面应用架构, 由 GameFlow 驱动'
        '大厅 Tab 与 Run 节点序列, SceneManager 负责场景生命周期。'
    )
    for need in [
        '高性能实时渲染: 棋盘单位、技能特效、战斗飘字和 UI 叠加需要稳定帧率',
        '准确触摸输入: 支持格子点选、单位信息面板、Tab 切换和弹窗确认',
        '可靠进度存储: Meta 与 Run 分离持久化, 坏档时回退默认结构',
        '可扩展内容配置: 角色、技能、词条、副本、地形、药剂均配置化',
        '稳定网络降级: CDN 资源、广告失败时不影响核心本地玩法',
    ]:
        pdf.write_bullet(need)

    pdf.write_h2('6.2 总体架构设计')
    pdf.write_body(
        '本软件采用"启动入口 + 引擎核心 + 流程编排 + 视图层 + 战斗模拟 + 配置数据 + 平台层"的分层架构。'
        '入口层负责初始化 Canvas 与 PixiJS; GameFlow 编排大厅与 Run; 战斗引擎纯逻辑模拟, '
        '视图层只负责播放与输入。'
    )
    pdf.write_table_auto(
        ['模块层', '模块名称', '功能简述'],
        [
            ['入口层', 'game.js / src/main.ts', '加载 pixi-adapter 与 bundle, 启动 GameFlow'],
            ['启动层', 'boot/createPixiApp.ts', '创建 Pixi Host、屏幕尺寸与渲染器'],
            ['流程层', 'view/GameFlow.ts', '大厅 Tab 与 Run 节点序列编排'],
            ['场景层', 'scene/SceneManager.ts', '场景注册、切换与生命周期'],
            ['视图层', 'view/*View.ts', '大厅、布阵、战斗、商店、招募等界面'],
            ['状态层', 'game/state/*.ts', 'Meta/Run 状态、进度、商店、布阵'],
            ['战斗层', 'battle/engine.ts', '战斗模拟、技能、程序决策、伤害计算'],
            ['数据层', 'data/*.ts', '角色、技能、副本、地形、药剂配置'],
            ['核心层', 'core/SaveManager.ts', '本地存档读写与版本归一'],
            ['平台层', 'platform/*.ts', '微信适配、广告、音频、分析上报'],
        ],
        col_widths=[22, 52, CONTENT_W - 74],
    )

    pdf.write_h2('6.3 模块划分与关系')
    pdf.write_code_block([
        'game.js',
        '  -> minigame/pixi-adapter + minigame/game-bundle.js',
        '     -> src/main.ts',
        '        -> boot/createPixiApp.ts',
        '        -> view/GameFlow.ts',
        '           -> view/LoadingView.ts',
        '           -> scene/SceneManager.ts',
        '           -> view/TabBar / AdventureView / RosterView',
        '           -> view/RecruitView / ChallengeView',
        '           -> view/DeployView / BattlePlaybackView / ShopView',
        '           -> game/MvpState.ts + game/state/*',
        '           -> battle/engine.ts + 程序决策模块 + battle/skills.ts',
        '           -> data/characterCatalog / dungeonCatalog / skillCatalog',
        '           -> core/SaveManager / AssetManager / AudioManager',
        '           -> platform/wxPlatform / AdManager / analytics',
    ])
    pdf.write_body(
        'GameFlow 是唯一编排入口: 大厅四 Tab 与 Run 节点(布阵->战斗->三选一/商店)均由它切换场景。'
        '战斗引擎不依赖 Pixi, 视图层通过回放指令渲染, 便于测试与扩展。'
    )

    pdf.write_h2('6.4 场景系统设计')
    pdf.write_table_auto(
        ['场景', '功能描述', '关键模块'],
        [
            ['loading', '底图、Logo、进度条与健康游戏忠告', 'LoadingView'],
            ['hub', '大厅四 Tab', 'TabBar + *View'],
            ['deploy', '布阵与地形', 'DeployView'],
            ['battle', '战斗回放', 'BattlePlaybackView'],
            ['loot', '三选一战利品', 'resultOverlay'],
            ['shop', '局内商店', 'ShopView'],
            ['challenge', '副本与无尽试炼入口', 'ChallengeView'],
        ],
        col_widths=[28, 58, CONTENT_W - 86],
    )

    # ==================== 七、核心模块详细设计 ====================
    pdf.write_h1('七、核心模块详细设计')
    pdf.write_h2('7.1 游戏入口模块')
    pdf.write_body(
        '游戏入口由根目录 game.js 与 src/main.ts 协同完成。game.js 作为微信小游戏启动文件, '
        '先加载 pixi-adapter, 再加载 Vite 构建后的 game-bundle.js。main.ts 在 PIXI.Application 之前'
        '打上 unsafe-eval patch, 获取 canvas, 创建 PixiHost, 实例化 GameFlow, 并预取资源清单。'
        'GameFlow 启动后先展示 LoadingView(底图、Logo、进度条与健康忠告), 资源加载完毕后直接进入大厅, '
        '无独立开始页。微信首帧 canvas 尺寸偶发未就绪时, 采用双 requestAnimationFrame 再启动。'
    )
    pdf.write_code_block([
        'require pixi-adapter',
        'require game-bundle.js',
        'pixiUnsafeEvalPatch',
        'createPixiHost(canvas)',
        'new GameFlow(host)',
        'AssetLoader.prefetchManifest()',
    ])

    pdf.write_h2('7.2 场景管理与大厅模块')
    pdf.write_body(
        'SceneManager 维护当前场景引用。切换时先 exit 旧场景再 enter 新场景, 保证同一时间只有一个业务场景响应输入。'
        '大厅由 TabBar 驱动: 招募、角色、冒险、副本四页互不重叠。顶栏展示魂晶, 底栏高度含安全区, '
        '避免全面屏 Home Indicator 遮挡点击。'
    )
    show_pic(pdf, '02_hub.jpg')
    pdf.write_table_auto(
        ['子模块', '功能说明'],
        [
            ['LoadingView', '启动底图、Logo、进度条与健康忠告'],
            ['TabBar', '四 Tab 导航与安全区垫高'],
            ['AdventureView', '章节地图、节点状态与进入 Run'],
            ['RosterView', '名册列表与角色详情'],
            ['RecruitView', '未拥有角色与魂晶解锁'],
            ['ChallengeView', '重打、活动框架与无尽试炼入口'],
            ['hubHeader', '顶栏魂晶等 Meta 资源'],
        ],
        col_widths=[40, CONTENT_W - 40],
    )
    show_pic(pdf, '04_roster.jpg')

    pdf.write_h2('7.3 战斗引擎模块')
    pdf.write_body(
        'battle/engine.ts 负责纯逻辑战斗模拟: 初始化单位、计算威胁图、执行移动与攻击、结算技能与药剂、'
        '输出回放指令。敌军行动与托管代打由程序决策模块完成: 按规则评估走位、普攻目标与技能释放时机, '
        '难度分为容易/普通/困难三档, 不依赖外部智能服务。skills.ts 与 skillDamage 计算技能形状与伤害。'
        'BattlePlaybackView 消费指令播放动画、飘字与特效, 处理手动回合输入, 并支持点击单位打开详情面板。'
    )
    show_pic(pdf, '08_battle.jpg')
    pdf.write_table_auto(
        ['子模块', '功能说明'],
        [
            ['createBattleSim', '创建战斗模拟器, 支持普通与无尽模式'],
            ['程序决策', '敌军走位与出手; 托管时同样代打我方'],
            ['skills.ts', '技能规格与施放'],
            ['damage.ts', '普攻与技能伤害'],
            ['grid.ts / path.ts', '网格与寻路'],
            ['BattlePlaybackView', '回放、单位详情、药剂、手动回合 UI'],
        ],
        col_widths=[42, CONTENT_W - 42],
    )
    pdf.write_code_block([
        'buildBattleUnits(state)',
        'createBattleSim(units, terrain, mode)',
        '  -> 按速度循环行动',
        '  -> 移动 / 普攻 / 技能 / 药剂',
        '  -> 产出 playback 指令',
        'BattlePlaybackView 播放并回调胜负',
    ])

    pdf.write_h2('7.4 布阵与地形模块')
    pdf.write_body(
        'DeployView 负责上阵与地形放置。DeployManager 校验部署行、人数上限与格子占用。'
        'terrainSpec 定义各地形效果: 高地攻击 +25%、森林承伤 -25%、城墙不可通行、'
        '河流降低输出、沼泽每回合掉血。地形券按类型计数, 放置后从本局库存扣除。'
        '开战时 undoDeployForRetry 支持失败后重新布阵。点击棋盘单位可预览敌我详情。'
    )
    show_pic(pdf, '07_deploy.jpg')

    pdf.write_h2('7.5 冒险进度与战利品模块')
    pdf.write_body(
        'dungeonCatalog 定义章节节点序列与商店池。MvpState / ProgressManager 维护当前节点、首通标记与扫荡次数。'
        '胜利后 applyVictory 发放魂晶并弹出三选一; claimLoot 把词条或药剂写入 Run。'
        'ShopManager 根据池子 rollShop, buyShopOffer 扣金币发货。'
    )
    show_pic(pdf, '09_loot.jpg')
    show_pic(pdf, '10_shop.jpg')
    pdf.write_table_auto(
        ['子模块', '功能说明'],
        [
            ['dungeonCatalog', '章节、节点、商店池、通关奖励'],
            ['ProgressManager', '节点推进、首通魂晶、扫荡'],
            ['lootRoll', '战后三选一随机与展示'],
            ['ShopManager', '补给点商品刷新与购买'],
            ['resultOverlay', '战利品卡片与结算 UI'],
        ],
        col_widths=[40, CONTENT_W - 40],
    )

    pdf.write_h2('7.6 无尽试炼模块')
    pdf.write_body(
        '无尽试炼不进入冒险章节表, 由 endlessCatalog 单独定义, 避免"每个副本都有商店池"的契约误伤。'
        '布阵一次后同图连战: applyEndlessWaveVictory 入账魂晶, continueEndlessWave 把血量站位带入下一波, '
        '最多 ENDLESS_MAX_WAVES(10) 波。击杀掉落药剂需单位走过去待机拾取。'
    )
    show_pic(pdf, '11_challenge.jpg')
    show_pic(pdf, '12_endless.jpg')

    pdf.write_h2('7.7 存档与平台能力模块')
    pdf.write_body(
        'SaveManager 将 Meta 与 Run 分 key 写入微信本地存储, 启动时 loadOrCreate, 并做版本字段归一。'
        'wxPlatform 封装存储、分享与系统信息; AdManager 封装激励视频(复活、商店刷新等场景), 失败时静默降级。'
        'AssetLoader / AssetManager 从 CloudBase CDN 拉取地形、单位、特效图集; AudioManager 管理音效。'
        'analytics 模块上报关键行为事件。'
    )
    show_pic(pdf, '13_clear.jpg')

    # ==================== 八、数据结构设计 ====================
    pdf.write_h1('八、数据结构设计')
    pdf.write_h2('8.1 角色配置')
    pdf.write_code_block([
        'interface CharacterDef {',
        '  id: string',
        '  name: string',
        '  profession: UnitKind   // sword | bow | cavalry | shield',
        '  base: { maxHp, atk, spd, move }',
        '  growth: { maxHp, atk, spd, move }',
        '  skillRoute: SkillRole',
        '  defaultSkillId: string',
        '  unlockableSkillIds: string[]',
        '  unlock: starter | meta(cost) | clearDungeon(id)',
        '}',
    ])
    pdf.write_h2('8.2 副本与节点')
    pdf.write_code_block([
        'interface DungeonDef {',
        '  id, name, desc',
        '  nodes: { kind: battle|boss|shop, name, stageIndex?, enemyScale? }[]',
        '  roguelikePool: ShopPoolRow[]',
        '  metaReward, enemyScaleBase, maxParty, unlock',
        '}',
    ])
    pdf.write_h2('8.3 玩家进度数据结构')
    pdf.write_code_block([
        'MetaState: 魂晶、已解锁角色、等级、已学技能、章节通关记录',
        'RunState: 当前副本、节点下标、金币、药剂、词条、地形券、临时技能',
        '无尽: wavesCleared、携带血量与站位快照',
    ])
    pdf.write_h2('8.4 战斗单位')
    pdf.write_code_block([
        'UnitState: id, name, faction, profession, hp, maxHp, atk, spd, move,',
        '           pos, skills, mods, taunt, status effects',
    ])
    pdf.write_h2('8.5 本地存储结构')
    pdf.write_table_auto(
        ['存储键', '内容', '用途'],
        [
            ['srpg_meta_v3', 'Meta 快照与版本', '局外进度持久化'],
            ['srpg_run_v4', 'Run 快照与版本', '局内续打'],
            ['设置/音频', '本地开关', '音效偏好'],
        ],
        col_widths=[36, 48, CONTENT_W - 84],
    )

    # ==================== 九、数据接口设计 ====================
    pdf.write_h1('九、数据接口设计')
    pdf.write_h2('9.1 本地存储接口')
    pdf.write_body(
        '本地存储由 wxPlatform.safeStorageGet / safeStorageSet 封装, SaveManager 对外提供'
        'loadOrCreate 与按模块写入。存储失败时使用默认 Meta/空 Run 兜底, 不阻塞进入大厅。'
    )
    pdf.write_h2('9.2 资源与云服务接口')
    pdf.write_table_auto(
        ['接口', '功能说明'],
        [
            ['CDN 资源清单', '拉取地形、单位、特效、动画图集'],
            ['AssetManager.loadBundle', '按 bundle 加载并缓存纹理'],
            ['wujin-wenzhang-api(规划)', '后续登录鉴权与云存档'],
            ['analytics ingest', '客户端行为事件批量上报'],
        ],
        col_widths=[48, CONTENT_W - 48],
    )
    pdf.write_h2('9.3 微信平台接口')
    pdf.write_body(
        '本软件使用微信小游戏 Canvas、分包/CDN 资源、激励视频广告、本地存储和系统信息等能力。'
        '所有平台调用均通过 platform 层封装, 并在不可用或失败时静默降级, 保证核心战棋玩法可离线进行。'
    )

    # ==================== 十、出错处理设计 ====================
    pdf.write_h1('十、出错处理设计')
    pdf.write_h2('10.1 网络异常处理')
    for item in [
        'CDN 资源加载失败时使用程序绘制或纯色兜底(地形、单位 token)',
        '广告不可用时对应入口提示或隐藏, 不中断战斗与大厅',
        '分析上报失败时丢弃或下次重试, 不阻塞游戏',
        '动画图集后台加载失败时回退静态贴图',
    ]:
        pdf.write_bullet(item)
    pdf.write_h2('10.2 数据异常处理')
    for item in [
        '存档 JSON 解析失败或版本不匹配时归一字段或回退默认结构',
        '废弃字段(旧精华、旧词条键空间)读取时主动丢弃, 避免静默错绑',
        '配置缺失(技能、角色、副本)时跳过并记录警告, 防止初始化中断',
        '非法格子或超出部署行的布阵操作被校验拒绝',
    ]:
        pdf.write_bullet(item)
    pdf.write_h2('10.3 运行时异常处理')
    for item in [
        'GameGlobal.onError / onUnhandledRejection 捕获全局异常并打印',
        '场景退出时销毁 Pixi 容器与临时监听, 避免跨场景残留',
        '资源未就绪时按钮提示"资源加载中", 防止空纹理开战',
        '输入在动画锁定或弹窗期间提前返回, 避免重复触发',
    ]:
        pdf.write_bullet(item)

    # ==================== 十一、性能优化设计 ====================
    pdf.write_h1('十一、性能优化设计')
    pdf.write_h2('11.1 资源管理优化')
    for item in [
        'UI 与字体打入首包, 地形/单位/特效走 CloudBase CDN, 降低首包体积',
        'AssetManager 按 bundle 缓存纹理, 避免重复创建 Texture',
        '战斗前按需预加载本场 Boss 外观与技能特效图集',
        '场景退出时销毁动态容器和文本节点, 减少内存泄漏',
    ]:
        pdf.write_bullet(item)
    pdf.write_h2('11.2 渲染性能优化')
    for item in [
        '使用 PixiJS 7 承担精灵批处理、纹理管理和 WebGL 舞台渲染',
        '单位 token 与棋盘格子复用辅助绘制函数, 缺图时纯色/几何兜底',
        '战斗飘字与火花特效播完即移除, 避免节点堆积',
        '大厅 Tab 切换只重建当前页, 保留章节页码状态',
    ]:
        pdf.write_bullet(item)
    pdf.write_h2('11.3 加载与包体优化')
    for item in [
        'Vite 构建输出单一小游戏 bundle, 便于微信小游戏加载',
        '加载页展示提示, 避免白屏等待',
        '双 rAF 启动规避微信首帧 canvas 尺寸未就绪',
        '战斗逻辑与渲染分离, 引擎可在测试环境无 Pixi 运行',
    ]:
        pdf.write_bullet(item)


def write_pic_requirements():
    PICS_DIR.mkdir(parents=True, exist_ok=True)
    target = PICS_DIR / '截图清单.txt'
    lines = [
        '无尽纹章软著截图清单',
        '',
        '请按以下文件名放入 JPG/PNG 截图。推荐使用竖屏手机实机截图，尽量保留完整小游戏画面。',
        '脚本优先读取对应文件名。实机截图放入本目录后重新运行 generate_softcopyright_doc_pdf.py 即可更新说明书。',
        '',
    ]
    for filename, caption, requirement in PIC_SPECS:
        lines.append(f'{filename} - {caption}')
        lines.append(f'  {requirement}')
        lines.append('')
    target.write_text('\n'.join(lines).rstrip() + '\n', encoding='utf-8')


def main():
    write_pic_requirements()
    pdf = DocPDF()
    pdf.add_font('Songti', '', SONGTI_PATH)
    write_document(pdf)
    pdf.output(str(OUTPUT))

    from pypdf import PdfReader
    reader = PdfReader(str(OUTPUT))
    total = len(reader.pages)

    print('=' * 50)
    print('  软著文档鉴别材料(设计说明书) PDF 生成报告')
    print('=' * 50)
    print(f'  软件名称:     {SOFTWARE_FULL_NAME} {SOFTWARE_VERSION}')
    print(f'  申请人:       {APPLICANT_NAME}')
    print(f'  文档类型:     设计说明书')
    print(f'  生成页数:     {total} 页')
    print(f'  输出文件:     {OUTPUT}')
    print(f'  截图目录:     {PICS_DIR}')
    print('=' * 50)
    if total <= 60:
        print('  文档不足60页，全部提交即可')
    else:
        print('  文档超过60页，需要提交前30页+后30页')
    print('  文档生成完毕')


if __name__ == '__main__':
    main()
