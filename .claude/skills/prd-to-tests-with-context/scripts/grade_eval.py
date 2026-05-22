#!/usr/bin/env python3
"""
Grade evaluation outputs against assertions.
Reads eval output files and generates grading.json.
"""

import json
import re
import sys
import argparse
from pathlib import Path


def load_eval_metadata(eval_dir):
    """Load eval_metadata.json from eval directory."""
    path = Path(eval_dir) / "eval_metadata.json"
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def find_output_file(outputs_dir, pattern):
    """Find first file matching pattern in outputs directory."""
    outputs = Path(outputs_dir)
    if not outputs.exists():
        return None
    for f in outputs.iterdir():
        if f.is_file() and pattern in f.name:
            return f
    return None


def check_assertion(assertion, text, outputs_dir):
    """Check a single assertion against output text."""
    check = assertion.get("check", "")
    name = assertion.get("name", "unnamed")

    passed = False
    evidence = ""

    if check.startswith("file_exists:"):
        pattern = check.split(":", 1)[1]
        f = find_output_file(outputs_dir, pattern)
        passed = f is not None
        evidence = f"Found: {f.name}" if f else f"No file matching '{pattern}' in {outputs_dir}"

    elif check.startswith("contains:"):
        keyword = check.split(":", 1)[1]
        passed = keyword in text
        evidence = f"Keyword '{keyword}' {'found' if passed else 'not found'}"

    elif check.startswith("contains_any:"):
        keywords = check.split(":", 1)[1].split(",")
        found = [k for k in keywords if k in text]
        passed = len(found) > 0
        evidence = f"Found keywords: {found}" if found else f"None of {keywords} found"

    elif check.startswith("multi_contains:"):
        keywords = check.split(":", 1)[1].split(",")
        found = [k for k in keywords if k in text]
        passed = len(found) >= 2
        evidence = f"Found {len(found)} keywords: {found}"

    elif check.startswith("not_contains_regex:"):
        pattern = check.split(":", 1)[1]
        match = re.search(pattern, text)
        passed = match is None
        evidence = f"Pattern '{pattern}' {'found' if match else 'not found'}"

    else:
        evidence = f"Unknown check type: {check}"

    return {
        "text": name,
        "passed": passed,
        "evidence": evidence
    }


def grade_eval(eval_dir, run_type="with_skill"):
    """Grade a single eval run."""
    eval_path = Path(eval_dir)
    outputs_dir = eval_path / run_type / "outputs"

    # Load metadata
    metadata = load_eval_metadata(eval_dir)
    if not metadata:
        print(f"Error: No eval_metadata.json found in {eval_dir}")
        return None

    assertions = metadata.get("assertions", [])

    # Find main output file
    main_file = find_output_file(outputs_dir, "完善版")
    if not main_file:
        main_file = find_output_file(outputs_dir, ".md")

    if not main_file:
        print(f"Warning: No output file found in {outputs_dir}")
        text = ""
    else:
        text = main_file.read_text(encoding="utf-8")

    # Grade each assertion
    results = []
    for assertion in assertions:
        result = check_assertion(assertion, text, str(outputs_dir))
        results.append(result)

    # Calculate pass rate
    passed_count = sum(1 for r in results if r["passed"])
    total_count = len(results)
    pass_rate = passed_count / total_count if total_count > 0 else 0

    grading = {
        "eval_id": metadata.get("eval_id"),
        "eval_name": metadata.get("eval_name"),
        "run_type": run_type,
        "pass_rate": round(pass_rate, 2),
        "passed": passed_count,
        "total": total_count,
        "expectations": results
    }

    # Save grading.json
    grading_path = outputs_dir / "grading.json"
    grading_path.write_text(json.dumps(grading, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Graded {eval_dir}/{run_type}: {passed_count}/{total_count} passed ({pass_rate:.0%})")

    return grading


def main():
    parser = argparse.ArgumentParser(description="Grade eval outputs")
    parser.add_argument("iteration_dir", help="Path to iteration directory (e.g., workspace/iteration-1)")
    args = parser.parse_args()

    iteration = Path(args.iteration_dir)
    if not iteration.exists():
        print(f"Error: Directory not found: {iteration}")
        sys.exit(1)

    all_gradings = []
    for eval_dir in sorted(iteration.iterdir()):
        if not eval_dir.is_dir() or not eval_dir.name.startswith("eval-"):
            continue

        for run_type in ["with_skill", "without_skill"]:
            outputs_dir = eval_dir / run_type / "outputs"
            if not outputs_dir.exists():
                continue
            grading = grade_eval(str(eval_dir), run_type)
            if grading:
                all_gradings.append(grading)

    # Save aggregate
    if all_gradings:
        aggregate = {
            "iteration": iteration.name,
            "total_evals": len(all_gradings) // 2 if len(all_gradings) % 2 == 0 else len(all_gradings),
            "gradings": all_gradings
        }
        aggregate_path = iteration / "aggregate_grading.json"
        aggregate_path.write_text(json.dumps(aggregate, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"\nAggregate grading saved to: {aggregate_path}")


if __name__ == "__main__":
    main()
