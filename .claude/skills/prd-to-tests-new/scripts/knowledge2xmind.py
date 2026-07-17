#!/usr/bin/env python3
"""
knowledge2xmind.py - 将知识库 Markdown 文件转为 XMind 兼容格式。

用法：
    python knowledge2xmind.py <md文件路径> <章节编号>
    python knowledge2xmind.py knowledge/rules.md 2.1

示例输出：
    ### 2.1 文档标题
    #### 章节1
    - 内容项1
    - 内容项2

作用：
    1. 读取 Markdown 文件
    2. 将第一个 H1 标题提取为文档标题，输出为 `### {编号} {标题}`
    3. 后续标题层级加深 2 级（H2→H4, H3→H5, H4→H6）
    4. 所有非标题内容统一转为 `- ` 列表项格式
    5. 跳过空行、水平线（---）
    6. 确保 md2xmind.py 可正确解析（仅识别 # 标题和 - 列表项）

依赖：仅 Python 标准库，无需安装第三方包。
"""

import sys
import os
import re


def convert(md_text, section_number):
    """将 Markdown 文本转为 XMind 兼容格式。"""
    lines = md_text.strip().split('\n')
    output = []

    title = None
    title_found = False
    section_found = False  # H2/H3 等章节标题出现后才为 True
    in_bold_scope = False  # 当前是否处于"场景"等加粗标签的下属内容中
    indent_step = "  "

    for line in lines:
        stripped = line.rstrip()

        # 跳过空行
        if not stripped:
            continue

        # 跳过水平线
        if re.match(r'^-{3,}$', stripped) or re.match(r'^\*{3,}$', stripped):
            continue

        # 标题检测
        heading_match = re.match(r'^(#{1,6})\s+(.*)', stripped)
        if heading_match:
            hashes = heading_match.group(1)
            text = heading_match.group(2).strip()

            if not title_found:
                # 第一个标题作为文档标题
                title = text
                title_found = True
                output.append(f"### {section_number} {title}")
                output.append("")
                continue

            # 后续标题加深 2 级（H2→H4, H3→H5），上限 H6
            section_found = True
            in_bold_scope = False
            new_level = min(len(hashes) + 2, 6)
            output.append(f"{'#' * new_level} {text}")
            continue

        # 加粗段落（整行被 ** 包裹）：
        #   - 章节标题出现之前：视为说明文字，转为列表项
        #   - 章节标题出现之后：视为"场景"等分组标签，转为列表项，
        #     并将其后的列表项缩进一级，使其在 XMind 中成为子节点
        bold_para = re.match(r'^\*\*(.+)\*\*$', stripped)
        if bold_para:
            text = bold_para.group(1).strip().rstrip('：:')
            if section_found:
                output.append(f"- {text}")
                in_bold_scope = True
            else:
                output.append(f"- {text}")
                in_bold_scope = False
            continue

        # 列表项（- * +）：保留原始缩进；如果在场景标签作用域内，整体缩进一级
        list_match = re.match(r'^(\s*)[-*+]\s+(.*)', stripped)
        if list_match:
            indent = list_match.group(1)
            content = list_match.group(2).strip()
            if in_bold_scope:
                indent = indent + indent_step
            output.append(f"{indent}- {content}")
            continue

        # 编号列表（1. 2. 等）：转为 - 列表项；如果在场景标签作用域内，整体缩进一级
        numbered_match = re.match(r'^(\s*)\d+[.)]\s+(.*)', stripped)
        if numbered_match:
            indent = numbered_match.group(1)
            content = numbered_match.group(2).strip()
            if in_bold_scope:
                indent = indent + indent_step
            output.append(f"{indent}- {content}")
            continue

        # 引用块（>）：去掉 > 前缀，转为列表项
        blockquote_match = re.match(r'^>\s*(.*)', stripped)
        if blockquote_match:
            content = blockquote_match.group(1).strip()
            if content:
                output.append(f"- {content}")
            continue

        # 表格行（| ... |）：转为列表项
        if stripped.startswith('|'):
            cells = [c.strip() for c in stripped.split('|')]
            # 去掉首尾空元素
            cells = [c for c in cells if c]
            # 跳过分隔行（--- | --- | ---）
            if cells and all(re.match(r'^[-:]+$', c) for c in cells):
                continue
            if cells:
                output.append(f"- {' | '.join(cells)}")
            continue

        # 普通段落：转为列表项；如果在场景标签作用域内，整体缩进一级
        indent = indent_step if in_bold_scope else ""
        output.append(f"{indent}- {stripped}")

    # 如果没有找到标题，从文件名提取
    if not title_found and len(sys.argv) > 1:
        filename = os.path.basename(sys.argv[1])
        title = os.path.splitext(filename)[0]
        output.insert(0, "")
        output.insert(0, f"### {section_number} {title}")

    return '\n'.join(output)


if __name__ == '__main__':
    import argparse

    parser = argparse.ArgumentParser(description='将知识库 Markdown 转为 XMind 兼容格式')
    parser.add_argument('file', help='输入 md 文件路径')
    parser.add_argument('number', help='章节编号（如 2.1）')
    parser.add_argument('--output', '-o', help='输出文件路径（不指定则打印到 stdout）')
    args = parser.parse_args()

    with open(args.file, 'r', encoding='utf-8') as f:
        content = f.read()

    result = convert(content, args.number)

    if args.output:
        with open(args.output, 'w', encoding='utf-8') as f:
            f.write(result + '\n')
        print(f"已输出到: {args.output}")
    else:
        sys.stdout.buffer.write(result.encode('utf-8'))
        sys.stdout.buffer.write(b'\n')
