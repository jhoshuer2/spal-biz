import type { SupabaseClient } from "@supabase/supabase-js";

/** Tell the project owner something went wrong. Never throws and never blocks her; silently does nothing if she is not signed in. */
export async function reportError(sb: SupabaseClient, shopId: string | null, message: string, context: Record<string, unknown> = {}, userAgent?: string) {
  try {
    await sb.from("app_report").insert({ shop_id: shopId, kind: "error", message: message.slice(0, 500), context: { commit: process.env.NEXT_PUBLIC_COMMIT, ...context }, user_agent: userAgent?.slice(0, 200) });
  } catch { /* reporting must never cause a second problem */ }
}

export async function sendFeedback(sb: SupabaseClient, shopId: string, message: string, context: Record<string, unknown> = {}) {
  const { error } = await sb.from("app_report").insert({ shop_id: shopId, kind: "feedback", message: message.slice(0, 2000), context: { commit: process.env.NEXT_PUBLIC_COMMIT, ...context }, user_agent: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 200) : null });
  return !error;
}

const NOISE = /ResizeObserver|Script error|Loading chunk|ChunkLoadError|NetworkError|Failed to fetch|Load failed|AbortError/i;

/** Report unexpected errors from this page. At most 5 per visit, and not the usual network noise. */
export function watchErrors(sb: SupabaseClient, shopId: () => string | null) {
  let n = 0;
  const send = (msg: string, extra: Record<string, unknown>) => {
    if (!msg || NOISE.test(msg) || n >= 5) return;
    n++;
    reportError(sb, shopId(), msg, { path: location.pathname, ...extra }, navigator.userAgent);
  };
  const onError = (e: ErrorEvent) => send(e.message, { file: (e.filename || "").split("/").pop(), line: e.lineno });
  const onRej = (e: PromiseRejectionEvent) => send(String((e.reason && (e.reason.message ?? e.reason)) ?? "rejection"), { type: "promise" });
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRej);
  return () => { window.removeEventListener("error", onError); window.removeEventListener("unhandledrejection", onRej); };
}
