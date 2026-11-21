import { Code2, Flame, Globe, Rss, Upload } from "lucide-react";
import { cn } from "@/lib/utils";

const SOURCES = [
  {
    icon: Rss,
    title: "RSS / Atom / JSON Feed",
    tag: "条件 GET · 自适应调度",
    description:
      "原生解析主流订阅格式，自动携带 ETag / Last-Modified 条件请求，并随站点更新节奏调整抓取间隔。",
    span: "lg:col-span-3",
  },
  {
    icon: Globe,
    title: "RSSHub 路由",
    tag: "支持自建实例",
    description:
      "内置订阅发现与 RSSHub 路由解析，可随时指向你自己的 RSSHub 服务，将无原生 Feed 的站点纳入订阅流。",
    span: "lg:col-span-3",
  },
  {
    icon: Flame,
    title: "22+ 平台热榜",
    tag: "跨平台事件聚类",
    description:
      "持续同步微博、知乎、B站、GitHub、V2EX、Hacker News 等 22+ 平台榜单，追踪热点走势。",
    span: "lg:col-span-2",
  },
  {
    icon: Code2,
    title: "任意网页（CSS 选择器）",
    tag: "实时提取预览",
    description:
      "没有 RSS 也能追更：通过 CSS 选择器定义条目、标题与链接，支持保存前实时预览提取结果。",
    span: "lg:col-span-2",
  },
  {
    icon: Upload,
    title: "OPML 导入",
    tag: "保留目录结构",
    description: "导入现有阅读器的 OPML 文件，一次性迁移全部订阅源与文件夹分组，开箱即可继续阅读。",
    span: "lg:col-span-2",
  },
] as const;

export function SourcesSection() {
  return (
    <section
      id="sources"
      aria-labelledby="sources-heading"
      className="scroll-mt-16 border-b border-border/70 bg-background py-16 sm:py-22"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="max-w-2xl">
          <p className="font-mono text-xs font-medium uppercase tracking-wider text-primary">
            数据源
          </p>
          <h2
            id="sources-heading"
            className="mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl"
          >
            从标准订阅到任意网页，统一收口
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
            不局限于传统 RSS：博客、社区、热榜与没有提供订阅源的官方公告页，都能汇入同一条时间线。
          </p>
        </div>

        <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-6">
          {SOURCES.map((source) => {
            const Icon = source.icon;
            return (
              <div
                key={source.title}
                className={cn(
                  "flex flex-col justify-between rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/35",
                  source.span,
                )}
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Icon className="size-4" aria-hidden="true" />
                    </span>
                    <span className="rounded-md bg-muted px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
                      {source.tag}
                    </span>
                  </div>
                  <h3 className="mt-4 text-base font-semibold tracking-tight text-foreground">
                    {source.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {source.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
