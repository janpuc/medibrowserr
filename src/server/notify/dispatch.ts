import "server-only";
import { getDb, schema } from "@/server/db";
import { nowWarsawIso } from "@/server/medicover/slots";
import { getSettings, type AppSettings } from "@/server/settings";
import { isQuietHour, QUIET_PRIORITY_CAP } from "./quiet";

export interface OutgoingNotification {
  title: string;
  message: string;
  /** Pushover scale (-2 silent … 2 emergency); mapped per channel. */
  priority?: number;
  url?: string;
  urlTitle?: string;
  monitorId?: number;
}

export interface DispatchResult {
  /** Channels that accepted the message. */
  sent: string[];
  /** Channels that were configured but failed. */
  errors: { channel: string; error: string }[];
  /** True when no channel is configured at all. */
  unconfigured: boolean;
}

type ChannelSender = (n: OutgoingNotification, s: AppSettings) => Promise<void>;

const sendViaPushover: ChannelSender = async (n, s) => {
  const body = new URLSearchParams({
    token: s.pushoverToken,
    user: s.pushoverUser,
    title: n.title,
    message: n.message,
    priority: String(n.priority ?? 0),
  });
  if (s.pushoverDevice) body.set("device", s.pushoverDevice);
  if (n.url) {
    body.set("url", n.url);
    if (n.urlTitle) body.set("url_title", n.urlTitle);
  }
  // Emergency priority requires retry/expire parameters.
  if ((n.priority ?? 0) === 2) {
    body.set("retry", "60");
    body.set("expire", "1800");
  }
  const res = await fetch("https://api.pushover.net/1/messages.json", { method: "POST", body });
  const data = (await res.json()) as { status?: number; errors?: string[] };
  if (data.status !== 1) throw new Error(data.errors?.join("; ") ?? `HTTP ${res.status}`);
};

const sendViaTelegram: ChannelSender = async (n, s) => {
  const text = `*${n.title.replace(/([_*[\]()~`>#+\-=|{}.!])/g, "\\$1")}*\n${n.message.replace(/([_*[\]()~`>#+\-=|{}.!])/g, "\\$1")}${n.url ? `\n\n[${(n.urlTitle ?? "Open").replace(/([_*[\]()~`>#+\-=|{}.!])/g, "\\$1")}](${n.url})` : ""}`;
  const res = await fetch(`https://api.telegram.org/bot${s.telegramBotToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: s.telegramChatId,
      text,
      parse_mode: "MarkdownV2",
      disable_notification: (n.priority ?? 0) < 0,
    }),
  });
  const data = (await res.json()) as { ok?: boolean; description?: string };
  if (!data.ok) throw new Error(data.description ?? `HTTP ${res.status}`);
};

const sendViaGotify: ChannelSender = async (n, s) => {
  // Gotify priorities: 0-3 silent-ish, 4-7 notify, 8-10 loud.
  const priorityMap: Record<number, number> = { [-2]: 1, [-1]: 3, 0: 5, 1: 8, 2: 10 };
  const res = await fetch(`${s.gotifyUrl}/message?token=${encodeURIComponent(s.gotifyToken)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: n.title,
      message: n.message + (n.url ? `\n\n${n.url}` : ""),
      priority: priorityMap[n.priority ?? 0] ?? 5,
      extras: n.url
        ? { "client::notification": { click: { url: n.url } } }
        : undefined,
    }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
};

const sendViaNtfy: ChannelSender = async (n, s) => {
  // ntfy priorities: 1 min … 5 max.
  const priorityMap: Record<number, number> = { [-2]: 1, [-1]: 2, 0: 3, 1: 4, 2: 5 };
  const headers: Record<string, string> = {
    Title: n.title,
    Priority: String(priorityMap[n.priority ?? 0] ?? 3),
  };
  if (n.url) headers["Click"] = n.url;
  if (s.ntfyToken) headers["Authorization"] = `Bearer ${s.ntfyToken}`;
  const res = await fetch(`${s.ntfyUrl}/${encodeURIComponent(s.ntfyTopic)}`, {
    method: "POST",
    headers,
    body: n.message,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
};

const CHANNELS: { name: string; configured: (s: AppSettings) => boolean; send: ChannelSender }[] = [
  { name: "pushover", configured: (s) => !!(s.pushoverToken && s.pushoverUser), send: sendViaPushover },
  { name: "telegram", configured: (s) => !!(s.telegramBotToken && s.telegramChatId), send: sendViaTelegram },
  { name: "gotify", configured: (s) => !!(s.gotifyUrl && s.gotifyToken), send: sendViaGotify },
  { name: "ntfy", configured: (s) => !!(s.ntfyUrl && s.ntfyTopic), send: sendViaNtfy },
];

export type ChannelName = "pushover" | "telegram" | "gotify" | "ntfy";

/** Which channels have working credentials right now. */
export async function configuredChannels(): Promise<ChannelName[]> {
  const settings = await getSettings();
  return CHANNELS.filter((c) => c.configured(settings)).map((c) => c.name as ChannelName);
}

/**
 * Sends a notification to every configured channel (or just `only`).
 * During quiet hours the priority is capped so delivery is silent
 * rather than dropped.
 */
export async function dispatchNotification(
  n: OutgoingNotification,
  opts: { only?: ChannelName[] } = {},
): Promise<DispatchResult> {
  const settings = await getSettings();
  const outgoing = { ...n };
  if (
    settings.quietHoursEnabled &&
    isQuietHour(Number(nowWarsawIso().slice(11, 13)), settings.quietHours)
  ) {
    outgoing.priority = Math.min(outgoing.priority ?? 0, QUIET_PRIORITY_CAP);
  }

  const active = CHANNELS.filter(
    (c) =>
      c.configured(settings) &&
      (!opts.only || opts.only.includes(c.name as ChannelName)),
  );
  const result: DispatchResult = { sent: [], errors: [], unconfigured: active.length === 0 };

  const db = await getDb();
  if (result.unconfigured) {
    await db.insert(schema.notifications).values({
      monitorId: n.monitorId ?? null,
      sentAt: Date.now(),
      channel: "none",
      title: n.title,
      message: n.message,
      status: "error",
      error: "No notification channel configured (Settings → Notifications)",
    });
    return result;
  }

  for (const channel of active) {
    let error: string | null = null;
    try {
      await channel.send(outgoing, settings);
      result.sent.push(channel.name);
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      result.errors.push({ channel: channel.name, error });
    }
    await db.insert(schema.notifications).values({
      monitorId: n.monitorId ?? null,
      sentAt: Date.now(),
      channel: channel.name,
      title: n.title,
      message: n.message,
      status: error ? "error" : "sent",
      error,
    });
  }
  return result;
}
