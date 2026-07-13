import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { startTaskExecution } from "@/lib/task-engine";
import { getOutputPath } from "@/lib/sandbox";

export const dynamic = "force-dynamic";
import path from "path";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const token = req.cookies.get("token")?.value;
    const { userId } = await getAuthUser(token);

    const result = await prisma.task.updateMany({
      where: { id: params.id, userId, status: "pending" },
      data: { status: "running" },
    });

    if (result.count === 0) {
      return NextResponse.json(
        { error: "Task not found or not in pending state" },
        { status: 409 }
      );
    }

    // 读取 referenceFiles 并解析为绝对路径
    let referenceFiles:
      | { sourcePath: string; subdir: string; destName: string }[]
      | undefined;

    try {
      const body = await req.json();
      console.log(`[execute] received body.referenceFiles:`, JSON.stringify(body.referenceFiles || []));
      if (body.referenceFiles && Array.isArray(body.referenceFiles) && body.referenceFiles.length > 0) {
        const UPLOADS_ROOT = path.resolve(process.cwd(), "uploads");
        const SANDBOX_ROOT = path.resolve(process.cwd(), "sandbox");

        referenceFiles = [];
        for (const ref of body.referenceFiles) {
          try {
            let sourcePath: string;

            if (ref.sourceTaskId) {
              sourcePath = path.join(
                getOutputPath(ref.sourceTaskId),
                ref.mdFileName || ""
              );
            } else if (ref.sourcePath) {
              // Knowledge.content 存的是 "knowledge/{uuid}.md"，resolve 时补上 uploads/ 前缀
              sourcePath = path.resolve(process.cwd(), "uploads", ref.sourcePath);
            } else {
              console.warn(`[execute] skipping reference: no sourcePath or sourceTaskId`, ref);
              continue;
            }

            if (
              !sourcePath.startsWith(UPLOADS_ROOT) &&
              !sourcePath.startsWith(SANDBOX_ROOT)
            ) {
              console.warn(`[execute] skipping reference: path traversal detected: ${sourcePath}`);
              continue;
            }

            console.log(`[execute] resolved reference: ${sourcePath} → ${ref.subdir}/${ref.destName}`);
            referenceFiles.push({
              sourcePath,
              subdir: ref.subdir,
              destName: ref.destName,
            });
          } catch (err) {
            console.warn(`[execute] skipping reference file due to error:`, err);
          }
        }
        console.log(`[execute] total referenceFiles resolved: ${referenceFiles.length}`);
      }
    } catch {
      console.log(`[execute] no body or body parse failed (backward compat)`);
    }

    // 递增引用次数
    if (referenceFiles && referenceFiles.length > 0) {
      for (const ref of referenceFiles) {
        try {
          // 从路径中提取 uuid：uploads/knowledge/{uuid}.md 或 uploads/history/{uuid}.md（兼容 \ 和 /）
          const knowledgeMatch = ref.sourcePath.match(/uploads[\\/](knowledge|history)[\\/]([a-f0-9-]+)\.md$/i);
          if (knowledgeMatch) {
            const knowledgeId = knowledgeMatch[2];
            await prisma.knowledge.update({
              where: { id: knowledgeId },
              data: { refCount: { increment: 1 } },
            });
            console.log(`[execute] incremented refCount for knowledge id="${knowledgeId}"`);
            continue;
          }
          // 从路径中提取 taskId：sandbox/{taskId}/output/{fileName}
          const taskMatch = ref.sourcePath.match(/sandbox[\\/]([a-f0-9-]+)[\\/]output[\\/]/i);
          if (taskMatch) {
            const sourceTaskId = taskMatch[1];
            await prisma.task.update({
              where: { id: sourceTaskId },
              data: { refCount: { increment: 1 } },
            });
            console.log(`[execute] incremented refCount for platform task id="${sourceTaskId}"`);
          }
        } catch (err) {
          console.warn(`[execute] failed to increment refCount:`, err);
        }
      }
    }

    startTaskExecution(params.id, referenceFiles).catch((err) => {
      console.error("Task execution error:", err);
    });

    return NextResponse.json({ success: true, status: "running" });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Execution failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
