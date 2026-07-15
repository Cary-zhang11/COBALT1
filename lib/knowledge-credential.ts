import fs from "fs/promises";
import path from "path";

const DATA_DIR = path.resolve(process.cwd(), "data");
const CREDENTIAL_FILE = path.join(DATA_DIR, "knowledge-credential.json");

export interface KnowledgeCredential {
  cookie: string;
  updatedAt: string;
  source: "auto" | "manual";
}

export async function getKnowledgeCredential(): Promise<KnowledgeCredential | null> {
  try {
    const raw = await fs.readFile(CREDENTIAL_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    if (typeof parsed?.cookie !== "string" || !parsed.cookie) return null;
    return {
      cookie: parsed.cookie,
      updatedAt: parsed.updatedAt || new Date().toISOString(),
      source: parsed.source === "manual" ? "manual" : "auto",
    };
  } catch {
    return null;
  }
}

export async function saveKnowledgeCredential(
  cookie: string,
  source: "auto" | "manual"
): Promise<KnowledgeCredential> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const record: KnowledgeCredential = {
    cookie,
    updatedAt: new Date().toISOString(),
    source,
  };
  await fs.writeFile(CREDENTIAL_FILE, JSON.stringify(record, null, 2), "utf-8");
  return record;
}

export async function clearKnowledgeCredential(): Promise<void> {
  try {
    await fs.unlink(CREDENTIAL_FILE);
  } catch {
    // ignore
  }
}
