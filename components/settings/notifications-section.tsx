"use client";

import { useState, useSyncExternalStore } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { zhCN } from "date-fns/locale";
import {
  AlertCircle,
  Bell,
  BellOff,
  BellRing,
  Loader2,
  Pencil,
  Plus,
  Send,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { SectionErrorState, SectionLoadingState } from "@/components/settings/section-state";
import { ChannelEditorDialog } from "@/components/settings/channel-editor-dialog";
import { CHANNEL_TYPE_MAP } from "@/components/settings/channel-schema";
import type { NotificationChannelDto } from "@/components/settings/types";
import {
  ensureServiceWorkerReady,
  getCurrentPushSubscription,
  isPushSupported,
  serializePushSubscription,
  urlBase64ToUint8Array,
} from "@/lib/push/client";
import { ApiError, apiFetch } from "@/lib/query/api";
import { queryKeys } from "@/lib/query/keys";

const BROWSER_PUSH_KEY = ["push", "browser-subscription"] as const;
const emptySubscribe = () => () => {};

export function NotificationsSection() {
  const queryClient = useQueryClient();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingChannel, setEditingChannel] = useState<NotificationChannelDto | null>(null);
  const [vapidMissingHelp, setVapidMissingHelp] = useState(false);

  const isClient = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
  const pushSupported = isClient && isPushSupported();

  const channelsQuery = useQuery({
    queryKey: queryKeys.notificationChannels.all,
    queryFn: () => apiFetch<NotificationChannelDto[]>("/api/notification-channels"),
  });

  const browserPushQuery = useQuery({
    queryKey: BROWSER_PUSH_KEY,
    queryFn: getCurrentPushSubscription,
    enabled: pushSupported,
    staleTime: 0,
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      apiFetch<NotificationChannelDto>(`/api/notification-channels/${id}`, {
        method: "PATCH",
        json: { enabled },
      }),
    onSuccess: (updated) => {
      queryClient.setQueryData<NotificationChannelDto[]>(
        queryKeys.notificationChannels.all,
        (prev) => prev?.map((c) => (c.id === updated.id ? updated : c)),
      );
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "切换渠道状态失败");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ id: string }>(`/api/notification-channels/${id}`, { method: "DELETE" }),
    onSuccess: (_res, id) => {
      queryClient.setQueryData<NotificationChannelDto[]>(
        queryKeys.notificationChannels.all,
        (prev) => prev?.filter((c) => c.id !== id),
      );
      toast.success("通知渠道已删除");
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "删除通知渠道失败");
    },
  });

  const testMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ ok: true }>(`/api/notification-channels/${id}/test`, { method: "POST" }),
    onSuccess: () => {
      toast.success("测试通知已发送");
      void queryClient.invalidateQueries({ queryKey: queryKeys.notificationChannels.all });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? `发送测试失败：${err.message}` : "发送测试失败");
      void queryClient.invalidateQueries({ queryKey: queryKeys.notificationChannels.all });
    },
  });

  const enableBrowserPushMutation = useMutation({
    mutationFn: async () => {
      if (!isPushSupported()) {
        throw new Error("当前浏览器不支持 Web Push 推送通知");
      }

      const { publicKey } = await queryClient.fetchQuery({
        queryKey: queryKeys.push.vapidKey(),
        queryFn: () => apiFetch<{ publicKey: string }>("/api/push/vapid-public-key"),
        retry: false,
      });

      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        throw new Error("浏览器未授予通知权限，请在浏览器站点设置中允许通知");
      }

      const registration = await ensureServiceWorkerReady();
      const existing = await registration.pushManager.getSubscription();
      const subscription =
        existing ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        }));

      const serialized = serializePushSubscription(subscription);
      await apiFetch<{ id: string }>("/api/push/subscriptions", {
        method: "POST",
        json: serialized,
      });
      return subscription;
    },
    onSuccess: (subscription) => {
      setVapidMissingHelp(false);
      queryClient.setQueryData(BROWSER_PUSH_KEY, subscription);
      toast.success("已在此设备启用浏览器推送");
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 503) {
        setVapidMissingHelp(true);
        return;
      }
      toast.error(err instanceof Error ? err.message : "启用浏览器推送失败");
    },
  });

  const disableBrowserPushMutation = useMutation({
    mutationFn: async () => {
      const sub = browserPushQuery.data;
      if (!sub) return;
      const endpoint = sub.endpoint;
      await sub.unsubscribe();
      await apiFetch("/api/push/subscriptions", {
        method: "DELETE",
        json: { endpoint },
      });
    },
    onSuccess: () => {
      queryClient.setQueryData(BROWSER_PUSH_KEY, null);
      toast.success("已停用此设备的浏览器推送");
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "取消浏览器推送失败");
    },
  });

  const createWebPushChannelMutation = useMutation({
    mutationFn: () =>
      apiFetch<NotificationChannelDto>("/api/notification-channels", {
        method: "POST",
        json: { type: "webpush", name: "浏览器推送", config: {} },
      }),
    onSuccess: () => {
      toast.success("已创建「浏览器推送」渠道，可在规则中选用");
      void queryClient.invalidateQueries({ queryKey: queryKeys.notificationChannels.all });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "创建浏览器推送渠道失败");
    },
  });

  if (channelsQuery.isPending) {
    return <SectionLoadingState label="通知渠道" />;
  }

  if (channelsQuery.isError) {
    return (
      <SectionErrorState
        label="通知渠道"
        error={channelsQuery.error}
        onRetry={() => void channelsQuery.refetch()}
      />
    );
  }

  const channels = channelsQuery.data ?? [];
  const hasWebPushChannel = channels.some((c) => c.type === "webpush");
  const isBrowserSubscribed = Boolean(browserPushQuery.data);
  const testingId = testMutation.isPending ? testMutation.variables : null;

  function handleDelete(channel: NotificationChannelDto) {
    if (!window.confirm(`确定要删除通知渠道「${channel.name}」吗？`)) return;
    deleteMutation.mutate(channel.id);
  }

  return (
    <div className="space-y-4">
      {/* Web Push device section */}
      <Card className="rounded-lg">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <BellRing className="size-4" />
            浏览器推送（Web Push）
          </CardTitle>
          <CardDescription>
            在当前浏览器订阅系统级推送通知；配合下方的 Web Push 渠道即可在自动化规则中即时提醒。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {!isClient ? (
            <p className="text-xs text-muted-foreground">正在检测浏览器推送支持情况…</p>
          ) : !pushSupported ? (
            <p className="text-xs text-muted-foreground">
              当前浏览器不支持 Service Worker 或 Web Push 通知（iOS 请先将页面添加到主屏幕）。
            </p>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              {isBrowserSubscribed ? (
                <>
                  <Badge variant="secondary">此设备已启用浏览器推送</Badge>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="rounded-md"
                    onClick={() => disableBrowserPushMutation.mutate()}
                    disabled={disableBrowserPushMutation.isPending}
                  >
                    <BellOff className="size-3.5" />
                    {disableBrowserPushMutation.isPending ? "取消中…" : "停用此设备推送"}
                  </Button>
                </>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  className="rounded-md"
                  onClick={() => enableBrowserPushMutation.mutate()}
                  disabled={enableBrowserPushMutation.isPending}
                >
                  {enableBrowserPushMutation.isPending ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <BellRing className="size-3.5" />
                  )}
                  在此设备启用浏览器推送
                </Button>
              )}

              {!hasWebPushChannel && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-md"
                  onClick={() => createWebPushChannelMutation.mutate()}
                  disabled={createWebPushChannelMutation.isPending}
                >
                  <Plus className="size-3.5" />
                  创建浏览器推送渠道
                </Button>
              )}
            </div>
          )}

          {vapidMissingHelp && (
            <div
              role="alert"
              className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs space-y-1.5"
            >
              <p className="font-medium text-foreground flex items-center gap-1.5">
                <AlertCircle className="size-3.5 text-amber-500 shrink-0" />
                服务端尚未配置 Web Push（VAPID 密钥缺失）
              </p>
              <p className="text-muted-foreground">
                请在服务端运行{" "}
                <code className="font-mono rounded bg-muted px-1 py-0.5">
                  npx web-push generate-vapid-keys
                </code>{" "}
                生成密钥对，并在环境变量中配置{" "}
                <code className="font-mono rounded bg-muted px-1 py-0.5">VAPID_PUBLIC_KEY</code>、
                <code className="font-mono rounded bg-muted px-1 py-0.5">VAPID_PRIVATE_KEY</code>
                （可选 <code className="font-mono rounded bg-muted px-1 py-0.5">VAPID_SUBJECT</code>
                ），重启服务后即可启用。
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Channel list */}
      <Card className="rounded-lg">
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="space-y-1">
            <CardTitle className="text-base flex items-center gap-2">
              <Bell className="size-4" />
              通知渠道
            </CardTitle>
            <CardDescription>
              支持 Webhook、Telegram、Bark、ntfy、飞书、钉钉、企业微信与浏览器推送
            </CardDescription>
          </div>
          <Button
            size="sm"
            className="rounded-md shrink-0"
            onClick={() => {
              setEditingChannel(null);
              setEditorOpen(true);
            }}
          >
            <Plus className="size-4" />
            添加渠道
          </Button>
        </CardHeader>
        <CardContent>
          {channels.length === 0 ? (
            <div className="rounded-md border border-dashed border-border p-6 text-center space-y-2">
              <p className="text-sm font-medium">还没有配置通知渠道</p>
              <p className="text-xs text-muted-foreground">
                添加通知渠道后，即可在「规则」中将重要文章或热榜动态实时推送到你的设备。
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-border rounded-md border border-border">
              {channels.map((channel) => {
                const typeDef = CHANNEL_TYPE_MAP[channel.type];
                const isTesting = testingId === channel.id;
                return (
                  <li key={channel.id} className="p-3 space-y-2">
                    <div className="flex items-center gap-3">
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium truncate">{channel.name}</span>
                          <Badge variant="outline">{typeDef?.label ?? channel.type}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {channel.lastSentAt
                            ? `最近发送：${formatDistanceToNow(new Date(channel.lastSentAt), { addSuffix: true, locale: zhCN })}`
                            : "尚未发送过通知"}
                        </p>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <Button
                          type="button"
                          variant="outline"
                          size="xs"
                          className="rounded-md"
                          onClick={() => testMutation.mutate(channel.id)}
                          disabled={isTesting}
                        >
                          {isTesting ? (
                            <Loader2 className="size-3 animate-spin" />
                          ) : (
                            <Send className="size-3" />
                          )}
                          发送测试
                        </Button>
                        <Switch
                          checked={channel.enabled}
                          onCheckedChange={(enabled) =>
                            toggleMutation.mutate({ id: channel.id, enabled })
                          }
                          disabled={toggleMutation.isPending}
                          aria-label={`启用渠道 ${channel.name}`}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => {
                            setEditingChannel(channel);
                            setEditorOpen(true);
                          }}
                          aria-label={`编辑渠道 ${channel.name}`}
                          title="编辑"
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          className="text-muted-foreground hover:text-destructive"
                          onClick={() => handleDelete(channel)}
                          disabled={deleteMutation.isPending}
                          aria-label={`删除渠道 ${channel.name}`}
                          title="删除"
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </div>

                    {channel.lastError && (
                      <div className="rounded-md border border-destructive/30 bg-destructive/5 px-2.5 py-1.5 text-xs text-destructive break-all">
                        最近错误：{channel.lastError}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <ChannelEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        channel={editingChannel}
      />
    </div>
  );
}
