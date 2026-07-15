import fs from "fs/promises";
import path from "path";

const DATA_DIR = path.resolve(process.cwd(), "data");
const ACCOUNT_FILE = path.join(DATA_DIR, "knowledge-account.json");

export interface KnowledgeAccount {
  username: string;
  password: string;
  updatedAt: string;
}

interface StoredAccount {
  username: string;
  password_b64: string;
  updatedAt: string;
}

export async function getKnowledgeAccount(): Promise<KnowledgeAccount | null> {
  try {
    const raw = await fs.readFile(ACCOUNT_FILE, "utf-8");
    const parsed = JSON.parse(raw) as StoredAccount;
    if (!parsed?.username || !parsed?.password_b64) return null;
    return {
      username: parsed.username,
      password: Buffer.from(parsed.password_b64, "base64").toString("utf-8"),
      updatedAt: parsed.updatedAt || new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export async function saveKnowledgeAccount(
  username: string,
  password: string
): Promise<KnowledgeAccount> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const record: StoredAccount = {
    username,
    password_b64: Buffer.from(password, "utf-8").toString("base64"),
    updatedAt: new Date().toISOString(),
  };
  await fs.writeFile(ACCOUNT_FILE, JSON.stringify(record, null, 2), "utf-8");
  return {
    username,
    password,
    updatedAt: record.updatedAt,
  };
}

export async function clearKnowledgeAccount(): Promise<void> {
  try {
    await fs.unlink(ACCOUNT_FILE);
  } catch {
    // ignore
  }
}
