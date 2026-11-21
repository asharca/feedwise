import Link from "next/link";
import { ArrowRight, Terminal } from "lucide-react";
import { ReaderPreview } from "./reader-preview";

export function HeroSection() {
  return (
    <section
      aria-labelledby="hero-heading"
      className="relative overflow-x-clip border-b border-border/70 bg-background"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-[radial-gradient(ellipse_60%_50%_at_50%_0%,color-mix(in_oklch,var(--primary)_10%,transparent),transparent)]"
      />

      <div className="relative mx-auto max-w-6xl px-4 pb-16 pt-12 sm:px-6 sm:pb-24 sm:pt-18">
        <div className="mx-auto max-w-3xl text-center">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
            <span className="size-1.5 rounded-full bg-primary" aria-hidden="true" />
            <span>开源 · 自托管 · MIT License</span>
          </div>

          <h1
            id="hero-heading"
            className="text-balance text-3xl font-semibold tracking-tight text-foreground sm:text-5xl sm:leading-[1.14]"
          >
            Feedwise — 自托管的全网信息收集平台
          </h1>

          <p className="mx-auto mt-4 max-w-2xl text-pretty text-base leading-relaxed text-muted-foreground sm:mt-5 sm:text-lg">
            把 RSS、热榜、任意网页汇成一条信息流，去重、筛选、推送都在你自己的服务器上。
          </p>

          <div className="mt-7 flex flex-wrap items-center justify-center gap-3 sm:mt-8">
            <Link
              href="/register"
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <span>开始使用</span>
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
            <a
              href="#self-host"
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-border bg-card px-5 text-sm font-medium text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <Terminal className="size-4 text-muted-foreground" aria-hidden="true" />
              <span>自托管部署</span>
            </a>
          </div>
        </div>

        <div className="mt-10 sm:mt-14">
          <ReaderPreview />
        </div>
      </div>
    </section>
  );
}
