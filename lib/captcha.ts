// Cloudflare Turnstile, only when a site key is set. Turns itself off otherwise, so sign-in never breaks.
const KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

type Turnstile = { render: (el: HTMLElement, o: Record<string, unknown>) => string; remove: (id: string) => void };
declare global { interface Window { turnstile?: Turnstile } }

let loading: Promise<void> | null = null;
const SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

/** One try at loading the check. A slow phone gets 25 seconds before we give up on this try. */
function loadOnce(): Promise<void> {
  return new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = SRC;
    s.async = true;
    const t = setTimeout(() => { s.remove(); rej(new Error("captcha script timeout")); }, 25_000);
    s.onload = () => { clearTimeout(t); res(); };
    s.onerror = () => { clearTimeout(t); s.remove(); rej(new Error("captcha script")); };
    document.head.appendChild(s);
  });
}

/** Load the check, trying up to three times with a pause. A failed try must never be remembered: it used to be, so every retry failed the same way. */
function load() {
  if (window.turnstile) return Promise.resolve();
  if (!loading) {
    loading = (async () => {
      let last: unknown = null;
      for (let i = 0; i < 3; i++) {
        try { await loadOnce(); return; } catch (e) { last = e; await new Promise((r) => setTimeout(r, 1200 * (i + 1))); }
      }
      throw last;
    })().catch((e) => { loading = null; throw e; });
  }
  return loading;
}

async function fetchToken(): Promise<string | undefined> {
  if (!KEY) return undefined;
  await load();
  return new Promise((resolve, reject) => {
    const el = document.createElement("div");
    el.style.cssText = "position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:100";
    document.body.appendChild(el);
    let id = "";
    const done = () => { try { if (id) window.turnstile?.remove(id); } catch {} el.remove(); };
    const t = setTimeout(() => { done(); reject(new Error("captcha timeout")); }, 45_000);
    id = window.turnstile!.render(el, {
      sitekey: KEY,
      appearance: "interaction-only",
      retry: "auto",
      "refresh-expired": "auto",
      callback: (token: string) => { clearTimeout(t); done(); resolve(token); },
      "error-callback": (code?: string | number) => { clearTimeout(t); done(); reject(new Error(`captcha error ${code ?? ""}`.trim())); },
    });
  });
}

let warm: { p: Promise<string | undefined>; at: number } | null = null;

/** Start the check in the background, so by the time she taps a button the token is ready. */
export function warmCaptcha() {
  if (!KEY || warm) return;
  warm = { p: fetchToken().catch(() => undefined), at: Date.now() };
}

/** A one-use token proving a person is there. Uses the one prepared earlier if it is still fresh (they last about 5 minutes). */
export async function getCaptchaToken(): Promise<string | undefined> {
  if (!KEY) return undefined;
  if (warm && Date.now() - warm.at < 4 * 60 * 1000) {
    const w = warm;
    warm = null;
    const t = await w.p;
    if (t) return t;
  }
  warm = null;
  return fetchToken();
}
