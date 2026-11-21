"use client";

import { LogOut, Moon, Settings, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SidebarFooter, useSidebar } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/auth/client";
import { cn } from "@/lib/utils";

export function SidebarFooterSection() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { resolvedTheme, setTheme } = useTheme();
  const { setOpenMobile } = useSidebar();
  const nextTheme = resolvedTheme === "dark" ? "light" : "dark";

  function handleSettingsClick() {
    setOpenMobile(false);

    // The dedicated settings route already renders SettingsContent. Do not
    // layer the query-driven settings dialog over the same page.
    if (pathname === "/settings") return;

    const p = new URLSearchParams(searchParams.toString());
    p.set("settings", "appearance");
    router.replace(`${pathname}?${p.toString()}`);
  }

  return (
    <SidebarFooter className="space-y-1 px-2 pb-3">
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="size-8 rounded-md"
          onClick={() => setTheme(nextTheme)}
          aria-label="切换主题"
          title="切换主题"
        >
          <Sun className="size-4 scale-100 rotate-0 transition-transform dark:scale-0 dark:-rotate-90" />
          <Moon className="absolute size-4 scale-0 rotate-90 transition-transform dark:scale-100 dark:rotate-0" />
        </Button>
        <div className="flex-1" />
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            "size-8 rounded-md",
            pathname === "/settings" && "bg-primary/10 text-foreground",
          )}
          onClick={handleSettingsClick}
          aria-label="设置"
          aria-current={pathname === "/settings" ? "page" : undefined}
          title="设置"
        >
          <Settings className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-8 rounded-md text-muted-foreground"
          onClick={() => signOut().then(() => router.push("/login"))}
          aria-label="退出登录"
          title="退出登录"
        >
          <LogOut className="size-4" />
        </Button>
      </div>
    </SidebarFooter>
  );
}
