"use client";

import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

const Dialog = ({ children, open, onOpenChange }: { children: React.ReactNode; open: boolean; onOpenChange: (open: boolean) => void }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={() => onOpenChange(false)} />
      <div className="relative z-50 bg-card border rounded-xl shadow-2xl max-w-lg w-full mx-4 overflow-hidden">
        {children}
      </div>
    </div>
  );
};

const DialogHeader = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <div className={cn("flex items-center justify-between px-6 py-4 border-b", className)}>
    {children}
    <button className="p-1 rounded-lg hover:bg-muted transition-colors">
      <X className="w-4 h-4" />
    </button>
  </div>
);

const DialogTitle = ({ children }: { children: React.ReactNode }) => (
  <h2 className="text-lg font-semibold">{children}</h2>
);

const DialogContent = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <div className={cn("px-6 py-4", className)}>{children}</div>
);

const DialogFooter = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <div className={cn("flex items-center justify-end gap-2 px-6 py-4 border-t bg-muted/30", className)}>
    {children}
  </div>
);

export { Dialog, DialogHeader, DialogTitle, DialogContent, DialogFooter };
