import "server-only";
import { getDb, schema } from "@/server/db";
import { getSettings } from "@/server/settings";

const PUSHOVER_API = "https://api.pushover.net/1/messages.json";

export interface PushoverResult {
  ok: boolean;
  error?: string;
}

export async function sendPushover(opts: {
  title: string;
  message: string;
  priority?: number;
  monitorId?: number;
  url?: string;
  urlTitle?: string;
}): Promise<PushoverResult> {
  const { pushoverToken, pushoverUser, pushoverDevice } = await getSettings();
  let result: PushoverResult;
  if (!pushoverToken || !pushoverUser) {
    result = { ok: false, error: "Pushover token/user key not configured" };
  } else {
    try {
      const body = new URLSearchParams({
        token: pushoverToken,
        user: pushoverUser,
        title: opts.title,
        message: opts.message,
        priority: String(opts.priority ?? 0),
      });
      if (pushoverDevice) body.set("device", pushoverDevice);
      if (opts.url) {
        body.set("url", opts.url);
        if (opts.urlTitle) body.set("url_title", opts.urlTitle);
      }
      // Emergency priority requires retry/expire parameters.
      if ((opts.priority ?? 0) === 2) {
        body.set("retry", "60");
        body.set("expire", "1800");
      }
      const res = await fetch(PUSHOVER_API, { method: "POST", body });
      const data = (await res.json()) as { status?: number; errors?: string[] };
      result =
        data.status === 1
          ? { ok: true }
          : { ok: false, error: data.errors?.join("; ") ?? `HTTP ${res.status}` };
    } catch (err) {
      result = { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  const db = await getDb();
  await db.insert(schema.notifications).values({
    monitorId: opts.monitorId ?? null,
    sentAt: Date.now(),
    title: opts.title,
    message: opts.message,
    status: result.ok ? "sent" : "error",
    error: result.error ?? null,
  });
  return result;
}
