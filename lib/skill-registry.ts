import fs from "fs/promises";
import path from "path";
import matter from "gray-matter";
import crypto from "crypto";
import { prisma } from "./prisma";

const SKILLS_DIR = path.join(process.cwd(), ".claude", "skills");

export interface ParsedSkill {
  name: string;
  description: string;
  content: string;
  filePath: string;
}

export async function loadBuiltInSkills(): Promise<ParsedSkill[]> {
  try {
    await fs.access(SKILLS_DIR);
  } catch {
    console.warn("Skills directory not found:", SKILLS_DIR);
    return [];
  }

  const entries = await fs.readdir(SKILLS_DIR, { withFileTypes: true });
  const skills: ParsedSkill[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const skillDir = path.join(SKILLS_DIR, entry.name);
    const skillMdPath = path.join(skillDir, "SKILL.md");

    try {
      await fs.access(skillMdPath);
    } catch {
      continue;
    }

    const rawContent = await fs.readFile(skillMdPath, "utf-8");
    const parsed = matter(rawContent);

    skills.push({
      name: parsed.data.name || entry.name,
      description: parsed.data.description || "",
      content: parsed.content,
      filePath: skillDir,
    });
  }

  return skills;
}

export function hashContent(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex").slice(0, 16);
}

export async function syncBuiltInSkillsToDB(): Promise<void> {
  const skills = await loadBuiltInSkills();

  for (const skill of skills) {
    const versionHash = hashContent(skill.content);

    const existing = await prisma.skill.findFirst({
      where: { source: "builtin", filePath: skill.filePath },
      include: { versions: { orderBy: { createdAt: "desc" }, take: 1 } },
    });

    if (!existing) {
      const newSkill = await prisma.skill.create({
        data: {
          name: skill.name,
          description: skill.description,
          source: "builtin",
          filePath: skill.filePath,
          version: versionHash,
        },
      });
      await prisma.skillVersion.create({
        data: {
          skillId: newSkill.id,
          version: versionHash,
          content: skill.content,
        },
      });
    } else if (existing.versions[0]?.version !== versionHash) {
      await prisma.skill.update({
        where: { id: existing.id },
        data: { version: versionHash },
      });
      await prisma.skillVersion.create({
        data: {
          skillId: existing.id,
          version: versionHash,
          content: skill.content,
          changelog: "Auto-synced from file change",
        },
      });
    }
  }
}

// Tool Compatibility Scanner

const CLI_SUPPORTED_TOOLS = [
  "Read", "Write", "Grep", "Glob", "Bash", "Edit", "MultiEdit",
  "WebSearch", "WebFetch", "Task", "NotebookEdit",
];

const MVP_UNSUPPORTED_TOOLS = [
  "BashOutput", "KillBash",
];

export interface CompatibilityReport {
  supported: string[];
  unsupported: string[];
  isFullyCompatible: boolean;
}

export function scanToolCompatibility(skillContent: string): CompatibilityReport {
  const mentionedTools = new Set<string>();
  const allTools = [...CLI_SUPPORTED_TOOLS, ...MVP_UNSUPPORTED_TOOLS];

  for (const tool of allTools) {
    const regex = new RegExp(`\\b${tool}\\b`, "g");
    if (regex.test(skillContent)) {
      mentionedTools.add(tool);
    }
  }

  const unsupported: string[] = [];
  Array.from(mentionedTools).forEach((tool) => {
    if (MVP_UNSUPPORTED_TOOLS.includes(tool)) {
      unsupported.push(tool);
    }
  });

  return {
    supported: CLI_SUPPORTED_TOOLS.filter((t) => mentionedTools.has(t)),
    unsupported,
    isFullyCompatible: unsupported.length === 0,
  };
}
