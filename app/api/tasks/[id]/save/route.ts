import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { getOutputPath, validatePath } from "@/lib/sandbox";
import {
  mindMapTreeToMarkdown,
  type MindMapData,
} from "@/lib/md-mindmap-convert";
import path from "path";
import fs from "fs/promises";

/**
 * Convert any input `.xmind` path to its `.edited.xmind` counterpart.
 * Idempotent: if the input already contains the `.edited.` infix it is
 * returned unchanged, so editing an existing edited file writes back to
 * itself (no `.edited.edited.xmind` nesting).
 */
function toEditedXmindPath(relPath: string): string {
  if (/\.edited\.xmind$/i.test(relPath)) return relPath;
  return relPath.replace(/\.xmind$/i, ".edited.xmind");
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const token = req.cookies.get("token")?.value;
    await getAuthUser(token);

    const taskId = params.id;
    const body = (await req.json()) as {
      filePath?: string;
      xmindBase64?: string;
      treeJson?: MindMapData;
    };
    const { filePath, xmindBase64, treeJson } = body;

    if (!filePath || !xmindBase64) {
      return NextResponse.json(
        { error: "filePath and xmindBase64 are required" },
        { status: 400 }
      );
    }
    if (!/\.xmind$/i.test(filePath)) {
      return NextResponse.json(
        { error: "filePath must end with .xmind" },
        { status: 400 }
      );
    }
    // Reject paths that point into the archive/ sub-directory — those are
    // legacy snapshots and editing them would corrupt the history layout.
    if (/(^|[\\/])archive[\\/]/i.test(filePath)) {
      return NextResponse.json(
        { error: "Cannot save into archive/ directory" },
        { status: 400 }
      );
    }

    const outputDir = getOutputPath(taskId);
    const editedRelPath = toEditedXmindPath(filePath);
    const editedXmindPath = path.resolve(outputDir, editedRelPath);
    if (!validatePath(editedXmindPath, taskId)) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Companion .md path: same dir, same base name, .md extension.
    const editedMdPath = editedXmindPath.replace(/\.xmind$/i, ".md");
    if (!validatePath(editedMdPath, taskId)) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // .xmind base64 → bytes
    const binaryStr = atob(xmindBase64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }

    await fs.mkdir(path.dirname(editedXmindPath), { recursive: true });
    await fs.writeFile(editedXmindPath, bytes);

    // Generate sibling .md from the tree JSON (best-effort — failure here
    // must not roll back the .xmind write).
    let mdSynced = false;
    if (treeJson) {
      try {
        const markdown = mindMapTreeToMarkdown(treeJson);
        await fs.writeFile(editedMdPath, markdown, "utf-8");
        mdSynced = true;
      } catch (err) {
        console.error("Save: md sync failed:", err);
      }
    }

    return NextResponse.json({
      success: true,
      editedPath: editedRelPath,
      mdSynced,
    });
  } catch (error) {
    console.error("Save error:", error);
    const message = error instanceof Error ? error.message : "Save failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
