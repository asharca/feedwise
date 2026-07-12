"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SettingsContent } from "@/components/settings/settings-content";

export default function SettingsPage() {
  const router = useRouter();
  return (
    <div className="h-full min-h-0 overflow-y-auto scrollbar-thin">
      <div className="mx-auto max-w-4xl px-4 py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:p-8">
        <div className="flex items-center gap-3 mb-8">
          <Button
            variant="ghost"
            size="icon"
            className="size-8 rounded-md"
            onClick={() => router.push("/reader")}
            aria-label="Back to reader"
          >
            <ArrowLeft className="size-4" />
          </Button>
          <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
        </div>
        <SettingsContent variant="page" />
      </div>
    </div>
  );
}
