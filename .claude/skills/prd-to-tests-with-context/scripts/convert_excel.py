#!/usr/bin/env python3
"""
Convert Excel Bug records to Markdown for skill processing.
Supports .xlsx and .csv formats.
"""

import sys
import argparse
import pandas as pd
from pathlib import Path


def normalize_columns(df):
    """Map common Chinese/English column names to standard fields."""
    column_map = {
        # Chinese variants
        'bug编号': 'bug_id',
        'bug单号': 'bug_id',
        '编号': 'bug_id',
        '标题': 'title',
        'bug标题': 'title',
        '问题描述': 'title',
        '功能模块': 'module',
        '所属模块': 'module',
        '模块': 'module',
        '严重级别': 'severity',
        '优先级': 'severity',
        '严重程度': 'severity',
        '复现步骤': 'repro_steps',
        '重现步骤': 'repro_steps',
        '步骤': 'repro_steps',
        '实际结果': 'actual_result',
        '实际表现': 'actual_result',
        '预期结果': 'expected_result',
        '期望结果': 'expected_result',
        '根因分析': 'root_cause',
        '原因': 'root_cause',
        '修复版本': 'fix_version',
        '版本': 'fix_version',
        '状态': 'status',
        'bug状态': 'status',
        # English variants
        'id': 'bug_id',
        'bug id': 'bug_id',
        'summary': 'title',
        'component': 'module',
        'priority': 'severity',
        'repro': 'repro_steps',
        'steps to reproduce': 'repro_steps',
        'actual': 'actual_result',
        'expected': 'expected_result',
        'cause': 'root_cause',
        'version': 'fix_version',
    }

    normalized = {}
    for col in df.columns:
        key = col.strip().lower()
        normalized[col] = column_map.get(key, key)

    df = df.rename(columns=normalized)
    return df


def severity_score(sev):
    """Convert severity to numeric for sorting."""
    if pd.isna(sev):
        return 99
    s = str(sev).strip().upper()
    if s in ('P0', '致命', 'CRITICAL', 'BLOCKER'):
        return 0
    if s in ('P1', '严重', 'MAJOR', 'HIGH'):
        return 1
    if s in ('P2', '一般', 'MINOR', 'MEDIUM'):
        return 2
    if s in ('P3', '提示', 'TRIVIAL', 'LOW'):
        return 3
    return 99


def df_to_markdown(df, output_path):
    """Convert DataFrame to structured Markdown."""
    lines = []
    lines.append("# Bug 记录汇总\n")
    lines.append(f"> 共 {len(df)} 条 Bug 记录\n")

    for idx, row in df.iterrows():
        bug_id = row.get('bug_id', f'#{idx+1}')
        title = row.get('title', '未命名')
        module = row.get('module', '未分类')
        severity = row.get('severity', '未标注')
        status = row.get('status', '')
        repro = row.get('repro_steps', '')
        actual = row.get('actual_result', '')
        expected = row.get('expected_result', '')
        root_cause = row.get('root_cause', '')
        fix_version = row.get('fix_version', '')

        lines.append(f"## Bug {bug_id}: {title}\n")
        lines.append(f"- **功能模块**: {module}")
        lines.append(f"- **严重级别**: {severity}")
        if status:
            lines.append(f"- **状态**: {status}")
        if fix_version:
            lines.append(f"- **修复版本**: {fix_version}")
        lines.append("")

        if repro and str(repro).strip():
            lines.append("**复现步骤：**")
            for step_line in str(repro).strip().split('\n'):
                lines.append(f"  {step_line}")
            lines.append("")

        if actual and str(actual).strip():
            lines.append(f"**实际结果：** {actual}")
        if expected and str(expected).strip():
            lines.append(f"**预期结果：** {expected}")
        if root_cause and str(root_cause).strip():
            lines.append(f"**根因分析：** {root_cause}")

        lines.append("---\n")

    content = '\n'.join(lines)
    Path(output_path).write_text(content, encoding='utf-8')
    return output_path


def main():
    parser = argparse.ArgumentParser(description='Convert Excel/CSV Bug records to Markdown')
    parser.add_argument('input', help='Input Excel or CSV file path')
    parser.add_argument('--output', '-o', required=True, help='Output Markdown file path')
    parser.add_argument('--sheet', '-s', default=0, help='Sheet name or index (for Excel)')
    args = parser.parse_args()

    input_path = Path(args.input)
    if not input_path.exists():
        print(f"Error: File not found: {input_path}", file=sys.stderr)
        sys.exit(1)

    # Read file
    suffix = input_path.suffix.lower()
    if suffix in ('.xlsx', '.xls'):
        df = pd.read_excel(input_path, sheet_name=args.sheet)
    elif suffix == '.csv':
        df = pd.read_csv(input_path, encoding='utf-8')
    else:
        print(f"Error: Unsupported file format: {suffix}", file=sys.stderr)
        sys.exit(1)

    if df.empty:
        print("Warning: Input file is empty", file=sys.stderr)
        Path(args.output).write_text("# Bug 记录汇总\n\n> 无记录\n", encoding='utf-8')
        return

    # Normalize and sort
    df = normalize_columns(df)
    df['_severity_score'] = df.get('severity', '').apply(severity_score)
    df = df.sort_values('_severity_score').drop(columns='_severity_score')

    # Convert
    output_path = df_to_markdown(df, args.output)
    print(f"Converted {len(df)} bug records to: {output_path}")


if __name__ == '__main__':
    main()
