#!/usr/bin/env python3
"""
Convert XMind file (.xmind) to Markdown text for skill processing.
Supports XMind 8 and XMind Zen (2020+) formats.
"""

import sys
import argparse
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path


def parse_xmind_zen(content_xml):
    """Parse XMind Zen / 2020+ format."""
    root = ET.fromstring(content_xml)
    ns = {'xmind': 'http://www.w3.org/1999/xhtml'}

    def extract_topic(element, level=0):
        """Recursively extract topics."""
        results = []

        # Try to find title
        title = ''
        title_elem = element.find('.//xmind:title', ns)
        if title_elem is not None and title_elem.text:
            title = title_elem.text.strip()
        else:
            # Try xhtml title
            title_elem = element.find('title')
            if title_elem is not None and title_elem.text:
                title = title_elem.text.strip()

        if title:
            prefix = '#' * min(level + 1, 6) if level > 0 else '#'
            results.append(f"{prefix} {title}")

            # Try to find notes
            notes_elem = element.find('.//xmind:notes', ns)
            if notes_elem is not None:
                plain = notes_elem.find('.//plain')
                if plain is not None and plain.text:
                    for line in plain.text.strip().split('\n'):
                        results.append(f"  {line}")

        # Children topics
        children = element.find('children')
        if children is not None:
            topics = children.findall('topics')
            for topic_group in topics:
                for topic in topic_group.findall('topic'):
                    results.extend(extract_topic(topic, level + 1))

        return results

    # Find root topic
    sheet = root.find('sheet')
    if sheet is not None:
        topic = sheet.find('topic')
        if topic is not None:
            return '\n'.join(extract_topic(topic, 0))

    # Fallback: try any topic
    topic = root.find('.//topic')
    if topic is not None:
        return '\n'.join(extract_topic(topic, 0))

    return ""


def parse_xmind_8(content_xml):
    """Parse XMind 8 / Legacy format."""
    root = ET.fromstring(content_xml)

    def extract_topic(element, level=0):
        results = []

        title_elem = element.find('title')
        if title_elem is not None and title_elem.text:
            title = title_elem.text.strip()
            prefix = '#' * min(level + 1, 6) if level > 0 else '#'
            results.append(f"{prefix} {title}")

            # Notes
            notes = element.find('notes')
            if notes is not None:
                plain = notes.find('plain')
                if plain is not None and plain.text:
                    for line in plain.text.strip().split('\n'):
                        results.append(f"  {line}")

        # Children
        children = element.find('children')
        if children is not None:
            topics = children.findall('topics')
            for topic_group in topics:
                for topic in topic_group.findall('topic'):
                    results.extend(extract_topic(topic, level + 1))

        return results

    # Find sheet -> topic
    for sheet in root.findall('sheet'):
        topic = sheet.find('topic')
        if topic is not None:
            return '\n'.join(extract_topic(topic, 0))

    # Fallback
    topic = root.find('.//topic')
    if topic is not None:
        return '\n'.join(extract_topic(topic, 0))

    return ""


def convert_xmind(input_path, output_path):
    input_path = Path(input_path)
    if not input_path.exists():
        print(f"Error: File not found: {input_path}", file=sys.stderr)
        sys.exit(1)

    # XMind is a ZIP file
    try:
        with zipfile.ZipFile(input_path, 'r') as zf:
            # Try Zen format first (content.json)
            if 'content.json' in zf.namelist():
                import json
                content = json.loads(zf.read('content.json'))
                # Simple JSON to markdown conversion
                def json_to_md(obj, level=0):
                    lines = []
                    if isinstance(obj, dict):
                        title = obj.get('title', '')
                        if title:
                            prefix = '#' * min(level + 1, 6) if level > 0 else '#'
                            lines.append(f"{prefix} {title}")
                        children = obj.get('children', {}).get('attached', [])
                        for child in children:
                            lines.extend(json_to_md(child, level + 1))
                    return lines

                # Find root topic
                root_topic = content.get('rootTopic', {})
                md_lines = json_to_md(root_topic, 0)
                md_text = '\n'.join(md_lines)

            # Try XML format
            elif 'content.xml' in zf.namelist():
                content_xml = zf.read('content.xml').decode('utf-8')
                md_text = parse_xmind_zen(content_xml)
                if not md_text.strip():
                    md_text = parse_xmind_8(content_xml)
            else:
                print("Error: Cannot find content.xml or content.json in xmind file", file=sys.stderr)
                sys.exit(1)
    except zipfile.BadZipFile:
        print(f"Error: Not a valid xmind file (expected ZIP format): {input_path}", file=sys.stderr)
        sys.exit(1)

    if not md_text.strip():
        print("Warning: No content extracted from xmind file", file=sys.stderr)
        md_text = "# XMind 转换结果\n\n> 未能提取内容\n"

    # Add header
    header = f"# XMind 用例转换\n\n> 来源文件: {input_path.name}\n\n"
    full_text = header + md_text

    Path(output_path).write_text(full_text, encoding='utf-8')
    print(f"Converted xmind to: {output_path}")


def main():
    parser = argparse.ArgumentParser(description='Convert XMind file to Markdown')
    parser.add_argument('input', help='Input .xmind file path')
    parser.add_argument('--output', '-o', required=True, help='Output Markdown file path')
    args = parser.parse_args()

    convert_xmind(args.input, args.output)


if __name__ == '__main__':
    main()
