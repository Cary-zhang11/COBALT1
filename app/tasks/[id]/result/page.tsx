"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { useTask } from "@/hooks/use-tasks";
import {
  CheckCircle2,
  AlertCircle,
  Clock,
  Star,
  Download,
  FileText,
  Loader2,
  ExternalLink,
} from "lucide-react";
import Link from "next/link";

interface OutputFile {
  name: string;
  path: string;
}

export default function TaskResultPage() {
  const params = useParams();
  const taskId = params.id as string;
  const { data, isLoading } = useTask(taskId);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [feedbackSent, setFeedbackSent] = useState(false);
  const [outputFiles, setOutputFiles] = useState<OutputFile[]>([]);

  useEffect(() => {
    fetch(`/api/tasks/${taskId}/download`)
      .then((r) => r.json())
      .then((d) => setOutputFiles(d.files || []))
      .catch(() => {});
  }, [taskId]);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const task = data?.task;
  if (!task) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        任务不存在
      </div>
    );
  }

  const isSuccess = task.status === "completed";

  const handleFeedback = async () => {
    if (!rating) return;
    await fetch(`/api/tasks/${taskId}/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rating, comment }),
    });
    setFeedbackSent(true);
  };

  const fileIcon = (name: string) => {
    const ext = name.split(".").pop()?.toLowerCase();
    const colors: Record<string, string> = {
      xmind: "text-orange-500",
      xlsx: "text-green-600",
      json: "text-blue-500",
      md: "text-violet-500",
    };
    return <FileText className={`w-4 h-4 ${colors[ext || ""] || "text-muted-foreground"}`} />;
  };

  return (
    <div className="flex-1 overflow-auto p-8">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          {isSuccess ? (
            <CheckCircle2 className="w-6 h-6 text-green-600" />
          ) : (
            <AlertCircle className="w-6 h-6 text-red-600" />
          )}
          <h1 className="text-2xl font-bold">
            {isSuccess ? "任务完成" : "任务失败"}
          </h1>
        </div>

        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="p-4 bg-card border rounded-xl">
            <p className="text-xs text-muted-foreground mb-1">工具</p>
            <p className="font-medium text-sm">{task.skill?.name}</p>
          </div>
          <div className="p-4 bg-card border rounded-xl">
            <p className="text-xs text-muted-foreground mb-1">耗时</p>
            <div className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-muted-foreground" />
              <p className="font-medium text-sm">
                {task.duration ? `${(task.duration / 60000).toFixed(1)} 分钟` : "—"}
              </p>
            </div>
          </div>
          <div className="p-4 bg-card border rounded-xl">
            <p className="text-xs text-muted-foreground mb-1">状态</p>
            <p className={`font-medium text-sm ${isSuccess ? "text-green-600" : "text-red-600"}`}>
              {isSuccess ? "成功" : "失败"}
            </p>
          </div>
        </div>

        {isSuccess && outputFiles.length > 0 && (
          <div className="mb-8">
            <h2 className="font-semibold mb-3">输出文件</h2>
            <div className="space-y-2">
              {outputFiles.map((file, i) => (
                <a
                  key={i}
                  href={file.path}
                  download
                  className="flex items-center gap-3 p-3 border rounded-lg hover:bg-gray-50 transition-colors cursor-pointer group"
                >
                  {fileIcon(file.name)}
                  <span className="text-sm flex-1 truncate font-medium group-hover:text-blue-600 transition-colors">
                    {file.name}
                  </span>
                  <Download className="w-4 h-4 text-muted-foreground group-hover:text-blue-600 transition-colors" />
                </a>
              ))}
            </div>
          </div>
        )}

        {task.output && (
          <div className="mb-8">
            <h2 className="font-semibold mb-3">执行摘要</h2>
            <div className="bg-gray-50 border rounded-xl p-5 text-sm whitespace-pre-wrap max-h-96 overflow-auto font-mono">
              {task.output}
            </div>
          </div>
        )}

        {!feedbackSent ? (
          <div className="bg-card border rounded-xl p-6">
            <h2 className="font-semibold mb-3">评价此次执行</h2>
            <div className="flex items-center gap-1 mb-4">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  onClick={() => setRating(n)}
                  className="p-1"
                >
                  <Star
                    className={`w-6 h-6 ${
                      n <= rating
                        ? "text-yellow-400 fill-yellow-400"
                        : "text-gray-200"
                    }`}
                  />
                </button>
              ))}
            </div>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={3}
              placeholder="有什么建议？（可选）"
              className="w-full px-4 py-2 border rounded-lg text-sm resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none mb-3"
            />
            <button
              onClick={handleFeedback}
              disabled={!rating}
              className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:bg-blue-300 transition-colors"
            >
              提交评价
            </button>
          </div>
        ) : (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-sm text-green-700">
            感谢你的反馈！
          </div>
        )}

        <div className="mt-6">
          <Link
            href="/"
            className="text-blue-600 hover:text-blue-700 text-sm font-medium"
          >
            ← 返回任务列表
          </Link>
        </div>
      </div>
    </div>
  );
}
