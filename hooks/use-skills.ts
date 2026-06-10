"use client";

import { useQuery } from "@tanstack/react-query";

interface Skill {
  id: string;
  name: string;
  description: string;
  source: string;
  version: string;
  _count: { tasks: number };
  versions: { version: string; createdAt: string }[];
}

export function useSkills() {
  return useQuery<{ skills: Skill[] }>({
    queryKey: ["skills"],
    queryFn: async () => {
      const res = await fetch("/api/skills");
      if (!res.ok) throw new Error("Failed to fetch skills");
      return res.json();
    },
  });
}

export function useSkill(id: string) {
  return useQuery({
    queryKey: ["skill", id],
    queryFn: async () => {
      const res = await fetch(`/api/skills/${id}`);
      if (!res.ok) throw new Error("Failed to fetch skill");
      return res.json();
    },
    enabled: !!id,
  });
}
