import type { NotificationChannelType } from "@/lib/db/schema-types";
import { bark } from "./bark";
import { dingtalk } from "./dingtalk";
import { feishu } from "./feishu";
import { ntfy } from "./ntfy";
import { telegram } from "./telegram";
import { webpush } from "./webpush";
import { webhook } from "./webhook";
import { wecom } from "./wecom";

export const channels = {
  webhook,
  telegram,
  bark,
  ntfy,
  feishu,
  dingtalk,
  wecom,
  webpush,
} satisfies Record<NotificationChannelType, unknown>;
