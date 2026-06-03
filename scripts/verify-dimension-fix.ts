import { readFileSync } from "fs";
import { parseTestcaseMarkdown } from "../lib/parse-testcase-md";

const mdPath = process.argv[2];
if (!mdPath) { console.error("Usage: tsx scripts/verify-dimension-fix.ts <md-file>"); process.exit(1); }

const content = readFileSync(mdPath, "utf-8");
const result = parseTestcaseMarkdown(content);
console.log("Dimensions found:", result.dimensions.length);
result.dimensions.forEach(d => {
  console.log(`  ${d.code} ${d.name}: covered=${d.covered}, caseCount=${d.caseCount}`);
});
if (result.dimensions.length === 0) {
  console.log("WARNING: No dimensions parsed — regex may not match");
  process.exit(1);
}
const missed = result.dimensions.filter(d => d.name.includes("权限") || d.name.includes("性能") || d.name.includes("状态") || d.name.includes("第三方"));
if (missed.length > 0) {
  console.log("Previously-missed entries now captured:", missed.length);
} else {
  console.log("WARNING: Could not verify previously-missed entries");
}
