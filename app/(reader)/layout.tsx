import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getSubscriptions } from "@/lib/db/queries/feeds";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";

export default async function ReaderLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const subscriptions = await getSubscriptions(session.user.id);

  return (
    <SidebarProvider>
      <div className="flex h-screen w-full overflow-hidden">
        <Suspense>
          <AppSidebar subscriptions={subscriptions} />
        </Suspense>
        <SidebarInset className="flex-1 overflow-hidden bg-background">
          {children}
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
