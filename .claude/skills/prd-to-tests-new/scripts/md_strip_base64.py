#!/usr/bin/env python3
"""
md_strip_base64.py - 将含 base64 内嵌图片的 .md 文件剥离为纯文本。

用法：
    python md_strip_base64.py <md文件路径> [--output <输出文件路径>]

输出：
    默认输出到 <md文件同目录>/<文件名>_clean.md，可用 --output 指定。

作用：
    1. 移除 ![图片](data:image/...;base64,...) 与 ![image](data:image/...;base64,...) 标记
    2. 统计被剥离的图片数量，便于后续按需解码
    3. 过滤掉剥离后残留的空行/孤立符号

依赖：仅 Python 标准库，无需安装第三方包。
"""

import sys
import os
import re
import argparse


# 匹配 markdown 图片标记中的 base64 data URI（兼容 ![图片]/![image] 及任意 alt 文本）
IMG_BASE64_RE = re.compile(
    r'!\[[^\]]*\]\(data:image/[\w+.\-]*;base64,[^)]*\)',
    re.IGNORECASE,
)


def strip_base64(content: str):
    """剥离 base64 图片标记，返回 (清理后文本, 命中数量)。"""
    matches = IMG_BASE64_RE.findall(content)
    img_count = len(matches)

    cleaned = IMG_BASE64_RE.sub('', content)

    # 过滤剥离后残留的空行与孤立符号
    lines = []
    for line in cleaned.split('\n'):
        stripped = line.strip()
        if stripped and stripped not in ('', '!', '![]'):
            lines.append(line)
    return '\n'.join(lines), img_count


def main():
    parser = argparse.ArgumentParser(description='剥离 .md 文件中的 base64 图片，输出纯文本')
    parser.add_argument('md_file', help='待处理的 .md 文件路径')
    parser.add_argument('--output', help='输出文件路径（默认同目录下 <文件名>_clean.md）')
    args = parser.parse_args()

    md_path = args.md_file
    if not os.path.isfile(md_path):
        print(f'[错误] 文件不存在: {md_path}')
        sys.exit(1)

    with open(md_path, 'r', encoding='utf-8') as fh:
        content = fh.read()

    cleaned, img_count = strip_base64(content)

    base_name = os.path.splitext(os.path.basename(md_path))[0]
    out_dir = os.path.dirname(os.path.abspath(md_path))
    out_path = args.output or os.path.join(out_dir, f'{base_name}_clean.md')

    with open(out_path, 'w', encoding='utf-8') as fout:
        fout.write(cleaned)

    print(f'[md_strip_base64] 输入: {md_path}')
    print(f'[md_strip_base64] 输出: {out_path}')
    print(f'[md_strip_base64] 剥离 base64 图片: {img_count} 张')
    print(f'[md_strip_base64] 纯文本大小: {len(cleaned)} 字符')


if __name__ == '__main__':
    main()
