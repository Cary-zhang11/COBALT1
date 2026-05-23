"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSkills } from "@/hooks/use-skills";
import { useCreateTask, useExecuteTask } from "@/hooks/use-tasks";
import { Upload, Wand2, Loader2, FileText } from "lucide-react";

export default function NewTaskPage() {
  const router = useRouter();
  const { data: skillsData, isLoading: skillsLoading } = useSkills();
  const createTask = useCreateTask();
  const executeTask = useExecuteTask();

  const [selectedSkillId, setSelectedSkillId] = useState("");
  const [input, setInput] = useState("");
  const [files, setFiles] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const skills = skillsData?.skills || [];

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList) return;

    setUploading(true);
    const uploadedPaths: string[] = [];

    for (const file of Array.from(fileList)) {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      if (res.ok) {
        const data = await res.json();
        uploadedPaths.push(data.filePath);
      }
    }

    setFiles((prev) => [...prev, ...uploadedPaths]);
    setUploading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSkillId || !input) return;

    setSubmitting(true);
    try {
      const result = await createTask.mutateAsync({
        skillId: selectedSkillId,
        input,
        uploadedFiles: files.length > 0 ? files : undefined,
      });

      await executeTask.mutateAsync(result.taskId);
      router.push(`/tasks/${result.taskId}/execute`);
    } catch (err) {
      console.error(err);
      setSubmitting(false);
    }
  };

  return (
    <div className="flex-1 overflow-auto p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold mb-2">新建任务</h1>
        <p className="text-muted-foreground text-sm mb-8">
          选择技能、输入需求，启动 AI 执行
        </p>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium mb-2">选择技能</label>
            {skillsLoading ? (
              <div className="p-4 text-center text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin inline mr-2" />
                加载中...
              </div>
            ) : skills.length === 0 ? (
              <div className="p-4 text-center text-muted-foreground border rounded-lg border-dashed">
                暂无可用技能，请先上传 Skill
              </div>
            ) : (
              <div className="grid gap-2">
                {skills.map((skill) => (
                  <button
                    key={skill.id}
                    type="button"
                    onClick={() => setSelectedSkillId(skill.id)}
                    className={`p-4 border rounded-lg text-left transition-all ${
                      selectedSkillId === skill.id
                        ? "border-blue-500 bg-blue-50 ring-1 ring-blue-500"
                        : "hover:border-gray-300"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Wand2 className="w-4 h-4 text-blue-600" />
                      <div>
                        <p className="font-medium text-sm">{skill.name}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {skill.description || "无描述"}
                        </p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">需求描述</label>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              rows={5}
              className="w-full px-4 py-3 border rounded-lg text-sm resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              placeholder="描述你的需求..."
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              上传文件（可选）
            </label>
            <div className="border border-dashed rounded-lg p-4">
              <input
                type="file"
                multiple
                onChange={handleFileUpload}
                className="hidden"
                id="file-input"
              />
              <label
                htmlFor="file-input"
                className="flex items-center justify-center gap-2 cursor-pointer text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                {uploading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Upload className="w-4 h-4" />
                )}
                {uploading ? "上传中..." : "点击上传文件"}
              </label>
              {files.length > 0 && (
                <div className="mt-3 space-y-1">
                  {files.map((f, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
                      <FileText className="w-3 h-3" />
                      {f.split(/[/\\]/).pop()}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <button
            type="submit"
            disabled={!selectedSkillId || !input || submitting}
            className="w-full py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:bg-blue-300 transition-colors flex items-center justify-center gap-2"
          >
            {submitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Wand2 className="w-4 h-4" />
            )}
            {submitting ? "创建并启动中..." : "创建并执行"}
          </button>
        </form>
      </div>
    </div>
  );
}
