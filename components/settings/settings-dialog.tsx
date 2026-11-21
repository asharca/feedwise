"use client";

import { useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SettingsContent, type SettingsSectionKey } from "@/components/settings/settings-content";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialSection?: SettingsSectionKey;
  onSectionChange?: (section: SettingsSectionKey) => void;
}

export function SettingsDialog({
  open,
  onOpenChange,
  initialSection,
  onSectionChange,
}: SettingsDialogProps) {
  const activeNavRef = useRef<HTMLButtonElement | null>(null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        initialFocus={() => {
          const button = activeNavRef.current;
          if (!button) return null;
          const nav = button.closest("nav");
          if (nav && window.getComputedStyle(nav).display === "none") return null;
          return button;
        }}
        className="!max-w-none w-[calc(100vw-1rem)] h-[calc(100dvh-1rem)] sm:w-[min(94vw,960px)] sm:h-[min(86dvh,680px)] overflow-hidden flex flex-col gap-0 p-0 rounded-lg"
      >
        <DialogHeader className="shrink-0 border-b border-border px-4 py-4 pr-12 sm:px-5">
          <DialogTitle>设置</DialogTitle>
        </DialogHeader>
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain scrollbar-thin p-3 sm:p-5">
          <SettingsContent
            initialSection={initialSection}
            variant="dialog"
            onSectionChange={onSectionChange}
            activeNavRef={activeNavRef}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
