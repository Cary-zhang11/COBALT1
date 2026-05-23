import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const token = req.cookies.get("token")?.value;
  try {
    await getAuthUser(token);
  } catch {
    return new Response("Unauthorized", { status: 401 });
  }

  const encoder = new TextEncoder();
  let lastSequence = 0;
  let isActive = true;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        );
      };

      const poll = async () => {
        while (isActive) {
          try {
            const task = await prisma.task.findUnique({
              where: { id: params.id },
              select: { status: true },
            });

            if (!task) {
              send("error", { message: "Task not found" });
              controller.close();
              return;
            }

            const newLogs = await prisma.taskLog.findMany({
              where: { taskId: params.id, sequence: { gt: lastSequence } },
              orderBy: { sequence: "asc" },
            });

            for (const log of newLogs) {
              send("log", {
                sequence: log.sequence,
                type: log.type,
                output: log.output,
                input: log.input,
                createdAt: log.createdAt,
              });
              lastSequence = log.sequence;
            }

            if (["completed", "failed", "cancelled"].includes(task.status)) {
              send("done", { status: task.status });
              controller.close();
              return;
            }

            if (task.status === "paused") {
              send("paused", { status: "paused" });
            }

            await new Promise((r) => setTimeout(r, 1000));
          } catch (error) {
            send("error", {
              message:
                error instanceof Error ? error.message : "Polling error",
            });
            controller.close();
            return;
          }
        }
      };

      poll();
    },
    cancel() {
      isActive = false;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
