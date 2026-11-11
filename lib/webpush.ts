import * as webpush from "web-push";

let ready = false;
/** Returns false when the VAPID keys are not set, so callers can answer "not configured" instead of crashing. */
export function pushReady() {
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY, priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  if (!ready) {
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || "https://spal-biz.vercel.app", pub, priv);
    ready = true;
  }
  return true;
}

export type Sub = { endpoint: string; p256dh: string; auth: string };

/** "gone" means the phone has unsubscribed or the app was removed, so the row should be deleted. */
export async function sendPush(sub: Sub, payload: { title: string; body: string; tag?: string; url?: string }): Promise<"ok" | "gone" | "failed"> {
  try {
    await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify(payload), { TTL: 60 * 60 * 6, urgency: "normal" });
    return "ok";
  } catch (e) {
    const code = (e as { statusCode?: number }).statusCode;
    return code === 404 || code === 410 ? "gone" : "failed";
  }
}
