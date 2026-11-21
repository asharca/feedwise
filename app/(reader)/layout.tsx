import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getSubscriptions, getFolders } from "@/lib/db/queries/feeds";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { RealtimeBridge } from "@/components/realtime/realtime-bridge";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { GlobalSettingsDialog } from "@/components/settings/global-settings-dialog";

function toIsoString(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  return Number.isNaN(value.getTime()) ? null : value.toISOString();
}

export default async function ReaderLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");

  const [subscriptions, folders] = await Promise.all([
    getSubscriptions(session.user.id),
    getFolders(session.user.id),
  ]);

  return (
    <SidebarProvider>
      <div className="reader-app-shell flex min-h-0 w-full overflow-hidden">
        <RealtimeBridge />
        <AppSidebar
          subscriptions={subscriptions.map((s) => ({
            ...s,
            lastFetchedAt: toIsoString(s.lastFetchedAt),
            nextFetchAt: toIsoString(s.nextFetchAt),
          }))}
          folders={folders.map((f) => ({ id: f.id, name: f.name, position: f.position }))}
        />
        <SidebarInset className="flex-1 overflow-hidden bg-background">{children}</SidebarInset>
        <GlobalSettingsDialog />
      </div>
    </SidebarProvider>
  );
}
