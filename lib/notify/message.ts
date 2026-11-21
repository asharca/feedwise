export interface NotifyMessage {
  title: string;
  body: string;
  url?: string;
  source?: string;
}

export interface NotifyJob {
  userId: string;
  channelId: string;
  message: NotifyMessage;
}

export function formatText({ title, body, url }: NotifyMessage) {
  return [title, body === title ? null : body, url].filter(Boolean).join("\n");
}
