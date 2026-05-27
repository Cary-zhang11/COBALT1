"use client";

import { useState } from "react";
import { useSkills } from "@/hooks/use-skills";
import { useQueryClient } from "@tanstack/react-query";
import { Wand2, Upload, Loader2, Package } from "lucide-react";

export default function SkillsPage() {
  const { data, isLoading } = useSkills();
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);

  const skills = data?.skills || [];

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/skills", { method: "POST", body: formData });
      if (res.ok) {
        queryClient.invalidateQueries({ queryKey: ["skills"] });
      }
    } catch (err) {
      console.error("Upload failed:", err);
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold">工具库</h1>
            <p className="text-muted-foreground text-sm mt-1">
              浏览和上传工具包
            </p>
          </div>
          <label className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors cursor-pointer">
            {uploading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Upload className="w-4 h-4" />
            )}
            {uploading ? "上传中..." : "上传工具 (.zip)"}
            <input
              type="file"
              accept=".zip"
              onChange={handleUpload}
              className="hidden"
            />
          </label>
        </div>

        {skills.length === 0 ? (
          <div className="text-center py-16 bg-muted/30 rounded-xl border border-dashed">
            <Package className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground mb-2">暂无工具</p>
            <p className="text-xs text-muted-foreground">
              上传包含 SKILL.md 的 .zip 文件，或等待系统同步内置工具
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {skills.map((skill) => (
              <div
                key={skill.id}
                className="p-5 bg-card border rounded-xl hover:shadow-md transition-all"
              >
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-blue-50">
                    <Wand2 className="w-4 h-4 text-blue-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-sm">{skill.name}</h3>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                      {skill.description || "无描述"}
                    </p>
                    <div className="flex items-center gap-3 mt-3 text-xs text-muted-foreground">
                      <span>来源: {skill.source}</span>
                      <span>使用: {skill._count.tasks} 次</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
