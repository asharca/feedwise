"use client";

import { Home, CircleDot, Star, Search, Tag, Clock, Compass } from "lucide-react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useSidebar } from "@/components/ui/sidebar";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

const smartViews = [
  { key: "all", label: "Home", icon: Home },
  { key: "unread", label: "Unread", icon: CircleDot },
  { key: "starred", label: "Starred", icon: Star },
] as const;

const navLinks = [
  { href: "/reader?search=", label: "Search", icon: Search },
  { href: "/reader/tags", label: "Tags", icon: Tag },
  { href: "/reader/history", label: "History", icon: Clock },
  { href: "/discover", label: "Discover", icon: Compass },
] as const;

export interface SidebarNavProps {
  totalUnread: number;
}

export function SidebarNav({ totalUnread }: SidebarNavProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { setOpenMobile } = useSidebar();

  const activeFeedId = searchParams.get("feedId");
  const activeFolderId = searchParams.get("folderId");
  const activeView = searchParams.get("view") ?? "all";

  return (
    <SidebarGroup>
      <SidebarGroupContent>
        <SidebarMenu>
          {smartViews.map(({ key, label, icon: Icon }) => (
            <SidebarMenuItem key={key}>
              <SidebarMenuButton
                isActive={
                  activeView === key &&
                  !activeFeedId &&
                  !activeFolderId &&
                  !searchParams.has("search") &&
                  pathname === "/reader"
                }
                onClick={() => {
                  setOpenMobile(false);
                  router.replace(`/reader?view=${key}`);
                }}
                className="rounded-md h-9 transition-all duration-150"
              >
                <Icon
                  className={cn(
                    "size-4",
                    key === "starred" && activeView === key && "text-yellow-500",
                  )}
                />
                <span className="flex-1">{label}</span>
                {key === "unread" && totalUnread > 0 && (
                  <span className="text-[10px] tabular-nums px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                    {totalUnread}
                  </span>
                )}
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
          {navLinks.map(({ href, label, icon: Icon }) => {
            // Search lives at /reader?search=… so pathname alone can't tell
            // it apart from Home — check the query string too.
            const isSearchLink = href.startsWith("/reader?search");
            const isActive = isSearchLink
              ? pathname === "/reader" && searchParams.has("search")
              : pathname === href;
            return (
              <SidebarMenuItem key={href}>
                <SidebarMenuButton
                  isActive={isActive}
                  onClick={() => {
                    setOpenMobile(false);
                    // Same-URL clicks don't navigate; for Search, refocus
                    // the page's input so the click still feels responsive.
                    if (isSearchLink && isActive) {
                      window.dispatchEvent(new CustomEvent("feedwise:focus-search"));
                    } else {
                      router.push(href);
                    }
                  }}
                  className="rounded-md h-9 transition-all duration-150"
                >
                  <Icon className="size-4" />
                  <span className="flex-1">{label}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
