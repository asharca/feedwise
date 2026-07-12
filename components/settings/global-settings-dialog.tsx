"use client";

import { Suspense } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SettingsDialog } from "./settings-dialog";
import { SETTINGS_SECTIONS, type SettingsSectionKey } from "./settings-content";

const VALID = new Set<string>(SETTINGS_SECTIONS.map((s) => s.key));

function isSection(value: string | null): value is SettingsSectionKey {
  return value !== null && VALID.has(value);
}

function Inner() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const param = searchParams.get("settings");

  // `?settings=` (empty value) and `?settings=anything-valid` both open it.
  // Default to "appearance" if value is empty or unrecognised.
  const open = param !== null;
  const section: SettingsSectionKey = isSection(param) ? param : "appearance";

  function handleOpenChange(next: boolean) {
    if (next) return; // open is driven by URL writes elsewhere
    const p = new URLSearchParams(searchParams.toString());
    p.delete("settings");
    const q = p.toString();
    router.replace(q ? `${pathname}?${q}` : pathname);
  }

  function handleSectionChange(next: SettingsSectionKey) {
    const p = new URLSearchParams(searchParams.toString());
    p.set("settings", next);
    router.replace(`${pathname}?${p.toString()}`, { scroll: false });
  }

  return (
    <SettingsDialog
      open={open}
      onOpenChange={handleOpenChange}
      initialSection={section}
      onSectionChange={handleSectionChange}
    />
  );
}

/**
 * Mount once near the top of the (reader) layout. Reads `?settings=<section>`
 * from the URL and opens/closes the settings dialog accordingly, so links and
 * deep-links can target individual sections.
 */
export function GlobalSettingsDialog() {
  return (
    <Suspense>
      <Inner />
    </Suspense>
  );
}
