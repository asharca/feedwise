import { ArrowRight, Bell, Filter, GitMerge, Inbox, Sparkles } from "lucide-react";

const PIPELINE_STEPS = [
  {
    step: "01",
    title: "采集",
    icon: Inbox,
    detail: "条件 GET、自适应调度、CSS 选择器与按需正文抓取。",
  },
  {
    step: "02",
    title: "去重",
    icon: GitMerge,
    detail: "URL 规范化结合 SimHash 指纹，收敛跨源重复内容。",
  },
  {
    step: "03",
    title: "AI 摘要 / 打标签",
    icon: Sparkles,
    detail: "可选接入自带 OpenAI 兼容模型，生成摘要与主题标签。",
  },
  {
    step: "04",
    title: "规则",
    icon: Filter,
    detail: "按关键词、正则或来源条件，自动标记、隐藏、打标签或抓全文。",
  },
  {
    step: "05",
    title: "推送 / 输出",
    icon: Bell,
    detail: "实时推送多渠道通知，或输出定制 RSS、第三方客户端与 MCP。",
  },
] as const;

export function WorkflowSection() {
  return (
    <section
      id="workflow"
      aria-labelledby="workflow-heading"
      className="scroll-mt-16 border-b border-border/70 bg-sidebar/50 py-16 sm:py-22"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="max-w-2xl">
          <p className="font-mono text-xs font-medium uppercase tracking-wider text-primary">
            工作流
          </p>
          <h2
            id="workflow-heading"
            className="mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl"
          >
            五步信息处理流水线
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
            每篇入库文章与热榜条目都会经过可预测、可配置的处理链路，把噪声留在阅读之前。
          </p>
        </div>

        <ol className="mt-10 grid grid-cols-1 gap-4 lg:grid-cols-5">
          {PIPELINE_STEPS.map((item, index) => {
            const Icon = item.icon;
            const isLast = index === PIPELINE_STEPS.length - 1;
            return (
              <li key={item.step} className="relative flex flex-col">
                <div className="flex h-full flex-col rounded-xl border border-border bg-card p-5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Icon className="size-4" aria-hidden="true" />
                    </span>
                    <span className="font-mono text-xs font-medium text-muted-foreground">
                      {item.step}
                    </span>
                  </div>
                  <h3 className="mt-4 text-base font-semibold tracking-tight text-foreground">
                    {item.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {item.detail}
                  </p>
                </div>

                {!isLast && (
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute -right-3.5 top-1/2 z-10 hidden size-5 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-background text-muted-foreground lg:flex"
                  >
                    <ArrowRight className="size-3" />
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
