import type { NotificationChannelType } from "@/lib/db/schema-types";

export interface ChannelFieldDef {
  key: string;
  label: string;
  placeholder: string;
  helpText?: string;
  required: boolean;
  secret: boolean;
  defaultValue?: string;
  inputType?: "text" | "url" | "password";
}

export interface ChannelTypeDef {
  type: NotificationChannelType;
  label: string;
  description: string;
  fields: readonly ChannelFieldDef[];
}

export const CHANNEL_TYPES: readonly ChannelTypeDef[] = [
  {
    type: "webhook",
    label: "Webhook",
    description: "向自定义 HTTP 地址发送 JSON 通知，支持可选 HMAC-SHA256 签名。",
    fields: [
      {
        key: "url",
        label: "Webhook URL",
        placeholder: "https://example.com/hook",
        required: true,
        secret: true,
        inputType: "url",
      },
      {
        key: "secret",
        label: "签名密钥（可选）",
        placeholder: "留空则不签名",
        helpText: "填写后将在 X-Feedwise-Signature 请求头附加 HMAC-SHA256 十六进制签名",
        required: false,
        secret: true,
        inputType: "password",
      },
    ],
  },
  {
    type: "telegram",
    label: "Telegram",
    description: "通过 Telegram Bot 向指定会话或频道推送消息。",
    fields: [
      {
        key: "botToken",
        label: "Bot Token",
        placeholder: "123456:ABC-DEF...",
        required: true,
        secret: true,
        inputType: "password",
      },
      {
        key: "chatId",
        label: "Chat ID",
        placeholder: "例如 123456789 或 @channel_name",
        required: true,
        secret: false,
        inputType: "text",
      },
    ],
  },
  {
    type: "bark",
    label: "Bark",
    description: "向 iOS / macOS Bark 客户端推送通知。",
    fields: [
      {
        key: "serverUrl",
        label: "服务器地址",
        placeholder: "https://api.day.app",
        helpText: "自建 Bark 服务可修改此处，默认使用官方地址",
        required: false,
        secret: false,
        defaultValue: "https://api.day.app",
        inputType: "url",
      },
      {
        key: "deviceKey",
        label: "Device Key",
        placeholder: "输入 Bark 设备 Key",
        required: true,
        secret: true,
        inputType: "password",
      },
    ],
  },
  {
    type: "ntfy",
    label: "ntfy",
    description: "通过开源的 ntfy 服务推送通知。",
    fields: [
      {
        key: "serverUrl",
        label: "服务器地址",
        placeholder: "https://ntfy.sh",
        required: false,
        secret: false,
        defaultValue: "https://ntfy.sh",
        inputType: "url",
      },
      {
        key: "topic",
        label: "Topic 主题名",
        placeholder: "my-feedwise-alerts",
        required: true,
        secret: false,
        inputType: "text",
      },
      {
        key: "token",
        label: "访问令牌（可选）",
        placeholder: "tk_...",
        helpText: "仅当订阅受保护的私有主题时需要填写",
        required: false,
        secret: true,
        inputType: "password",
      },
    ],
  },
  {
    type: "feishu",
    label: "飞书机器人",
    description: "通过飞书自定义群机器人 Webhook 发送消息。",
    fields: [
      {
        key: "webhookUrl",
        label: "Webhook 地址",
        placeholder: "https://open.feishu.cn/open-apis/bot/v2/hook/...",
        required: true,
        secret: true,
        inputType: "url",
      },
      {
        key: "secret",
        label: "签名校验密钥（可选）",
        placeholder: "开启签名校验时填写",
        required: false,
        secret: true,
        inputType: "password",
      },
    ],
  },
  {
    type: "dingtalk",
    label: "钉钉机器人",
    description: "通过钉钉自定义群机器人 Webhook 发送消息。",
    fields: [
      {
        key: "webhookUrl",
        label: "Webhook 地址",
        placeholder: "https://oapi.dingtalk.com/robot/send?access_token=...",
        required: true,
        secret: true,
        inputType: "url",
      },
      {
        key: "secret",
        label: "加签密钥（可选）",
        placeholder: "SEC...",
        required: false,
        secret: true,
        inputType: "password",
      },
    ],
  },
  {
    type: "wecom",
    label: "企业微信机器人",
    description: "通过企业微信群机器人 Webhook 发送消息。",
    fields: [
      {
        key: "webhookUrl",
        label: "Webhook 地址",
        placeholder: "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=...",
        required: true,
        secret: true,
        inputType: "url",
      },
    ],
  },
  {
    type: "webpush",
    label: "浏览器推送（Web Push）",
    description: "直接向当前账号所有已开启浏览器推送的设备发送系统通知，无需额外配置字段。",
    fields: [],
  },
];

export const CHANNEL_TYPE_MAP: Record<NotificationChannelType, ChannelTypeDef> = {
  webhook: CHANNEL_TYPES[0],
  telegram: CHANNEL_TYPES[1],
  bark: CHANNEL_TYPES[2],
  ntfy: CHANNEL_TYPES[3],
  feishu: CHANNEL_TYPES[4],
  dingtalk: CHANNEL_TYPES[5],
  wecom: CHANNEL_TYPES[6],
  webpush: CHANNEL_TYPES[7],
};

export function getInitialChannelValues(
  type: NotificationChannelType,
  existingConfig?: Record<string, string>,
): Record<string, string> {
  const def = CHANNEL_TYPE_MAP[type];
  const values: Record<string, string> = {};
  for (const field of def.fields) {
    if (field.secret) {
      values[field.key] = "";
    } else {
      values[field.key] = existingConfig?.[field.key] ?? field.defaultValue ?? "";
    }
  }
  return values;
}

export interface ChannelDraftInput {
  type: NotificationChannelType;
  name: string;
  values: Record<string, string>;
  configuredSecrets: string[];
  isEdit: boolean;
}

export function validateChannelDraft(draft: ChannelDraftInput): string | null {
  const trimmedName = draft.name.trim();
  if (!trimmedName) {
    return "请输入渠道名称";
  }
  if (trimmedName.length > 100) {
    return "渠道名称不能超过 100 个字符";
  }

  const def = CHANNEL_TYPE_MAP[draft.type];
  for (const field of def.fields) {
    const raw = (draft.values[field.key] ?? "").trim();
    const alreadyConfigured =
      draft.isEdit && field.secret && draft.configuredSecrets.includes(field.key);
    if (field.required && !raw && !alreadyConfigured) {
      return `请填写「${field.label}」`;
    }
  }

  return null;
}

export function buildChannelConfigPayload(
  type: NotificationChannelType,
  values: Record<string, string>,
  isEdit: boolean,
): Record<string, string> {
  const def = CHANNEL_TYPE_MAP[type];
  const config: Record<string, string> = {};
  for (const field of def.fields) {
    const trimmed = (values[field.key] ?? "").trim();
    if (field.secret) {
      // On edit, omitting empty secrets tells the backend to keep the stored value.
      if (trimmed) {
        config[field.key] = trimmed;
      } else if (!isEdit && field.required) {
        config[field.key] = "";
      }
    } else {
      config[field.key] = trimmed || field.defaultValue || "";
    }
  }
  return config;
}
