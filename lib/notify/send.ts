import { channels } from "./channels";
import { openConfig, type ChannelRow } from "./config";
import type { NotifyMessage } from "./message";

export function sendToChannel(channel: ChannelRow, message: NotifyMessage) {
  return channels[channel.type].send(openConfig(channel), message, { userId: channel.userId });
}
