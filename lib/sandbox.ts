import path from "path";
import fs from "fs/promises";

const SANDBOX_ROOT = process.env.SANDBOX_ROOT || "./sandbox";

function resolve(taskId: string, subdir: string): string {
  return path.resolve(process.cwd(), SANDBOX_ROOT, taskId, subdir);
}

export function getSandboxPath(taskId: string): string {
  return path.resolve(process.cwd(), SANDBOX_ROOT, taskId);
}

export function getWorkspacePath(taskId: string): string {
  return resolve(taskId, "workspace");
}

export function getOutputPath(taskId: string): string {
  return resolve(taskId, "output");
}

export function getTempPath(taskId: string): string {
  return resolve(taskId, "temp");
}

export async function ensureSandbox(taskId: string): Promise<void> {
  await fs.mkdir(getWorkspacePath(taskId), { recursive: true });
  await fs.mkdir(getOutputPath(taskId), { recursive: true });
  await fs.mkdir(getTempPath(taskId), { recursive: true });
}

export async function copyFilesToWorkspace(
  taskId: string,
  filePaths: string[]
): Promise<string[]> {
  const workspaceDir = getWorkspacePath(taskId);
  await fs.mkdir(workspaceDir, { recursive: true });

  const copiedPaths: string[] = [];
  for (const filePath of filePaths) {
    const fileName = path.basename(filePath);
    const destPath = path.join(workspaceDir, fileName);
    await fs.copyFile(filePath, destPath);
    copiedPaths.push(destPath);
  }
  return copiedPaths;
}

export async function cleanupSandbox(taskId: string): Promise<void> {
  const taskDir = path.resolve(process.cwd(), SANDBOX_ROOT, taskId);
  try {
    await fs.rm(taskDir, { recursive: true, force: true });
  } catch {
    console.warn(`Failed to cleanup sandbox for task ${taskId}`);
  }
}

export function validatePath(filePath: string, taskId: string): boolean {
  const sandboxBase = path.resolve(process.cwd(), SANDBOX_ROOT, taskId);
  const resolved = path.resolve(filePath);
  return resolved.startsWith(sandboxBase);
}
