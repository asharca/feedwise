import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { LandingHeader } from "@/components/landing/landing-header";
import { HeroSection } from "@/components/landing/hero-section";
import { SourcesSection } from "@/components/landing/sources-section";
import { WorkflowSection } from "@/components/landing/workflow-section";
import { FeaturesSection } from "@/components/landing/features-section";
import { SelfHostSection } from "@/components/landing/self-host-section";
import { LandingFooter } from "@/components/landing/landing-footer";

const PAGE_TITLE = "Feedwise — 自托管的全网信息收集平台";
const PAGE_DESCRIPTION =
  "把 RSS、热榜、任意网页汇成一条信息流，去重、筛选、推送都在你自己的服务器上。";

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  openGraph: {
    title: PAGE_TITLE,
    description: PAGE_DESCRIPTION,
    type: "website",
    locale: "zh_CN",
    siteName: "Feedwise",
  },
};

export default async function RootPage() {
  const session = await getSession();
  if (session) redirect("/reader");

  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <LandingHeader />
      <main id="main-content" className="flex-1">
        <HeroSection />
        <SourcesSection />
        <WorkflowSection />
        <FeaturesSection />
        <SelfHostSection />
      </main>
      <LandingFooter />
    </div>
  );
}
