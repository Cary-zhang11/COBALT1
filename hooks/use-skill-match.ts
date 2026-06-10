"use client";

import { useState } from "react";

interface MatchResult {
  skillId: string;
  name: string;
  description: string;
  confidence: number;
  reason: string;
}

export function useSkillMatch() {
  const [matches, setMatches] = useState<MatchResult[]>([]);
  const [suggested, setSuggested] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const match = async (input: string) => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/skills/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input }),
      });
      if (!res.ok) throw new Error("Match failed");
      const data = await res.json();
      setMatches(data.matches || []);
      setSuggested(data.suggested || null);
      return data;
    } catch (err) {
      console.error(err);
      setMatches([]);
      setSuggested(null);
    } finally {
      setIsLoading(false);
    }
  };

  return { matches, suggested, isLoading, match };
}
