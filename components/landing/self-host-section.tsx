import Link from "next/link";
import { ArrowRight, Database, Layers, ShieldCheck, Terminal } from "lucide-react";
import { CopyCommandButton } from "./copy-command-button";

const QUICKSTART_COMMAND =
  "git clone https://github.com/asharca/feedwise && cd feedwise && cp .env.example .env && docker compose up -d";

const REQUIREMENTS = [
  {
    icon: Database,
    name: "PostgreSQL",
    detail: "存储订阅、文章、规则、用户数据与原生中文全文检索索引（Docker Compose 已内置）。",
  },
  {
    icon: Layers,
    name: "Redis",
    detail: "驱动 BullMQ 异步抓取调度、规则通知队列与 SSE 实时更新（Docker Compose 已内置）。",
  },
] as const;

export function SelfHostSection() {
  return (
    <section
      id="self-host"
      aria-labelledby="self-host-heading"
      className="scroll-mt-16 bg-sidebar/50 py-16 sm:py-22"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-start">
          <div className="lg:col-span-5">
            <p className="font-mono text-xs font-medium uppercase tracking-wider text-primary">
              自托管部署
            </p>
            <h2
              id="self-host-heading"
              className="mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl"
            >
              用 Docker Compose 在自己的服务器上线
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
              一个仓库包含 Web 应用、后台 Worker、数据库迁移与依赖服务配置，几分钟即可完成部署。
            </p>

            <div className="mt-6 rounded-xl border border-primary/25 bg-primary/5 p-4">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
                  <ShieldCheck className="size-4" aria-hidden="true" />
                </span>
                <div>
                  <h3 className="text-sm font-semibold text-foreground">数据只在你的服务器上</h3>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    订阅列表、阅读记录、过滤规则、推送密钥与 AI API Key
                    全部留在你的私有实例中，敏感配置加密落库，无第三方云端追踪。
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Link
                href="/register"
                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                <span>开始使用</span>
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
              <a
                href="https://github.com/asharca/feedwise"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-10 items-center justify-center rounded-lg border border-border bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                查看 GitHub 仓库
              </a>
            </div>
          </div>

          <div className="space-y-4 lg:col-span-7">
            {/* Terminal quickstart */}
            <div className="overflow-hidden rounded-xl border border-border bg-card">
              <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/50 px-4 py-2.5">
                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <Terminal className="size-3.5 text-primary" aria-hidden="true" />
                  <span className="font-mono">Docker Compose 快速启动</span>
                </div>
                <CopyCommandButton text={QUICKSTART_COMMAND} />
              </div>

              <pre className="overflow-x-auto p-4 font-mono text-xs leading-6 text-foreground sm:p-5 sm:text-[13px]">
                <code>
                  <span className="select-none text-muted-foreground">$ </span>
                  {"git clone https://github.com/asharca/feedwise \\\n"}
                  {"  && cd feedwise \\\n"}
                  {"  && cp .env.example .env \\\n"}
                  {"  && docker compose up -d"}
                </code>
              </pre>
            </div>

            {/* Requirements */}
            <div className="rounded-xl border border-border bg-card p-5">
              <h3 className="text-sm font-semibold text-foreground">运行依赖</h3>
              <dl className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
                {REQUIREMENTS.map((req) => {
                  const Icon = req.icon;
                  return (
                    <div key={req.name} className="flex items-start gap-3">
                      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground">
                        <Icon className="size-4" aria-hidden="true" />
                      </span>
                      <div>
                        <dt className="font-mono text-sm font-semibold text-foreground">
                          {req.name}
                        </dt>
                        <dd className="mt-1 text-xs leading-relaxed text-muted-foreground">
                          {req.detail}
                        </dd>
                      </div>
                    </div>
                  );
                })}
              </dl>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
