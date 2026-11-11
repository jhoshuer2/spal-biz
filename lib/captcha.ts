// Cloudflare Turnstile, only when a site key is set. Turns itself off otherwise, so sign-in never breaks.
const KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

type Turnstile = { render: (el: HTMLElement, o: Record<string, unknown>) => string; remove: (id: string) => void };
declare global { interface Window { turnstile?: Turnstile } }

let loading: Promise<void> | null = null;
function load() {
  if (window.turnstile) return Promise.resolve();
  if (!loading) {
    loading = new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      s.async = true;
      s.onload = () => res();
      s.onerror = () => rej(new Error("captcha script"));
      document.head.appendChild(s);
    });
  }
  return loading;
}

/** A one-use token proving a person is there. Usually invisible; shows a small check only if it needs to. */
export async function getCaptchaToken(): Promise<string | undefined> {
  if (!KEY) return undefined;
  await load();
  return new Promise((resolve, reject) => {
    const el = document.createElement("div");
    el.style.cssText = "position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:100";
    document.body.appendChild(el);
    let id = "";
    const done = () => { try { if (id) window.turnstile?.remove(id); } catch {} el.remove(); };
    const t = setTimeout(() => { done(); reject(new Error("captcha timeout")); }, 25_000);
    id = window.turnstile!.render(el, {
      sitekey: KEY,
      appearance: "interaction-only",
      callback: (token: string) => { clearTimeout(t); done(); resolve(token); },
      "error-callback": () => { clearTimeout(t); done(); reject(new Error("captcha error")); },
    });
  });
}
