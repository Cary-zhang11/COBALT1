"""
docx2text.py - 将 .docx 文件转换为带样式标记的 Markdown 文本，并提取内嵌图片。

用法：
    python docx2text.py <docx文件路径> [--output-dir <输出目录>]

输出：
    1. <输出目录>/<文件名>_source.md   - 带样式标记的 Markdown 文本（标题层级、加粗、下划线、编号等）
    2. <输出目录>/<文件名>_images/  - 提取的图片文件
    图片在文本中以 ![image](相对路径) 标记位置

依赖：仅 Python 标准库（zipfile, xml.etree），无需安装第三方包。
"""

import zipfile
import xml.etree.ElementTree as ET
import sys
import os
import re
import argparse

# Wingdings 字体私有区字符 → 标准 Unicode 映射
# 编码规则：私有区 0xF000 + ASCII位置 = Wingdings 字形
WINGDINGS_TO_UNICODE = {
    0xF020: ' ',
    0xF021: '✉',
    0xF028: '(',
    0xF029: ')',
    0xF038: '■',   # position 56 → 实心方块
    0xF06C: '●',   # position 108 → 实心圆（常用一级项目符号）
    0xF06E: '○',   # position 110 → 空心圆（常用二级项目符号）
    0xF075: '■',   # position 117 → 实心方块（常用三级项目符号）
    0xF076: '❑',
    0xF077: '❒',
    0xF0A1: '□',   # position 161 → 空心方块（ballot box open）
    0xF0A7: '■',
    0xF0A8: '☐',   # position 168 → 复选框（空）
    0xF0B2: '➔',
    0xF0B7: '•',   # position 183 → 圆点
    0xF0D8: '➤',
    0xF0E0: '➔',   # position 224 → 箭头
    0xF0FC: '✓',
    0xF0FE: '☑',   # 已勾选复选框
    0xF0FF: '☒',
}

WINGDINGS2_TO_UNICODE = {
    0xF028: '(',
    0xF029: ')',
    0xF038: '■',   # position 56 → 实心方块
    0xF052: '✓',
    0xF054: '☐',
    0xF056: '☑',
    0xF0A8: '☐',
    0xF0FC: '✓',
}

# Symbol 字体私有区字符 → 标准 Unicode 映射（常用数学/希腊字母）
SYMBOL_TO_UNICODE = {
    0xF020: ' ',
    0xF061: 'α', 0xF062: 'β', 0xF063: 'χ', 0xF064: 'δ', 0xF065: 'ε',
    0xF066: 'φ', 0xF067: 'γ', 0xF068: 'η', 0xF069: 'ι', 0xF06A: 'ϕ',
    0xF06B: 'κ', 0xF06C: 'λ', 0xF06D: 'μ', 0xF06E: 'ν', 0xF06F: 'ο',
    0xF070: 'π', 0xF071: 'θ', 0xF072: 'ρ', 0xF073: 'σ', 0xF074: 'τ',
    0xF075: 'υ', 0xF076: 'ω', 0xF077: 'ξ', 0xF078: 'ψ', 0xF079: 'ζ',
    0xF0A3: '≤', 0xF0B1: '±', 0xF0B3: '≥', 0xF0B4: '×', 0xF0B8: '÷',
    0xF0B9: '≠', 0xF0BB: '↔', 0xF0BC: '←', 0xF0BD: '↑', 0xF0BE: '→',
    0xF0BF: '↓', 0xF0C0: '°', 0xF0D0: '∞', 0xF0D4: '∂',
}


def map_font_char(code_int, font_name):
    """将 Wingdings/Symbol 字体私有区字符映射到标准 Unicode，无映射返回 None"""
    font_lower = (font_name or '').lower().replace(' ', '')
    if 'wingdings2' in font_lower:
        return WINGDINGS2_TO_UNICODE.get(code_int)
    elif 'wingdings' in font_lower:
        return WINGDINGS_TO_UNICODE.get(code_int)
    elif 'symbol' in font_lower:
        return SYMBOL_TO_UNICODE.get(code_int)
    # 通用私有区回退：F000-F0FF 范围尝试 Wingdings
    if 0xF000 <= code_int <= 0xF0FF:
        return WINGDINGS_TO_UNICODE.get(code_int)
    return None


# Word Open XML 命名空间
NS = {
    'w':  'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
    'r':  'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
    'wp': 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing',
    'a':  'http://schemas.openxmlformats.org/drawingml/2006/main',
    'pic': 'http://schemas.openxmlformats.org/drawingml/2006/picture',
    'rel': 'http://schemas.openxmlformats.org/package/2006/relationships',
    'v':  'urn:schemas-microsoft-com:vml',
    'mc': 'http://schemas.openxmlformats.org/markup-compatibility/2006',
}


def parse_relationships(zip_file):
    """解析 word/_rels/document.xml.rels，建立 rId → Target 映射"""
    rels = {}
    try:
        rels_xml = zip_file.read('word/_rels/document.xml.rels')
        root = ET.fromstring(rels_xml)
        for rel in root:
            rid = rel.get('Id', '')
            target = rel.get('Target', '')
            rels[rid] = target
    except KeyError:
        pass
    return rels


def get_numbering_map(zip_file):
    """解析 word/numbering.xml，建立 numId+ilvl → 编号信息映射"""
    num_map = {}
    try:
        numbering_xml = zip_file.read('word/numbering.xml')
        root = ET.fromstring(numbering_xml)

        # 先解析 abstractNum
        abstract_nums = {}
        for an in root.findall('.//w:abstractNum', NS):
            an_id = an.get(f'{{{NS["w"]}}}abstractNumId', '')
            levels = {}
            for lvl in an.findall('w:lvl', NS):
                ilvl = lvl.get(f'{{{NS["w"]}}}ilvl', '0')
                num_fmt_elem = lvl.find('w:numFmt', NS)
                num_fmt = num_fmt_elem.get(f'{{{NS["w"]}}}val', 'decimal') if num_fmt_elem is not None else 'decimal'
                # 提取编号文本（如 bullet 的 ● ○ 或数字编号的 "%1."）
                bullet_char = ''
                lvl_text = lvl.find('w:lvlText', NS)
                if lvl_text is not None:
                    val = lvl_text.get(f'{{{NS["w"]}}}val', '')
                    bullet_char = val if val else ''
                # 提取 bullet 使用的字体（Wingdings/Symbol 等私有区字体需要映射）
                bullet_font = ''
                lvl_rpr = lvl.find('w:rPr', NS)
                if lvl_rpr is not None:
                    rfonts = lvl_rpr.find('w:rFonts', NS)
                    if rfonts is not None:
                        bullet_font = (
                            rfonts.get(f'{{{NS["w"]}}}ascii', '') or
                            rfonts.get(f'{{{NS["w"]}}}hAnsi', '') or
                            rfonts.get(f'{{{NS["w"]}}}cs', '') or
                            rfonts.get(f'{{{NS["w"]}}}hint', '')
                        )
                levels[ilvl] = {'num_fmt': num_fmt, 'bullet': bullet_char, 'bullet_font': bullet_font}
            abstract_nums[an_id] = levels

        # 再解析 num → abstractNumId 映射
        for num in root.findall('.//w:num', NS):
            num_id = num.get(f'{{{NS["w"]}}}numId', '')
            an_ref = num.find('w:abstractNumId', NS)
            if an_ref is not None:
                an_id = an_ref.get(f'{{{NS["w"]}}}val', '')
                if an_id in abstract_nums:
                    num_map[num_id] = abstract_nums[an_id]
    except KeyError:
        pass
    return num_map


def get_heading_level(style_name):
    """从样式名称推断标题层级"""
    if not style_name:
        return 0
    s = style_name.lower().replace(' ', '')
    # heading 1-6
    m = re.search(r'heading(\d)', s)
    if m:
        return int(m.group(1))
    # 石墨文档等中文编辑器样式: "shimo heading 2"
    m = re.search(r'shimoheading(\d)', s)
    if m:
        return int(m.group(1))
    return 0


def get_style_map(zip_file):
    """解析 word/styles.xml，建立 styleId → styleName 映射"""
    style_map = {}
    try:
        styles_xml = zip_file.read('word/styles.xml')
        root = ET.fromstring(styles_xml)
        for style in root.findall('.//w:style', NS):
            style_id = style.get(f'{{{NS["w"]}}}styleId', '')
            name_elem = style.find('w:name', NS)
            name = name_elem.get(f'{{{NS["w"]}}}val', '') if name_elem is not None else style_id
            style_map[style_id] = name
    except KeyError:
        pass
    return style_map


def extract_images(zip_file, image_dir):
    """提取 word/media/ 下所有图片，返回 {文件名: 输出路径}"""
    images = {}
    os.makedirs(image_dir, exist_ok=True)
    for name in zip_file.namelist():
        if name.startswith('word/media/'):
            filename = os.path.basename(name)
            if not filename:
                continue
            out_path = os.path.join(image_dir, filename)
            with zip_file.open(name) as src, open(out_path, 'wb') as dst:
                dst.write(src.read())
            # word/media/image1.png → media/image1.png
            images[name.replace('word/', '', 1)] = out_path
    return images


def find_image_rids(elem):
    """在段落元素中查找所有图片的 rId"""
    rids = []
    # drawing > blipFill > blip
    for blip in elem.findall('.//a:blip', NS):
        rid = blip.get(f'{{{NS["r"]}}}embed', '')
        if rid:
            rids.append(rid)
    # VML (旧格式) v:imagedata
    for imgdata in elem.findall('.//v:imagedata', NS):
        rid = imgdata.get(f'{{{NS["r"]}}}id', '')
        if rid:
            rids.append(rid)
    return rids


def run_has_strikethrough(run_elem):
    """判断 run 是否有删除线（strikethrough）"""
    rPr = run_elem.find('w:rPr', NS)
    if rPr is None:
        return False
    strike = rPr.find('w:strike', NS)
    if strike is not None:
        val = strike.get(f'{{{NS["w"]}}}val', 'true')
        return val.lower() not in ('false', '0')
    return False


def run_has_bold(run_elem):
    """判断 run 是否加粗"""
    rPr = run_elem.find('w:rPr', NS)
    if rPr is None:
        return False
    b = rPr.find('w:b', NS)
    if b is None:
        return False
    val = b.get(f'{{{NS["w"]}}}val', 'true')
    return val.lower() not in ('false', '0')


def run_has_italic(run_elem):
    """判断 run 是否斜体"""
    rPr = run_elem.find('w:rPr', NS)
    if rPr is None:
        return False
    i = rPr.find('w:i', NS)
    if i is None:
        return False
    val = i.get(f'{{{NS["w"]}}}val', 'true')
    return val.lower() not in ('false', '0')


def run_has_underline(run_elem):
    """判断 run 是否有下划线"""
    rPr = run_elem.find('w:rPr', NS)
    if rPr is None:
        return False
    u = rPr.find('w:u', NS)
    if u is None:
        return False
    val = u.get(f'{{{NS["w"]}}}val', 'none')
    return val.lower() not in ('none', 'false', '0')


def run_has_highlight(run_elem):
    """获取 run 的高亮颜色，无高亮返回 None"""
    rPr = run_elem.find('w:rPr', NS)
    if rPr is None:
        return None
    hl = rPr.find('w:highlight', NS)
    if hl is None:
        return None
    val = hl.get(f'{{{NS["w"]}}}val', '')
    return val if val and val != 'none' else None


def run_get_vert_align(run_elem):
    """获取 run 的垂直对齐（superscript/subscript），无则返回 None"""
    rPr = run_elem.find('w:rPr', NS)
    if rPr is None:
        return None
    va = rPr.find('w:vertAlign', NS)
    if va is None:
        return None
    return va.get(f'{{{NS["w"]}}}val', None)


def run_has_color(run_elem):
    """获取 run 的字体颜色"""
    rPr = run_elem.find('w:rPr', NS)
    if rPr is None:
        return None
    color = rPr.find('w:color', NS)
    if color is None:
        return None
    val = color.get(f'{{{NS["w"]}}}val', '')
    if val and val.lower() not in ('000000', 'auto'):
        return val
    return None


def get_hyperlink_url(elem, rels):
    """从 w:hyperlink 元素获取 URL"""
    rid = elem.get(f'{{{NS["r"]}}}id', '')
    if rid and rid in rels:
        return rels[rid]
    return None


def run_is_hidden(run_elem):
    """判断 run 是否设置了隐藏（w:vanish），隐藏内容在 Word 中不可见，应跳过"""
    rPr = run_elem.find('w:rPr', NS)
    if rPr is None:
        return False
    vanish = rPr.find('w:vanish', NS)
    if vanish is not None:
        val = vanish.get(f'{{{NS["w"]}}}val', 'true')
        return val.lower() not in ('false', '0')
    return False


def get_paragraph_align(para_elem):
    """获取段落对齐方式，返回 'center'/'right'，或 None（默认左对齐）"""
    pPr = para_elem.find('w:pPr', NS)
    if pPr is not None:
        jc = pPr.find('w:jc', NS)
        if jc is not None:
            val = jc.get(f'{{{NS["w"]}}}val', '')
            if val == 'center':
                return 'center'
            if val in ('right', 'end'):
                return 'right'
    return None


def find_image_info(elem):
    """在元素中查找所有图片的 rId 及尺寸，返回 [(rId, width_px, height_px)]。
    尺寸来自 wp:extent（单位 EMU，9525 EMU = 1px @ 96 DPI）。"""
    results = []
    EMU_PER_PX = 9525  # 914400 EMU/inch ÷ 96 DPI

    for container_tag in ('wp:inline', 'wp:anchor'):
        for container in elem.findall(f'.//{container_tag}', NS):
            extent = container.find('wp:extent', NS)
            w_px = h_px = 0
            if extent is not None:
                try:
                    w_px = round(int(extent.get('cx', 0)) / EMU_PER_PX)
                    h_px = round(int(extent.get('cy', 0)) / EMU_PER_PX)
                except (ValueError, TypeError):
                    pass
            for blip in container.findall('.//a:blip', NS):
                rid = blip.get(f'{{{NS["r"]}}}embed', '')
                if rid:
                    results.append((rid, w_px, h_px))

    for imgdata in elem.findall('.//v:imagedata', NS):
        rid = imgdata.get(f'{{{NS["r"]}}}id', '')
        if rid:
            results.append((rid, 0, 0))

    return results


def parse_footnotes(zip_file, rels, style_map, num_map, image_dir_rel):
    """解析 word/footnotes.xml，返回 {footnote_id_str: text}"""
    result = {}
    try:
        root = ET.fromstring(zip_file.read('word/footnotes.xml'))
        for fn in root.findall('.//w:footnote', NS):
            fn_id = fn.get(f'{{{NS["w"]}}}id', '')
            try:
                if int(fn_id) < 1:
                    continue
            except ValueError:
                continue
            texts, counters = [], {}
            for p in fn.findall('.//w:p', NS):
                line, _, _ = parse_paragraph(p, rels, style_map, num_map, image_dir_rel, counters)
                if line:
                    texts.append(line)
            result[fn_id] = ' '.join(texts)
    except (KeyError, ET.ParseError):
        pass
    return result


def parse_endnotes(zip_file, rels, style_map, num_map, image_dir_rel):
    """解析 word/endnotes.xml，返回 {endnote_id_str: text}"""
    result = {}
    try:
        root = ET.fromstring(zip_file.read('word/endnotes.xml'))
        for en in root.findall('.//w:endnote', NS):
            en_id = en.get(f'{{{NS["w"]}}}id', '')
            try:
                if int(en_id) < 1:
                    continue
            except ValueError:
                continue
            texts, counters = [], {}
            for p in en.findall('.//w:p', NS):
                line, _, _ = parse_paragraph(p, rels, style_map, num_map, image_dir_rel, counters)
                if line:
                    texts.append(line)
            result[en_id] = ' '.join(texts)
    except (KeyError, ET.ParseError):
        pass
    return result


def detect_columns(zip_file):
    """检测文档是否有多栏布局，返回栏数（1 表示单栏）"""
    try:
        root = ET.fromstring(zip_file.read('word/document.xml'))
        body = root.find('w:body', NS)
        if body is not None:
            sectPr = body.find('w:sectPr', NS)
            if sectPr is not None:
                cols = sectPr.find('w:cols', NS)
                if cols is not None:
                    try:
                        return int(cols.get(f'{{{NS["w"]}}}num', '1'))
                    except ValueError:
                        pass
    except (KeyError, ET.ParseError):
        pass
    return 1


def extract_run_text(run_elem):
    """
    从单个 run 提取文本，包含：
    - w:t 普通文本
    - w:sym 特殊符号字符
    - w:tab 制表符（转为四个空格）
    - w:br 软换行（转为换行标记）
    """
    parts = []
    for child in run_elem:
        tag = child.tag.split('}')[-1] if '}' in child.tag else child.tag
        if tag == 't':
            if child.text:
                parts.append(child.text)
        elif tag == 'sym':
            # w:sym 特殊符号，优先用字体映射转换 Wingdings/Symbol 私有区字符
            char_code = child.get(f'{{{NS["w"]}}}char', '')
            font = child.get(f'{{{NS["w"]}}}font', '')
            if char_code:
                try:
                    code_int = int(char_code, 16)
                    mapped = map_font_char(code_int, font)
                    parts.append(mapped if mapped is not None else chr(code_int))
                except (ValueError, OverflowError):
                    pass
        elif tag == 'tab':
            # 制表符转为四个空格
            parts.append('    ')
        elif tag == 'br':
            br_type = child.get(f'{{{NS["w"]}}}type', '')
            if br_type == 'page':
                parts.append('\n---\n')
            else:
                parts.append('  \n')
    return ''.join(parts)


def apply_run_formatting(text, run_elem):
    """
    对文本应用 run 的格式标记，返回格式化后的字符串。
    应用顺序：上标/下标 → 粗体/斜体 → 下划线 → 高亮 → 颜色
    """
    if not text:
        return text

    vert_align = run_get_vert_align(run_elem)
    if vert_align == 'superscript':
        text = f'<sup>{text}</sup>'
    elif vert_align == 'subscript':
        text = f'<sub>{text}</sub>'

    is_bold = run_has_bold(run_elem)
    is_italic = run_has_italic(run_elem)
    if is_bold and is_italic:
        text = f'***{text}***'
    elif is_bold:
        text = f'**{text}**'
    elif is_italic:
        text = f'*{text}*'

    if run_has_underline(run_elem):
        text = f'<u>{text}</u>'

    highlight = run_has_highlight(run_elem)
    if highlight:
        text = f'<mark>{text}</mark>'

    color = run_has_color(run_elem)
    if color:
        text = f'<span style="color:#{color}">{text}</span>'

    return text


def extract_textbox_text(elem, rels, style_map, num_map, image_dir_rel, counters):
    """递归提取文本框（w:textbox/w:txbxContent）内的所有段落文本"""
    lines = []
    for txbx in elem.findall('.//w:txbxContent', NS):
        for p in txbx.findall('w:p', NS):
            line, _, _ = parse_paragraph(p, rels, style_map, num_map, image_dir_rel, counters)
            if line:
                lines.append(line)
    return lines


def parse_paragraph(para_elem, rels, style_map, num_map, image_dir_rel, counters,
                    footnotes=None, endnotes=None, fn_counter=None):
    """
    解析单个段落，返回 (markdown_line, is_heading, heading_level)

    支持：隐藏文本过滤、段落对齐、修订痕迹(ins/del)、域代码HYPERLINK、脚注引用。
    footnotes/endnotes: {id: text} 字典；fn_counter: [int] 单元素列表（可变引用）。
    """
    if footnotes is None:
        footnotes = {}
    if endnotes is None:
        endnotes = {}
    if fn_counter is None:
        fn_counter = [0]

    # 段落属性
    pPr = para_elem.find('w:pPr', NS)

    # 样式判定
    style_name = ''
    if pPr is not None:
        pStyle = pPr.find('w:pStyle', NS)
        if pStyle is not None:
            style_id = pStyle.get(f'{{{NS["w"]}}}val', '')
            style_name = style_map.get(style_id, style_id)

    heading_level = get_heading_level(style_name)

    # 对齐方式
    align = get_paragraph_align(para_elem)

    # 编号判定
    num_prefix = ''
    if pPr is not None:
        numPr = pPr.find('w:numPr', NS)
        if numPr is not None:
            ilvl_elem = numPr.find('w:ilvl', NS)
            numId_elem = numPr.find('w:numId', NS)
            ilvl = ilvl_elem.get(f'{{{NS["w"]}}}val', '0') if ilvl_elem is not None else '0'
            numId = numId_elem.get(f'{{{NS["w"]}}}val', '') if numId_elem is not None else ''

            if numId and numId in num_map:
                levels = num_map[numId]
                level_info = levels.get(ilvl, {})
                num_fmt = level_info.get('num_fmt', 'decimal') if isinstance(level_info, dict) else 'decimal'
                bullet_char = level_info.get('bullet', '') if isinstance(level_info, dict) else ''
                bullet_font = level_info.get('bullet_font', '') if isinstance(level_info, dict) else ''
                indent = '  ' * int(ilvl)

                counter_key = f'{numId}_{ilvl}'
                if num_fmt == 'bullet':
                    marker = bullet_char if bullet_char else '-'
                    if bullet_char and len(bullet_char) == 1:
                        mapped = map_font_char(ord(bullet_char), bullet_font)
                        if mapped is not None:
                            marker = mapped
                    num_prefix = f'{indent}{marker} '
                else:
                    # 检查是否有 lvlOverride/startOverride（强制重置编号）
                    counters[counter_key] = counters.get(counter_key, 0) + 1
                    num_prefix = f'{indent}{counters[counter_key]}. '
            elif numId:
                num_prefix = '- '

    # 收集段落文本（带格式标记）
    parts = []
    has_image = [False]  # 用列表使嵌套函数可修改

    # 域代码状态机：跟踪 HYPERLINK 等域代码
    field_state = [None]   # None | 'instr' | 'display'
    field_instr = ['']
    field_display = []

    def flush_field():
        """将当前域代码作为超链接或普通文本输出"""
        display_text = ''.join(field_display).strip()
        instr = field_instr[0].strip()
        m = re.search(r'HYPERLINK\s+"([^"]+)"', instr, re.IGNORECASE)
        if m and display_text:
            parts.append(f'[{display_text}]({m.group(1)})')
        elif display_text:
            parts.append(display_text)
        field_state[0] = None
        field_instr[0] = ''
        field_display.clear()

    def process_run(r):
        """处理单个 run，含隐藏文本过滤、域代码状态机、图片、格式化文本"""
        if run_has_strikethrough(r) or run_is_hidden(r):
            return

        # 检查域代码控制字符
        for fld in r.findall('w:fldChar', NS):
            ftype = fld.get(f'{{{NS["w"]}}}fldCharType', '')
            if ftype == 'begin':
                field_state[0] = 'instr'
                field_instr[0] = ''
                field_display.clear()
            elif ftype == 'separate':
                field_state[0] = 'display'
            elif ftype == 'end':
                flush_field()
            return  # fldChar run 不含可见文本

        # 域代码指令文本
        instr_elem = r.find('w:instrText', NS)
        if instr_elem is not None and instr_elem.text:
            field_instr[0] += instr_elem.text
            return

        # 脚注引用
        fn_ref = r.find('.//w:footnoteReference', NS)
        if fn_ref is not None:
            fn_counter[0] += 1
            parts.append(f'[^{fn_counter[0]}]')
            return

        # 尾注引用
        en_ref = r.find('.//w:endnoteReference', NS)
        if en_ref is not None:
            fn_counter[0] += 1
            parts.append(f'[^{fn_counter[0]}]')
            return

        # 图片（含尺寸）
        img_info = find_image_info(r)
        if img_info:
            for rid, w_px, h_px in img_info:
                if rid in rels:
                    img_filename = os.path.basename(rels[rid])
                    img_rel_path = f'{image_dir_rel}/{img_filename}'
                    size_attr = f'{{width={w_px}px}}' if w_px else ''
                    img_md = f'![image]({img_rel_path}){size_attr}'
                    if field_state[0] == 'display':
                        field_display.append(img_md)
                    else:
                        parts.append(img_md)
                        has_image[0] = True
            return

        # 普通文本
        text = extract_run_text(r)
        if not text:
            return

        formatted = apply_run_formatting(text, r)
        if field_state[0] == 'display':
            field_display.append(formatted)
        else:
            parts.append(formatted)

    for child in para_elem:
        tag = child.tag.split('}')[-1] if '}' in child.tag else child.tag

        if tag == 'r':
            process_run(child)

        elif tag == 'ins':
            # 修订痕迹：接受插入内容
            for r in child.findall('w:r', NS):
                process_run(r)

        elif tag == 'del':
            # 修订痕迹：跳过删除内容
            pass

        elif tag == 'hyperlink':
            url = get_hyperlink_url(child, rels)
            link_parts = []
            for r in child.findall('w:r', NS):
                if run_has_strikethrough(r) or run_is_hidden(r):
                    continue
                link_parts.append(extract_run_text(r))
            link_text = ''.join(link_parts)
            if url and link_text:
                parts.append(f'[{link_text}]({url})')
            elif link_text:
                parts.append(link_text)

        elif tag == 'sdt':
            for r in child.findall('.//w:r', NS):
                process_run(r)

        # 独立图片（不在 r 内的 drawing）
        if tag not in ('r', 'ins', 'del', 'hyperlink', 'sdt'):
            for rid, w_px, h_px in find_image_info(child):
                if rid in rels:
                    img_filename = os.path.basename(rels[rid])
                    img_rel_path = f'{image_dir_rel}/{img_filename}'
                    size_attr = f'{{width={w_px}px}}' if w_px else ''
                    parts.append(f'![image]({img_rel_path}){size_attr}')
                    has_image[0] = True

    # 处理未关闭的域代码
    if field_state[0] == 'display' and field_display:
        flush_field()

    full_text = ''.join(parts).strip()
    if not full_text and not has_image[0]:
        return '', False, 0

    # 段落对齐包装
    if align in ('center', 'right') and not heading_level:
        full_text = f'<p align="{align}">{full_text}</p>'

    # 组装 Markdown 行
    if heading_level > 0:
        prefix = '#' * heading_level + ' '
        return f'{prefix}{full_text}', True, heading_level
    elif num_prefix:
        return f'{num_prefix}{full_text}', False, 0
    else:
        return full_text, False, 0


def _escape_cell(text):
    """转义单元格文本中的管道符，防止破坏 Markdown 表格结构"""
    return text.replace('|', '\\|')


def _get_grid_span(tc):
    """获取单元格水平合并跨度（gridSpan），默认为 1"""
    tcPr = tc.find('w:tcPr', NS)
    if tcPr is not None:
        gs = tcPr.find('w:gridSpan', NS)
        if gs is not None:
            return int(gs.get(f'{{{NS["w"]}}}val', '1'))
    return 1


def _is_vmerge_continuation(tc):
    """判断单元格是否为垂直合并的从属单元格（非起始行）"""
    tcPr = tc.find('w:tcPr', NS)
    if tcPr is not None:
        vm = tcPr.find('w:vMerge', NS)
        if vm is not None:
            val = vm.get(f'{{{NS["w"]}}}val', '')
            return val != 'restart'
    return False


def _get_paragraph_indent_level(p):
    """获取段落的缩进层级，基于 w:ind/left 值。每 360 twips 为一级"""
    pPr = p.find('w:pPr', NS)
    if pPr is not None:
        ind = pPr.find('w:ind', NS)
        if ind is not None:
            left = ind.get(f'{{{NS["w"]}}}left', '')
            if left:
                try:
                    return int(left) // 360
                except ValueError:
                    pass
    return 0


def _get_paragraph_numbering_info(p, num_map, counters, counter_prefix='', use_nbsp=False):
    """获取段落的编号信息，返回缩进前缀和计数 key。
    use_nbsp=True 时用 &nbsp; 代替空格，防止 HTML 表格中缩进被折叠。"""
    pPr = p.find('w:pPr', NS)
    if pPr is None:
        return '', ''
    numPr = pPr.find('w:numPr', NS)
    if numPr is None:
        return '', ''
    ilvl_elem = numPr.find('w:ilvl', NS)
    numId_elem = numPr.find('w:numId', NS)
    ilvl = ilvl_elem.get(f'{{{NS["w"]}}}val', '0') if ilvl_elem is not None else '0'
    numId = numId_elem.get(f'{{{NS["w"]}}}val', '') if numId_elem is not None else ''
    if not numId or numId not in num_map:
        return '', ''
    levels = num_map[numId]
    if ilvl not in levels:
        return '', ''
    info = levels[ilvl]
    num_fmt = info['num_fmt']
    bullet_char = info['bullet']
    bullet_font = info.get('bullet_font', '')
    indent_unit = '&nbsp;&nbsp;' if use_nbsp else '  '
    indent = indent_unit * int(ilvl)
    counter_key = f'{counter_prefix}{numId}_{ilvl}'
    if num_fmt == 'bullet':
        marker = bullet_char if bullet_char else '-'
        if bullet_char and len(bullet_char) == 1:
            mapped = map_font_char(ord(bullet_char), bullet_font)
            if mapped is not None:
                marker = mapped
        return f'{indent}{marker} ', ''
    else:
        counters[counter_key] = counters.get(counter_key, 0) + 1
        return f'{indent}{counters[counter_key]}. ', counter_key


def _format_run_texts(runs):
    """从 runs 中提取带完整格式标记的文本（含隐藏过滤、下划线、高亮、上标/下标等）"""
    parts = []
    for r in runs:
        if run_has_strikethrough(r) or run_is_hidden(r):
            continue
        text = extract_run_text(r)
        if not text:
            continue
        parts.append(apply_run_formatting(text, r))
    return ''.join(parts)


def parse_table(table_elem, rels, style_map, num_map, image_dir_rel=''):
    """解析表格为 Markdown 表格格式，支持合并单元格、内嵌图片、段落缩进和编号"""
    rows = table_elem.findall('w:tr', NS)
    if not rows:
        return ''

    table_data = []
    for tr in rows:
        cells = tr.findall('w:tc', NS)
        row_data = []
        for tc in cells:
            span = _get_grid_span(tc)

            if _is_vmerge_continuation(tc):
                row_data.extend([''] * span)
                continue

            cell_parts = []
            cell_counters = {}  # 单元格内独立的编号计数器
            for p in tc.findall('w:p', NS):
                # 获取缩进层级
                indent_level = _get_paragraph_indent_level(p)

                # 获取编号信息（表格内用 &nbsp; 防止空格被 HTML 折叠）
                num_prefix, counter_key = _get_paragraph_numbering_info(
                    p, num_map, cell_counters, use_nbsp=True
                )

                # 获取带格式的文本
                text = _format_run_texts(p.findall('.//w:r', NS))

                # 计算前缀（表格内缩进用 &nbsp; 避免折叠）
                prefix = ''
                if num_prefix:
                    prefix = num_prefix
                elif indent_level > 0:
                    prefix = '&nbsp;&nbsp;' * indent_level + '- '

                if text:
                    cell_parts.append(_escape_cell(f'{prefix}{text}'))

                # 图片
                for rid in find_image_rids(p):
                    if rid in rels:
                        img_filename = os.path.basename(rels[rid])
                        cell_parts.append(f'![image]({image_dir_rel}/{img_filename})')

            cell_content = ' <br> '.join(cell_parts)
            row_data.append(cell_content)
            for _ in range(span - 1):
                row_data.append('')

        table_data.append(row_data)

    if not table_data:
        return ''

    max_cols = max(len(row) for row in table_data)
    for row in table_data:
        while len(row) < max_cols:
            row.append('')

    lines = []
    lines.append('| ' + ' | '.join(table_data[0]) + ' |')
    lines.append('| ' + ' | '.join(['---'] * max_cols) + ' |')
    for row in table_data[1:]:
        lines.append('| ' + ' | '.join(row) + ' |')

    return '\n'.join(lines)


def _detect_unsupported_elements(body, zip_file):
    """检测文档中可能未被完整解析的元素，返回警告列表"""
    warn = []
    if body.find('.//w:object', NS) is not None:
        warn.append('嵌入对象/OLE')
    if body.find('.//mc:AlternateContent', NS) is not None:
        warn.append('SmartArt/图形对象')
    col_num = detect_columns(zip_file)
    if col_num > 1:
        warn.append(f'多栏布局({col_num}栏，内容顺序可能与视觉不符，建议人工复核)')
    return warn


def docx_to_markdown(docx_path, output_dir=None):
    """主函数：将 docx 转换为 Markdown"""
    if not os.path.exists(docx_path):
        print(f'[错误] 文件不存在: {docx_path}')
        sys.exit(1)

    base_name = os.path.splitext(os.path.basename(docx_path))[0]

    if output_dir is None:
        output_dir = os.path.dirname(docx_path) or '.'

    os.makedirs(output_dir, exist_ok=True)

    md_path = os.path.join(output_dir, f'{base_name}_source.md')
    image_dir = os.path.join(output_dir, f'{base_name}_images')
    image_dir_rel = f'{base_name}_images'

    with zipfile.ZipFile(docx_path, 'r') as z:
        rels = parse_relationships(z)
        style_map = get_style_map(z)
        num_map = get_numbering_map(z)
        images = extract_images(z, image_dir)

        doc_xml = z.read('word/document.xml')
        root = ET.fromstring(doc_xml)
        body = root.find('w:body', NS)
        if body is None:
            print('[错误] 无法找到文档主体')
            sys.exit(1)

        # 预加载脚注/尾注
        fn_counter = [0]  # 可变引用，跨段落累计脚注序号
        footnotes = parse_footnotes(z, rels, style_map, num_map, image_dir_rel)
        endnotes = parse_endnotes(z, rels, style_map, num_map, image_dir_rel)

        # 检测未支持元素
        unsupported = _detect_unsupported_elements(body, z)
        if unsupported:
            print(f'[警告] {"; ".join(unsupported)}')

        md_lines = []
        counters = {}
        textbox_blocks = []   # 收集所有文本框，文末统一输出

        for elem in body:
            tag = elem.tag.split('}')[-1] if '}' in elem.tag else elem.tag

            if tag == 'p':
                # 收集文本框（不再内联，统一追加到文末）
                for txbx in elem.findall('.//w:txbxContent', NS):
                    tb_lines = []
                    tb_counters = {}
                    for p in txbx.findall('w:p', NS):
                        line, _, _ = parse_paragraph(
                            p, rels, style_map, num_map, image_dir_rel, tb_counters,
                            footnotes, endnotes, fn_counter
                        )
                        if line:
                            tb_lines.append(line)
                    if tb_lines:
                        textbox_blocks.append(tb_lines)

                line, is_heading, h_level = parse_paragraph(
                    elem, rels, style_map, num_map, image_dir_rel, counters,
                    footnotes, endnotes, fn_counter
                )
                if line:
                    if is_heading:
                        md_lines.append('')
                        md_lines.append(line)
                        md_lines.append('')
                    else:
                        md_lines.append(line)

            elif tag == 'tbl':
                table_md = parse_table(elem, rels, style_map, num_map, image_dir_rel)
                if table_md:
                    md_lines.append('')
                    md_lines.append(table_md)
                    md_lines.append('')

        # 文末追加脚注内容
        fn_entries = []
        for fn_id, text in sorted(footnotes.items(), key=lambda x: int(x[0])):
            fn_entries.append(f'[^{fn_id}]: {text}')
        for en_id, text in sorted(endnotes.items(), key=lambda x: int(x[0])):
            fn_entries.append(f'[^{en_id}]: {text}')
        if fn_entries:
            md_lines.append('')
            md_lines.append('---')
            md_lines.extend(fn_entries)

        # 文末追加文本框内容
        if textbox_blocks:
            md_lines.append('')
            md_lines.append('---')
            md_lines.append('> **[文本框内容]**')
            for block in textbox_blocks:
                for line in block:
                    md_lines.append(f'> {line}')
                md_lines.append('>')

    # 清理多余空行
    result_lines = []
    prev_blank = False
    for line in md_lines:
        if line.strip() == '':
            if not prev_blank:
                result_lines.append('')
            prev_blank = True
        else:
            result_lines.append(line)
            prev_blank = False

    md_content = '\n'.join(result_lines).strip() + '\n'

    with open(md_path, 'w', encoding='utf-8') as f:
        f.write(md_content)

    image_count = len(images)
    if image_count == 0 and os.path.exists(image_dir):
        try:
            os.rmdir(image_dir)
        except OSError:
            pass

    print(f'[完成] Markdown 输出: {md_path}')
    if image_count > 0:
        print(f'[完成] 提取图片: {image_count} 张 → {image_dir}/')
        for img_name, img_path in sorted(images.items()):
            size = os.path.getsize(img_path)
            print(f'  - {os.path.basename(img_path)} ({size:,} bytes)')
    else:
        print('[信息] 文档中未找到内嵌图片')
    if footnotes or endnotes:
        print(f'[完成] 提取脚注/尾注: {len(footnotes) + len(endnotes)} 条')
    if textbox_blocks:
        print(f'[完成] 提取文本框: {len(textbox_blocks)} 个（已追加到文末）')

    return md_path, image_dir if image_count > 0 else None


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='将 .docx 文件转换为带样式的 Markdown，并提取图片')
    parser.add_argument('docx_path', help='.docx 文件路径')
    parser.add_argument('--output-dir', default=None, help='输出目录（默认与 docx 同目录）')
    args = parser.parse_args()

    docx_to_markdown(args.docx_path, args.output_dir)
