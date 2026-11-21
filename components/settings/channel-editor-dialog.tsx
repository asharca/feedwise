"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  CHANNEL_TYPES,
  CHANNEL_TYPE_MAP,
  buildChannelConfigPayload,
  getInitialChannelValues,
  validateChannelDraft,
} from "@/components/settings/channel-schema";
import type { NotificationChannelDto } from "@/components/settings/types";
import type { NotificationChannelType } from "@/lib/db/schema-types";
import { apiFetch } from "@/lib/query/api";
import { queryKeys } from "@/lib/query/keys";

interface ChannelEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  channel: NotificationChannelDto | null;
}

function ChannelEditorForm({
  channel,
  onClose,
}: {
  channel: NotificationChannelDto | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const isEdit = Boolean(channel);
  const [type, setType] = useState<NotificationChannelType>(channel?.type ?? "webhook");
  const [name, setName] = useState(channel?.name ?? "");
  const [values, setValues] = useState<Record<string, string>>(() =>
    getInitialChannelValues(channel?.type ?? "webhook", channel?.config),
  );
  const [formError, setFormError] = useState<string | null>(null);

  const saveMutation = useMutation({
    mutationFn: (payload: {
      type: NotificationChannelType;
      name: string;
      config: Record<string, string>;
    }) =>
      channel
        ? apiFetch<NotificationChannelDto>(`/api/notification-channels/${channel.id}`, {
            method: "PATCH",
            json: { name: payload.name, config: payload.config },
          })
        : apiFetch<NotificationChannelDto>("/api/notification-channels", {
            method: "POST",
            json: payload,
          }),
    onSuccess: () => {
      toast.success(isEdit ? "通知渠道已更新" : "通知渠道已创建");
      void queryClient.invalidateQueries({ queryKey: queryKeys.notificationChannels.all });
      onClose();
    },
    onError: (err) => {
      setFormError(err instanceof Error ? err.message : "保存通知渠道失败");
    },
  });

  const typeDef = CHANNEL_TYPE_MAP[type];
  const configuredSecrets = channel?.configuredSecrets ?? [];

  function handleTypeChange(nextType: NotificationChannelType) {
    setType(nextType);
    setValues(getInitialChannelValues(nextType));
    setFormError(null);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const err = validateChannelDraft({
      type,
      name,
      values,
      configuredSecrets,
      isEdit,
    });
    if (err) {
      setFormError(err);
      return;
    }
    setFormError(null);
    const config = buildChannelConfigPayload(type, values, isEdit);
    saveMutation.mutate({ type, name: name.trim(), config });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {formError && (
        <div
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
        >
          {formError}
        </div>
      )}

      <div className="space-y-1.5">
        <label htmlFor="channel-type" className="text-xs font-medium text-muted-foreground block">
          渠道类型
        </label>
        <select
          id="channel-type"
          value={type}
          disabled={isEdit}
          onChange={(e) => handleTypeChange(e.target.value as NotificationChannelType)}
          className="h-9 w-full cursor-pointer rounded-md border border-input bg-muted px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {CHANNEL_TYPES.map((def) => (
            <option key={def.type} value={def.type}>
              {def.label}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">{typeDef.description}</p>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="channel-name" className="text-xs font-medium text-muted-foreground block">
          渠道名称
        </label>
        <Input
          id="channel-name"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setFormError(null);
          }}
          placeholder={`例如：我的 ${typeDef.label}`}
          maxLength={100}
          className="h-9 bg-muted"
        />
      </div>

      {typeDef.fields.length > 0 && (
        <div className="space-y-3 pt-1">
          {typeDef.fields.map((field) => {
            const isSecretConfigured =
              isEdit && field.secret && configuredSecrets.includes(field.key);
            return (
              <div key={field.key} className="space-y-1">
                <label
                  htmlFor={`channel-field-${field.key}`}
                  className="text-xs font-medium text-muted-foreground block"
                >
                  {field.label}
                  {field.required && !isSecretConfigured && (
                    <span className="text-destructive ml-0.5">*</span>
                  )}
                </label>
                <Input
                  id={`channel-field-${field.key}`}
                  type={field.secret ? "password" : (field.inputType ?? "text")}
                  value={values[field.key] ?? ""}
                  onChange={(e) => {
                    const nextValue = e.target.value;
                    setValues((prev) => ({ ...prev, [field.key]: nextValue }));
                    setFormError(null);
                  }}
                  placeholder={isSecretConfigured ? "已设置，留空保持不变" : field.placeholder}
                  autoComplete={field.secret ? "new-password" : "off"}
                  className="h-9 bg-muted"
                />
                {isSecretConfigured && (
                  <p className="text-[11px] text-muted-foreground">已设置，留空保持不变</p>
                )}
                {field.helpText && (
                  <p className="text-[11px] text-muted-foreground">{field.helpText}</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="rounded-md"
          onClick={onClose}
          disabled={saveMutation.isPending}
        >
          取消
        </Button>
        <Button type="submit" size="sm" className="rounded-md" disabled={saveMutation.isPending}>
          {saveMutation.isPending ? "保存中…" : isEdit ? "保存修改" : "创建渠道"}
        </Button>
      </div>
    </form>
  );
}

export function ChannelEditorDialog({ open, onOpenChange, channel }: ChannelEditorDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-none rounded-lg w-[min(540px,94vw)] max-h-[85dvh] overflow-y-auto scrollbar-thin">
        <DialogHeader>
          <DialogTitle>{channel ? "编辑通知渠道" : "添加通知渠道"}</DialogTitle>
        </DialogHeader>
        {open && (
          <ChannelEditorForm
            key={channel?.id ?? "new-channel"}
            channel={channel}
            onClose={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
