"""
validate_eval.py - 对 prd-to-tests-new skill 生成的测试用例进行自动化评估。

用法：
    python validate_eval.py <eval_id> <生成的测试用例.md文件路径>

示例：
    python validate_eval.py 1 "docs/test_merge_split_prd_20260429/test_merge_split_prd_测试用例.md"

说明：
    读取 evals/evals.json 中对应 eval_id 的断言定义，
    对生成的测试用例文件进行基础格式和内容检查，
    输出 PASS/FAIL 结果。
"""

import json
import re
import sys
import os


def load_evals(evals_path):
    with open(evals_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    return data["evals"]


def load_md_content(md_path):
    with open(md_path, "r", encoding="utf-8") as f:
        return f.read()


def extract_test_cases(content):
    """提取所有 TC-XXX 行及其后续内容"""
    lines = content.split("\n")
    cases = []
    current = None
    for line in lines:
        tc_match = re.match(r"^#{4}\s+(TC-\d+)\s*\|\s*P(\d+)\s*\|\s*(.*)", line)
        if tc_match:
            if current:
                cases.append(current)
            current = {
                "id": tc_match.group(1),
                "priority": tc_match.group(2),
                "title": tc_match.group(3).strip(),
                "lines": [line],
            }
        elif current:
            current["lines"].append(line)
    if current:
        cases.append(current)
    return cases


def has_section(content, section_name):
    return section_name in content


def check_case_count(cases, min_count, max_count=None):
    count = len(cases)
    if max_count:
        return min_count <= count <= max_count
    return count >= min_count


def check_title_format(cases):
    """检查标题是否包含 TC-XXX | PX"""
    pattern = re.compile(r"^#{4}\s+TC-\d+\s*\|\s*P\d+\s*\|")
    for case in cases:
        if not pattern.match(case["lines"][0]):
            return False
    return len(cases) > 0


def check_has_keyword(cases, keyword):
    """检查是否有用例标题包含某个关键词"""
    return any(keyword.lower() in case["title"].lower() for case in cases)


def check_has_keyword_anywhere(cases, keywords):
    """检查是否有用例标题或内容包含任一关键词"""
    for case in cases:
        text = case["title"] + " " + " ".join(case["lines"])
        for kw in keywords:
            if kw.lower() in text.lower():
                return True
    return False


# 断言检查函数映射
ASSERTION_CHECKS = {
    "用例数量合理": lambda cases, content: check_case_count(cases, 12, 20),
    "覆盖正常流程": lambda cases, content: check_has_keyword(cases, "正常"),
    "覆盖字段校验": lambda cases, content: check_has_keyword(cases, "校验"),
    "覆盖边界值": lambda cases, content: check_has_keyword(cases, "边界"),
    "包含激活流程": lambda cases, content: check_has_keyword(cases, "激活"),
    "格式符合模板": lambda cases, content: check_title_format(cases),
    "覆盖三个模块": lambda cases, content: check_has_keyword_anywhere(cases, ["商品", "购物车", "订单"]),
    "覆盖状态流转": lambda cases, content: check_has_keyword(cases, "状态") or has_section(content, "状态"),
    "覆盖优惠券计算": lambda cases, content: check_has_keyword(cases, "优惠券") or check_has_keyword(cases, "折扣"),
    "覆盖库存锁定": lambda cases, content: check_has_keyword(cases, "库存") and check_has_keyword(cases, "锁定"),
    "包含网络相关模块": lambda cases, content: has_section(content, "网络相关"),
    "包含待澄清问题": lambda cases, content: has_section(content, "待澄清"),
    "覆盖三种金额分流": lambda cases, content: check_has_keyword_anywhere(cases, ["1000", "5000"]),
    "覆盖审批操作": lambda cases, content: check_has_keyword_anywhere(cases, ["通过", "驳回", "转交"]),
    "覆盖非法状态转换": lambda cases, content: check_has_keyword(cases, "非法") or check_has_keyword(cases, "拦截"),
    "覆盖角色权限": lambda cases, content: check_has_keyword(cases, "权限") or check_has_keyword(cases, "越权"),
    "包含越权测试": lambda cases, content: check_has_keyword(cases, "越权"),
    "覆盖导入正常流程": lambda cases, content: check_has_keyword(cases, "导入") and check_has_keyword(cases, "成功"),
    "覆盖导入异常": lambda cases, content: check_case_count(cases, 5) if "导入异常" in str(cases) else check_has_keyword(cases, "异常"),
    "覆盖导入边界": lambda cases, content: check_has_keyword(cases, "边界"),
    "覆盖导出限制": lambda cases, content: check_has_keyword(cases, "导出") and check_has_keyword(cases, "限制"),
    "覆盖批量操作约束": lambda cases, content: check_has_keyword(cases, "删除") and check_has_keyword(cases, "禁用"),
    "覆盖四种支付方式": lambda cases, content: check_has_keyword_anywhere(cases, ["微信", "支付宝", "银行卡", "余额"]),
    "覆盖金额边界": lambda cases, content: check_has_keyword(cases, "边界") and check_has_keyword(cases, "金额"),
    "覆盖重复支付": lambda cases, content: check_has_keyword(cases, "重复"),
    "覆盖安全要求": lambda cases, content: check_has_keyword_anywhere(cases, ["安全", "锁定", "限频", "越权"]),
    "覆盖退款场景": lambda cases, content: check_has_keyword(cases, "退款"),
    "用例数量适中": lambda cases, content: check_case_count(cases, 10, 18),
    "覆盖CRUD": lambda cases, content: check_has_keyword_anywhere(cases, ["新增", "编辑", "删除", "展示"]),
    "覆盖图片校验": lambda cases, content: check_has_keyword(cases, "图片"),
    "覆盖序号唯一性": lambda cases, content: check_has_keyword(cases, "重复"),
    "覆盖删除恢复": lambda cases, content: check_has_keyword(cases, "恢复"),
    "覆盖三种出险类型": lambda cases, content: check_has_keyword_anywhere(cases, ["意外", "疾病", "身故"]),
    "覆盖出险时间校验": lambda cases, content: check_has_keyword(cases, "时间"),
    "覆盖审批分流": lambda cases, content: check_has_keyword(cases, "审批"),
    "覆盖理赔时效": lambda cases, content: check_has_keyword(cases, "时效"),
    "覆盖角色CRUD": lambda cases, content: check_has_keyword_anywhere(cases, ["创建", "编辑", "删除", "关联"]),
    "覆盖菜单权限继承": lambda cases, content: check_has_keyword(cases, "继承"),
    "覆盖四种数据权限": lambda cases, content: check_has_keyword_anywhere(cases, ["全部", "本部门", "本人"]),
    "覆盖内置角色保护": lambda cases, content: check_has_keyword(cases, "内置") or check_has_keyword(cases, "管理员"),
}


def run_eval(eval_id, md_path):
    evals_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "evals")
    evals_path = os.path.join(evals_dir, "evals.json")
    evals = load_evals(evals_path)

    target = None
    for e in evals:
        if e["id"] == eval_id:
            target = e
            break
    if not target:
        print(f"[错误] 找不到 eval_id={eval_id}")
        sys.exit(1)

    content = load_md_content(md_path)
    cases = extract_test_cases(content)

    print(f"\n{'='*60}")
    print(f"Eval: {target['eval_name']} (ID={eval_id})")
    print(f"文件: {md_path}")
    print(f"用例数: {len(cases)}")
    print(f"{'='*60}\n")

    passed = 0
    failed = 0
    for assertion in target.get("assertions", []):
        name = assertion["name"]
        desc = assertion.get("description", "")
        check_fn = ASSERTION_CHECKS.get(name)

        if check_fn:
            result = check_fn(cases, content)
        else:
            result = None  # 无法自动检查，需要人工判断

        status = "✅ PASS" if result else "❓ N/A" if result is None else "❌ FAIL"
        if result:
            passed += 1
        elif result is None:
            pass  # N/A doesn't count
        else:
            failed += 1

        print(f"  {status} | {name}")
        print(f"         {desc}")

    print(f"\n{'='*60}")
    print(f"结果: {passed} 通过, {failed} 失败, {len(target.get('assertions', [])) - passed - failed} 需人工检查")
    print(f"{'='*60}\n")


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("用法: python validate_eval.py <eval_id> <测试用例.md文件路径>")
        sys.exit(1)

    eval_id = int(sys.argv[1])
    md_path = sys.argv[2]
    run_eval(eval_id, md_path)
