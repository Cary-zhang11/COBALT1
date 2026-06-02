import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { startTaskExecution } from "@/lib/task-engine";
import { getOutputPath } from "@/lib/sandbox";
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
      if (body.referenceFiles && Array.isArray(body.referenceFiles)) {
        const UPLOADS_ROOT = path.resolve(process.cwd(), "uploads");
        const SANDBOX_ROOT = path.resolve(process.cwd(), "sandbox");

        referenceFiles = body.referenceFiles.map(
          (ref: {
            sourcePath?: string;
            sourceTaskId?: string;
            mdFileName?: string;
            subdir: string;
            destName: string;
          }) => {
            let sourcePath: string;

            if (ref.sourceTaskId) {
              // 平台生成历史
              sourcePath = path.join(
                getOutputPath(ref.sourceTaskId),
                ref.mdFileName || ""
              );
            } else if (ref.sourcePath) {
              // 业务知识/手动上传历史
              sourcePath = path.resolve(process.cwd(), ref.sourcePath);
            } else {
              throw new Error("Invalid reference file");
            }

            // 路径安全校验
            if (
              !sourcePath.startsWith(UPLOADS_ROOT) &&
              !sourcePath.startsWith(SANDBOX_ROOT)
            ) {
              throw new Error(`Path traversal: ${sourcePath}`);
            }

            return { sourcePath, subdir: ref.subdir, destName: ref.destName };
          }
        );
      }
    } catch {
      // body 可能为空（向后兼容）
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
