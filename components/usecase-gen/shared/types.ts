export interface UsecaseCase {
  id: string;
  title: string;
  priority: "P0" | "P1" | "P2";
  precondition: string;
  steps: string;
  expected: string;
  tags: string;
}

export interface UsecaseModule {
  name: string;
  open: boolean;
  cases: UsecaseCase[];
}

export interface TweakEntry {
  round: number;
  instruction: string;
  time: string;
  delta: string;
}
