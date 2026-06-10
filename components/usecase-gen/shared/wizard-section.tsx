"use client";

import type { ReactNode } from "react";

interface WizardSectionProps {
  title: string;
  icon?: ReactNode;
  meta?: string;
  id?: string;
  children: ReactNode;
}

/** Step3 主区统一区块壳 — 对齐 layout-spacing-preview sectionCard */
export function WizardSection({ title, icon, meta, id, children }: WizardSectionProps) {
  return (
    <div id={id} className="bg-card rounded-xl shadow-sm border border-border/60 overflow-hidden">
      <div className="px-5 py-3 flex items-center justify-between gap-2 border-b bg-muted/20 min-h-[44px]">
        <h3 className="font-semibold text-sm flex items-center gap-2 leading-none min-w-0">
          {icon}
          <span className="truncate">{title}</span>
        </h3>
        {meta ? (
          <span className="text-xs text-muted-foreground font-normal whitespace-nowrap shrink-0">
            {meta}
          </span>
        ) : null}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}
