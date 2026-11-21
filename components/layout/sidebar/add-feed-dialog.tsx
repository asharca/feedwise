"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Compass, ExternalLink, Eye, FileUp, Globe, Loader2, Rss } from "lucide-react";
import { toast } from "sonner";
import type { HtmlSourceConfig } from "@/lib/db/schema-types";
import { apiFetch } from "@/lib/query/api";
import { queryKeys } from "@/lib/query/keys";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { parseFeedUrlLines } from "./parse-feed-urls";

export interface AddFeedDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface SubscribeResultData {
  added?: number;
  failed?: number;
  results?: Array<{ url: string; feedId?: string; error?: string }>;
}

interface OpmlImportData {
  imported: number;
  failed: number;
  total: number;
}

export interface HtmlPreviewItem {
  title: string;
  url: string | null;
  summary: string | null;
  publishedAt: string | null;
  imageUrl: string | null;
}

export interface HtmlPreviewData {
  title: string | null;
  items: HtmlPreviewItem[];
}

export interface HtmlSelectorFields {
  item: string;
  title: string;
  link: string;
  content: string;
  date: string;
  image: string;
}

const EMPTY_SELECTORS: HtmlSelectorFields = {
  item: "",
  title: "",
  link: "",
  content: "",
  date: "",
  image: "",
};

/** Trims selector inputs and drops empty optional fields so zod validation passes. */
export function buildHtmlSourceConfig(fields: HtmlSelectorFields): HtmlSourceConfig {
  const config: HtmlSourceConfig = {
    item: fields.item.trim(),
    title: fields.title.trim(),
  };
  if (fields.link.trim()) config.link = fields.link.trim();
  if (fields.content.trim()) config.content = fields.content.trim();
  if (fields.date.trim()) config.date = fields.date.trim();
  if (fields.image.trim()) config.image = fields.image.trim();
  return config;
}

export function AddFeedDialog({ open, onOpenChange }: AddFeedDialogProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<string>("rss");

  // RSS / OPML state
  const [feedUrl, setFeedUrl] = useState("");
  const [rssError, setRssError] = useState("");
  const opmlInputRef = useRef<HTMLInputElement>(null);

  // HTML scraping state
  const [htmlUrl, setHtmlUrl] = useState("");
  const [selectors, setSelectors] = useState<HtmlSelectorFields>(EMPTY_SELECTORS);

  function invalidateReaderQueries() {
    void queryClient.invalidateQueries({ queryKey: queryKeys.feeds.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.folders.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.articles.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all });
  }

  const addRssMutation = useMutation({
    mutationFn: (urls: string[]) =>
      apiFetch<SubscribeResultData>("/api/feeds", {
        method: "POST",
        json: urls.length === 1 ? { url: urls[0] } : { urls },
      }),
    onSuccess: (data) => {
      const failed = data?.failed ?? 0;
      invalidateReaderQueries();
      if (failed > 0) {
        const failedLines = (data?.results ?? [])
          .filter((r) => r.error)
          .map((r) => `${r.url} — ${r.error ?? "添加失败"}`)
          .join("\n");
        setRssError(`${failed} 个订阅源添加失败：\n${failedLines}`);
        return;
      }
      setFeedUrl("");
      setRssError("");
      toast.success("已添加订阅");
      onOpenChange(false);
    },
    onError: (err) => {
      setRssError(err instanceof Error ? err.message : "添加订阅失败");
    },
  });

  const importOpmlMutation = useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      return apiFetch<OpmlImportData>("/api/opml/import", {
        method: "POST",
        body: formData,
      });
    },
    onSuccess: (data) => {
      invalidateReaderQueries();
      if (data.failed > 0) {
        toast.success(`已导入 ${data.imported} 个订阅，${data.failed} 个失败`);
      } else {
        toast.success(`成功导入 ${data.imported} 个订阅`);
      }
      onOpenChange(false);
    },
    onError: (err) => {
      setRssError(err instanceof Error ? err.message : "OPML 导入失败");
    },
  });

  const previewHtmlMutation = useMutation({
    mutationFn: ({ url, config }: { url: string; config: HtmlSourceConfig }) =>
      apiFetch<HtmlPreviewData>("/api/feeds/preview-html", {
        method: "POST",
        json: { url, config },
      }),
  });

  const subscribeHtmlMutation = useMutation({
    mutationFn: ({ url, config }: { url: string; config: HtmlSourceConfig }) =>
      apiFetch<SubscribeResultData>("/api/feeds", {
        method: "POST",
        json: { url, source: { type: "html", config } },
      }),
    onSuccess: () => {
      invalidateReaderQueries();
      setHtmlUrl("");
      setSelectors(EMPTY_SELECTORS);
      previewHtmlMutation.reset();
      toast.success("已添加网页抓取订阅");
      onOpenChange(false);
    },
  });

  function handleAddRss(e: React.FormEvent) {
    e.preventDefault();
    setRssError("");
    const urls = parseFeedUrlLines(feedUrl);
    if (urls.length === 0) return;
    addRssMutation.mutate(urls);
  }

  function handleOpmlChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setRssError("");
    importOpmlMutation.mutate(file);
  }

  function updateSelector<K extends keyof HtmlSelectorFields>(key: K, value: string) {
    setSelectors((prev) => ({ ...prev, [key]: value }));
  }

  const canRunHtml =
    htmlUrl.trim().length > 0 &&
    selectors.item.trim().length > 0 &&
    selectors.title.trim().length > 0;

  function handlePreviewHtml() {
    if (!canRunHtml) return;
    subscribeHtmlMutation.reset();
    previewHtmlMutation.mutate({
      url: htmlUrl.trim(),
      config: buildHtmlSourceConfig(selectors),
    });
  }

  function handleSubscribeHtml(e: React.FormEvent) {
    e.preventDefault();
    if (!canRunHtml) return;
    subscribeHtmlMutation.mutate({
      url: htmlUrl.trim(),
      config: buildHtmlSourceConfig(selectors),
    });
  }

  const htmlError =
    subscribeHtmlMutation.error instanceof Error
      ? subscribeHtmlMutation.error.message
      : previewHtmlMutation.error instanceof Error
        ? previewHtmlMutation.error.message
        : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl rounded-lg">
        <DialogHeader>
          <DialogTitle>添加订阅</DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab} className="w-full pt-1">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="rss">
              <Rss className="size-3.5" />
              订阅地址
            </TabsTrigger>
            <TabsTrigger value="html">
              <Globe className="size-3.5" />
              网页抓取
            </TabsTrigger>
            <TabsTrigger value="rsshub">
              <Compass className="size-3.5" />
              RSSHub
            </TabsTrigger>
          </TabsList>

          <TabsContent value="rss" className="space-y-4 pt-3">
            <form onSubmit={handleAddRss} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="add-feed-urls">RSS / Atom / JSON Feed 地址</Label>
                <Textarea
                  id="add-feed-urls"
                  placeholder={"https://example.com/feed.xml\nhttps://another.com/rss"}
                  value={feedUrl}
                  onChange={(e) => setFeedUrl(e.target.value)}
                  rows={4}
                  autoFocus
                  className="resize-none rounded-md text-sm"
                />
                <p className="text-xs text-muted-foreground">每行一个地址，支持批量订阅</p>
              </div>
              {rssError && (
                <p role="alert" className="whitespace-pre-line text-sm text-destructive">
                  {rssError}
                </p>
              )}
              <Button
                type="submit"
                className="w-full rounded-md"
                disabled={addRssMutation.isPending || feedUrl.trim().length === 0}
              >
                {addRssMutation.isPending ? "添加中…" : "订阅"}
              </Button>
            </form>

            <div className="flex items-center justify-between gap-3 border-t border-border/60 pt-3">
              <div className="space-y-0.5">
                <p className="text-xs font-medium text-foreground">从 OPML 导入</p>
                <p className="text-xs text-muted-foreground">
                  支持导入其他阅读器导出的 .opml / .xml 订阅文件
                </p>
              </div>
              <input
                ref={opmlInputRef}
                type="file"
                accept=".opml,.xml,text/xml,application/xml"
                onChange={handleOpmlChange}
                className="hidden"
                aria-label="选择 OPML 文件"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0 rounded-md"
                disabled={importOpmlMutation.isPending}
                onClick={() => opmlInputRef.current?.click()}
              >
                {importOpmlMutation.isPending ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <FileUp className="size-3.5" />
                )}
                {importOpmlMutation.isPending ? "导入中…" : "导入 OPML"}
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="html" className="space-y-3 pt-3">
            <p className="rounded-md border border-border/60 bg-muted/40 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
              使用 CSS
              选择器将普通网页转为订阅源。先用「条目」选中每篇文章的容器，其余选择器在条目内部相对匹配。示例：条目{" "}
              <code className="rounded bg-muted px-1 text-foreground">article.post</code>、标题{" "}
              <code className="rounded bg-muted px-1 text-foreground">h2 a</code>
              、链接留空默认取标题链接、摘要{" "}
              <code className="rounded bg-muted px-1 text-foreground">p.summary</code>、日期{" "}
              <code className="rounded bg-muted px-1 text-foreground">time</code>、图片{" "}
              <code className="rounded bg-muted px-1 text-foreground">img</code>。
            </p>

            <form onSubmit={handleSubscribeHtml} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="html-page-url">网页地址 *</Label>
                <Input
                  id="html-page-url"
                  type="url"
                  required
                  value={htmlUrl}
                  onChange={(e) => setHtmlUrl(e.target.value)}
                  placeholder="https://example.com/news"
                  className="rounded-md"
                />
              </div>

              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="html-sel-item">条目选择器 (item) *</Label>
                  <Input
                    id="html-sel-item"
                    required
                    value={selectors.item}
                    onChange={(e) => updateSelector("item", e.target.value)}
                    placeholder="article.post"
                    className="rounded-md font-mono text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="html-sel-title">标题选择器 (title) *</Label>
                  <Input
                    id="html-sel-title"
                    required
                    value={selectors.title}
                    onChange={(e) => updateSelector("title", e.target.value)}
                    placeholder="h2 a"
                    className="rounded-md font-mono text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="html-sel-link">链接选择器 (link)</Label>
                  <Input
                    id="html-sel-link"
                    value={selectors.link}
                    onChange={(e) => updateSelector("link", e.target.value)}
                    placeholder="默认同标题元素"
                    className="rounded-md font-mono text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="html-sel-content">摘要选择器 (content)</Label>
                  <Input
                    id="html-sel-content"
                    value={selectors.content}
                    onChange={(e) => updateSelector("content", e.target.value)}
                    placeholder="p.summary"
                    className="rounded-md font-mono text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="html-sel-date">日期选择器 (date)</Label>
                  <Input
                    id="html-sel-date"
                    value={selectors.date}
                    onChange={(e) => updateSelector("date", e.target.value)}
                    placeholder="time"
                    className="rounded-md font-mono text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="html-sel-image">图片选择器 (image)</Label>
                  <Input
                    id="html-sel-image"
                    value={selectors.image}
                    onChange={(e) => updateSelector("image", e.target.value)}
                    placeholder="img"
                    className="rounded-md font-mono text-xs"
                  />
                </div>
              </div>

              {htmlError && (
                <p role="alert" className="text-sm text-destructive">
                  {htmlError}
                </p>
              )}

              {previewHtmlMutation.data && (
                <div className="space-y-2 rounded-md border border-border/70 bg-muted/20 p-2.5">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="truncate font-medium text-foreground">
                      {previewHtmlMutation.data.title || "预览结果"}
                    </span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      匹配 {previewHtmlMutation.data.items.length} 条（最多显示 20 条）
                    </span>
                  </div>
                  <ul className="max-h-44 space-y-1.5 overflow-y-auto pr-1 scrollbar-thin">
                    {previewHtmlMutation.data.items.slice(0, 20).map((item, idx) => (
                      <li
                        key={`${item.url ?? item.title}-${idx}`}
                        className="rounded border border-border/50 bg-background px-2.5 py-1.5"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="line-clamp-1 text-xs font-medium text-foreground">
                            {item.title}
                          </span>
                          {item.url && (
                            <a
                              href={item.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              aria-label={`打开 ${item.title}`}
                              className="shrink-0 text-muted-foreground hover:text-primary"
                            >
                              <ExternalLink className="size-3" />
                            </a>
                          )}
                        </div>
                        {item.summary && (
                          <p className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">
                            {item.summary}
                          </p>
                        )}
                        {(item.publishedAt || item.imageUrl) && (
                          <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                            {item.publishedAt && (
                              <span>{new Date(item.publishedAt).toLocaleDateString("zh-CN")}</span>
                            )}
                            {item.imageUrl && <span>含图片</span>}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-md"
                  disabled={!canRunHtml || previewHtmlMutation.isPending}
                  onClick={handlePreviewHtml}
                >
                  {previewHtmlMutation.isPending ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Eye className="size-3.5" />
                  )}
                  {previewHtmlMutation.isPending ? "解析中…" : "预览"}
                </Button>
                <Button
                  type="submit"
                  className="flex-1 rounded-md"
                  disabled={!canRunHtml || subscribeHtmlMutation.isPending}
                >
                  {subscribeHtmlMutation.isPending ? "订阅中…" : "订阅"}
                </Button>
              </div>
            </form>
          </TabsContent>

          <TabsContent value="rsshub" className="space-y-4 pt-3">
            <div className="space-y-2 rounded-md border border-border/60 bg-muted/30 p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Compass className="size-4 text-primary" />
                浏览 RSSHub 社区源
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">
                通过发现页搜索数千个 RSSHub 路由，填好参数即可一键订阅微博、B
                站、GitHub、知乎等不原生提供 RSS 的站点。
              </p>
              <Button
                type="button"
                className="mt-2 w-full rounded-md"
                onClick={() => {
                  onOpenChange(false);
                  router.push("/discover");
                }}
              >
                <Compass className="size-4" />
                前往发现页
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              已有 RSSHub 完整链接？可直接切回「订阅地址」标签粘贴订阅。
            </p>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
