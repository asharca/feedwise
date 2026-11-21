"use client";

import { useState, type RefObject } from "react";
import { cn } from "@/lib/utils";
import { AppearanceSection } from "@/components/settings/appearance-section";
import { FeedsSection } from "@/components/settings/feeds-section";
import { RulesSection } from "@/components/settings/rules-section";
import { NotificationsSection } from "@/components/settings/notifications-section";
import { DigestEmailSection } from "@/components/settings/digest-email-section";
import { SmartDigestSection } from "@/components/settings/smart-digest-section";
import { ClientsSection } from "@/components/settings/clients-section";
import { ShareFeedsSection } from "@/components/settings/share-feeds-section";
import { McpSection } from "@/components/settings/mcp-section";
import { AccountSection } from "@/components/settings/account-section";

export const SETTINGS_SECTIONS = [
  { key: "appearance", label: "外观" },
  { key: "feeds", label: "订阅源" },
  { key: "rules", label: "规则" },
  { key: "notifications", label: "通知渠道" },
  { key: "digest", label: "邮件摘要" },
  { key: "smart", label: "智能摘要" },
  { key: "clients", label: "第三方客户端" },
  { key: "share", label: "RSS 输出" },
  { key: "mcp", label: "MCP / AI 助手" },
  { key: "account", label: "账号" },
] as const;

export type SettingsSectionKey = (typeof SETTINGS_SECTIONS)[number]["key"];

interface SettingsContentProps {
  initialSection?: SettingsSectionKey;
  /** Optional dense layout for use inside a dialog (drops outer padding). */
  variant?: "page" | "dialog";
  onSectionChange?: (section: SettingsSectionKey) => void;
  /** Optional ref attached to the active desktop nav button (used for dialog initialFocus). */
  activeNavRef?: RefObject<HTMLButtonElement | null>;
}

export function SettingsContent({
  initialSection = "appearance",
  variant = "page",
  onSectionChange,
  activeNavRef,
}: SettingsContentProps) {
  const [active, setActive] = useState<SettingsSectionKey>(initialSection);
  const [prevInitial, setPrevInitial] = useState<SettingsSectionKey>(initialSection);

  if (initialSection !== prevInitial) {
    setPrevInitial(initialSection);
    setActive(initialSection);
  }

  function selectSection(next: SettingsSectionKey) {
    setActive(next);
    onSectionChange?.(next);
  }

  function renderActiveSection() {
    switch (active) {
      case "appearance":
        return <AppearanceSection />;
      case "feeds":
        return <FeedsSection />;
      case "rules":
        return <RulesSection />;
      case "notifications":
        return <NotificationsSection />;
      case "digest":
        return <DigestEmailSection />;
      case "smart":
        return <SmartDigestSection />;
      case "clients":
        return <ClientsSection />;
      case "share":
        return <ShareFeedsSection />;
      case "mcp":
        return <McpSection />;
      case "account":
        return <AccountSection />;
    }
  }

  const gap = variant === "dialog" ? "gap-5" : "gap-6";
  const railWidth = variant === "dialog" ? "w-40" : "w-44";

  return (
    <>
      {/* Mobile section picker */}
      <div className="mb-4 md:hidden">
        <select
          aria-label="设置分组"
          value={active}
          onChange={(e) => selectSection(e.target.value as SettingsSectionKey)}
          className="h-11 w-full cursor-pointer rounded-md border border-input bg-muted px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {SETTINGS_SECTIONS.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      <div className={cn("flex flex-col md:flex-row", gap)}>
        <nav
          aria-label="设置导航"
          className={cn("hidden md:flex flex-col gap-1 shrink-0", railWidth)}
        >
          {SETTINGS_SECTIONS.map((s) => (
            <button
              key={s.key}
              ref={active === s.key ? activeNavRef : undefined}
              type="button"
              onClick={() => selectSection(s.key)}
              aria-current={active === s.key ? "page" : undefined}
              className={cn(
                "text-left px-3 py-2 rounded-md text-sm font-medium transition-colors",
                active === s.key
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
              )}
            >
              {s.label}
            </button>
          ))}
        </nav>

        <div className="settings-section min-w-0 flex-1 [&_[data-slot=card]]:gap-5 [&_[data-slot=card]]:overflow-visible [&_[data-slot=card]]:border-0 [&_[data-slot=card]]:bg-transparent [&_[data-slot=card]]:py-0 [&_[data-slot=card-header]]:px-0 [&_[data-slot=card-content]]:px-0">
          {renderActiveSection()}
        </div>
      </div>
    </>
  );
}
