"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  SettingsContent,
  type SettingsSectionKey,
} from "@/components/settings/settings-content";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialSection?: SettingsSectionKey;
}

export function SettingsDialog({ open, onOpenChange, initialSection }: SettingsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        // Locked dimensions so the dialog doesn't reflow when switching
        // between sections of different lengths. Falls back to viewport
        // bounds on small screens.
        className="!max-w-none rounded-lg w-[min(95vw,1024px)] h-[min(85vh,720px)] overflow-hidden flex flex-col"
      >
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>
        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin">
          <SettingsContent
            // Re-mount on initialSection change so the active section follows
            // a deep-link that switches sections without closing the dialog.
            key={initialSection ?? "appearance"}
            initialSection={initialSection}
            variant="dialog"
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
