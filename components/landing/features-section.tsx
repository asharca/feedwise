import {
  Bell,
  Bot,
  Columns3,
  Filter,
  Flame,
  Radio,
  Search,
  Share2,
  Smartphone,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";

const FEATURES = [
  {
    icon: Columns3,
    title: "三栏阅读器与快捷键",
    description:
      "订阅树、文章列表与正文三栏协同，支持 J/K 切换、S 收藏、M 标记已读、视图切换与一键正文全文抓取。",
    span: "lg:col-span-3",
  },
  {
    icon: Filter,
    title: "规则引擎",
    description:
      "针对文章与热榜编排多条件规则，支持标记、隐藏、打标签、全文抓取与通知动作，保存前可预览近 7 天命中结果。",
    span: "lg:col-span-3",
  },
  {
    icon: Bell,
    title: "多渠道推送",
    description:
      "内置 Telegram、Bark、ntfy、飞书、钉钉、企业微信、Webhook（支持 HMAC 签名）与浏览器推送（Web Push），支持单通道实时测试。",
    span: "lg:col-span-3",
  },
  {
    icon: Sparkles,
    title: "AI 摘要与每日邮件简报",
    description:
      "自带 OpenAI 兼容 API Key（完全可选），按需生成文章摘要与标签建议，并可按 Cron 计划发送去重聚类后的每日邮件简报。",
    span: "lg:col-span-3",
  },
  {
    icon: Flame,
    title: "热榜与跨平台事件",
    description: "汇总 22+ 平台实时热榜，自动归并跨平台同题事件，把握话题发酵而不必逐个打开站点。",
    span: "lg:col-span-2",
  },
  {
    icon: Search,
    title: "中文全文搜索",
    description:
      "基于 PostgreSQL CJK 双字切分索引与排除词语法，无需额外搜索引擎即可精准检索中文内容。",
    span: "lg:col-span-2",
  },
  {
    icon: Radio,
    title: "第三方客户端",
    description:
      "原生兼容 Google Reader API 与 Fever API，可直接使用 Reeder、NetNewsWire、ReadYou 等客户端同步阅读。",
    span: "lg:col-span-2",
  },
  {
    icon: Share2,
    title: "RSS 再输出",
    description:
      "将文件夹、标签或收藏筛选结果重新发布为公开 RSS 2.0 订阅源，支持随时轮换访问令牌。",
    span: "lg:col-span-2",
  },
  {
    icon: Bot,
    title: "MCP 接入",
    description:
      "提供 OAuth 2.1 Streamable HTTP 与 stdio MCP 接口，让 Claude、Cursor 等 AI 助手直接检索你的订阅库。",
    span: "lg:col-span-2",
  },
  {
    icon: Smartphone,
    title: "PWA 支持",
    description:
      "支持安装到桌面与手机主屏幕，配合 Service Worker 与浏览器推送获得轻量的移动端阅读体验。",
    span: "lg:col-span-2",
  },
] as const;

export function FeaturesSection() {
  return (
    <section
      id="features"
      aria-labelledby="features-heading"
      className="scroll-mt-16 border-b border-border/70 bg-background py-16 sm:py-22"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="max-w-2xl">
          <p className="font-mono text-xs font-medium uppercase tracking-wider text-primary">
            核心功能
          </p>
          <h2
            id="features-heading"
            className="mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl"
          >
            阅读、筛选、推送与开放生态，一套搞定
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
            既可以在 Web 端安静阅读，也可以通过第三方客户端、定制 RSS 或 MCP
            把整理好的信息流接到任何工具。
          </p>
        </div>

        <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-6">
          {FEATURES.map((feature) => {
            const Icon = feature.icon;
            return (
              <article
                key={feature.title}
                className={cn(
                  "rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/35",
                  feature.span,
                )}
              >
                <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                <h3 className="mt-4 text-base font-semibold tracking-tight text-foreground">
                  {feature.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {feature.description}
                </p>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
