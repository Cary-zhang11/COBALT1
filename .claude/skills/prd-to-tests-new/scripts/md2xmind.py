import re
import sys
import os
import json
import zipfile
import uuid
from xml.etree.ElementTree import Element, SubElement, tostring

def _detect_indent_step(lines):
    """检测 Markdown 列表的最小缩进步长（支持 2/3/4 空格），默认 2"""
    indents = set()
    for line in lines:
        stripped = line.rstrip()
        if not stripped:
            continue
        list_match = re.match(r'^(\s*)[-*+]\s+.*', stripped)
        if list_match:
            indent = len(list_match.group(1))
            if indent > 0:
                indents.add(indent)
    if not indents:
        return 2
    return min(indents)

def parse_markdown(md_text):
    lines = md_text.strip().split('\n')
    root = {'title': 'root', 'children': []}
    stack = [(-1, root)]

    indent_step = _detect_indent_step(lines)

    for line in lines:
        stripped = line.rstrip()
        if not stripped:
            continue

        level = None
        title = None

        header_match = re.match(r'^(#{1,6})\s+(.*)', stripped)
        if header_match:
            level = len(header_match.group(1))
            title = header_match.group(2).strip()
        else:
            list_match = re.match(r'^(\s*)[-*+]\s+(.*)', stripped)
            if list_match:
                indent = len(list_match.group(1))
                title = list_match.group(2).strip()
                level = 7 + indent // indent_step
            else:
                continue

        if title is None:
            continue

        node = {'title': title, 'children': []}
        while len(stack) > 1 and stack[-1][0] >= level:
            stack.pop()
        parent = stack[-1][1]
        parent['children'].append(node)
        stack.append((level, node))

    return root

def gen_id():
    return uuid.uuid4().hex[:26]

# ===== JSON format (XMind 8 Zen) =====
def node_to_json(node):
    result = {
        "id": gen_id(),
        "class": "topic",
        "title": node["title"]
    }
    if node["children"]:
        attached = []
        for child in node["children"]:
            attached.append(node_to_json(child))
        result["children"] = {"attached": attached}
    return result

# ===== XML format (XMind 8 legacy) =====
def build_topic_xml(node, parent_elem):
    topic = SubElement(parent_elem, 'topic')
    topic.set('id', gen_id())
    title_elem = SubElement(topic, 'title')
    title_elem.text = node['title']
    if node['children']:
        children_elem = SubElement(topic, 'children')
        topics_elem = SubElement(children_elem, 'topics')
        topics_elem.set('type', 'attached')
        for child in node['children']:
            build_topic_xml(child, topics_elem)
    return topic

# 1x1 透明 PNG（最小合法缩略图，避免空文件导致兼容性问题）
_EMPTY_PNG = bytes([
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D,
    0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4, 0x89, 0x00, 0x00, 0x00,
    0x0A, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9C, 0x63, 0x60, 0x00, 0x00, 0x00,
    0x02, 0x00, 0x01, 0xE2, 0x21, 0xBC, 0x33, 0x00, 0x00, 0x00, 0x00, 0x49,
    0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82
])

def md_to_xmind(md_file, xmind_file):
    with open(md_file, 'r', encoding='utf-8') as f:
        content = f.read()

    content = re.sub(r'^```markdown\s*\n', '', content, flags=re.MULTILINE)
    content = re.sub(r'^```\s*$', '', content, flags=re.MULTILINE)

    tree = parse_markdown(content)
    if not tree['children']:
        print("[错误] Markdown 内容为空或无法识别层级结构")
        return

    root_node = tree['children'][0]

    # 如果没有一级标题，仅有列表项，创建一个虚拟根节点保证结构完整
    first_line = content.split('\n')[0].strip() if content.strip() else ''
    if not re.match(r'^#{1,6}\s+', first_line):
        root_node = {'title': '用例', 'children': tree['children']}

    # === Build content.json (Zen format) ===
    root_json = node_to_json(root_node)
    root_json["structureClass"] = "org.xmind.ui.logic.right"

    sheet_json = {
        "id": gen_id(),
        "class": "sheet",
        "title": root_node["title"],
        "rootTopic": root_json
    }
    content_json_str = json.dumps([sheet_json], ensure_ascii=False, indent=2)

    # === Build content.xml (legacy format) ===
    xmap = Element('xmap-content')
    xmap.set('xmlns', 'urn:xmind:xmap:xmlns:content:2.0')
    xmap.set('xmlns:fo', 'http://www.w3.org/1999/XSL/Format')
    xmap.set('xmlns:svg', 'http://www.w3.org/2000/svg')
    xmap.set('xmlns:xhtml', 'http://www.w3.org/1999/xhtml')
    xmap.set('xmlns:xlink', 'http://www.w3.org/1999/xlink')
    xmap.set('version', '2.0')

    sheet_xml = SubElement(xmap, 'sheet')
    sheet_xml.set('id', gen_id())
    sheet_title = SubElement(sheet_xml, 'title')
    sheet_title.text = root_node["title"]

    root_topic = SubElement(sheet_xml, 'topic')
    root_topic.set('id', gen_id())
    root_topic.set('structure-class', 'org.xmind.ui.logic.right')
    root_title = SubElement(root_topic, 'title')
    root_title.text = root_node["title"]

    if root_node['children']:
        children_elem = SubElement(root_topic, 'children')
        topics_elem = SubElement(children_elem, 'topics')
        topics_elem.set('type', 'attached')
        for child in root_node['children']:
            build_topic_xml(child, topics_elem)

    xml_str = '<?xml version="1.0" encoding="UTF-8" standalone="no"?>' + tostring(xmap, encoding='unicode')

    # === Build manifest (legacy XML, for XMind 8) ===
    manifest_xml = '''<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<manifest xmlns="urn:xmind:xmap:xmlns:manifest:1.0">
<file-entry full-path="content.xml" media-type="text/xml"/>
<file-entry full-path="content.json" media-type="application/json"/>
<file-entry full-path="metadata.json" media-type="application/json"/>
<file-entry full-path="manifest.json" media-type="application/json"/>
<file-entry full-path="Thumbnails/" media-type=""/>
<file-entry full-path="Thumbnails/thumbnail.png" media-type="image/png"/>
<file-entry full-path="META-INF/" media-type=""/>
</manifest>'''

    # === Build manifest (JSON, for XMind 2022+) ===
    manifest_json = json.dumps({
        "file-entries": {
            "content.json": {},
            "content.xml": {},
            "metadata.json": {},
            "Thumbnails/thumbnail.png": {},
            "META-INF/": {},
            "META-INF/manifest.xml": {}
        }
    }, ensure_ascii=False, indent=2)

    metadata_json = json.dumps({
        "dataStructureVersion": "2",
        "layoutEngineVersion": "3",
        "creator": {"name": "Qoder", "version": "1.0.0"}
    }, ensure_ascii=False)

    # === Write zip ===
    with zipfile.ZipFile(xmind_file, 'w', zipfile.ZIP_DEFLATED) as zf:
        zf.writestr('content.json', content_json_str)
        zf.writestr('content.xml', xml_str)
        zf.writestr('metadata.json', metadata_json)
        zf.writestr('manifest.json', manifest_json)
        zf.writestr('Thumbnails/thumbnail.png', _EMPTY_PNG)
        zf.writestr('META-INF/manifest.xml', manifest_xml)

    print(f"XMind file saved: {xmind_file}")

if __name__ == '__main__':
    md_file = sys.argv[1] if len(sys.argv) > 1 else 'docs/卖换估一体化测试用例_22.md'
    md_dir = os.path.dirname(os.path.abspath(md_file))
    base_name = os.path.splitext(os.path.basename(md_file))[0] + '.xmind'
    xmind_file = os.path.join(md_dir, base_name)
    md_to_xmind(md_file, xmind_file)
