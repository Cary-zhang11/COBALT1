import { prisma } from "./prisma";

// Simple Chinese/English stop words
const STOP_WORDS = new Set([
  "的", "了", "在", "是", "我", "有", "和", "就", "不", "人", "都", "一", "一个", "上", "也", "很", "到", "说", "要", "去", "你", "会", "着", "没有", "看", "好", "自己", "这", "那", "请", "帮忙", "帮我", "给", "做", "生成", "创建", "写", "需要", "想要",
  "the", "a", "an", "is", "are", "was", "were", "be", "been", "being", "have", "has", "had", "do", "does", "did", "will", "would", "could", "should", "may", "might", "must", "shall", "can", "need", "want", "help", "me", "my", "i", "you", "your", "to", "of", "in", "for", "on", "with", "at", "by", "from", "as", "into", "through", "during", "before", "after", "above", "below", "between", "under",
]);

function extractKeywords(text: string): string[] {
  // Split by non-word characters (supports Chinese and English)
  const tokens = text
    .toLowerCase()
    .split(/[^一-龥a-zA-Z0-9]+/)
    .filter((t) => t.length > 0 && !STOP_WORDS.has(t));
  return Array.from(new Set(tokens)); // deduplicate
}

export interface MatchResult {
  skillId: string;
  name: string;
  description: string;
  confidence: number;
  reason: string;
}

export async function matchSkills(
  userId: string,
  input: string
): Promise<{ matches: MatchResult[]; suggested: string | null }> {
  const skills = await prisma.skill.findMany({
    where: {
      OR: [
        { visibility: "public" },
        { uploadedBy: userId },
      ],
    },
    select: { id: true, name: true, description: true },
  });

  const inputKeywords = extractKeywords(input);

  const matches: MatchResult[] = skills.map((skill) => {
    const skillText = `${skill.name} ${skill.description || ""}`;
    const skillKeywords = extractKeywords(skillText);

    const overlap = inputKeywords.filter((k) => skillKeywords.includes(k));
    const uniqueInputKeywords = Array.from(new Set(inputKeywords));
    const confidence =
      uniqueInputKeywords.length > 0
        ? Math.min((overlap.length / uniqueInputKeywords.length) * 2, 1)
        : 0;

    return {
      skillId: skill.id,
      name: skill.name,
      description: skill.description || "",
      confidence,
      reason:
        overlap.length > 0
          ? `匹配关键词: ${overlap.slice(0, 3).join(", ")}`
          : "通用推荐",
    };
  });

  const filtered = matches
    .filter((m) => m.confidence > 0.05)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 3);

  return {
    matches: filtered,
    suggested: filtered.length > 0 ? filtered[0].skillId : null,
  };
}
