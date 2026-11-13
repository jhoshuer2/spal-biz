/** What kind of Supabase key this is, from its shape only. Never returns the key itself. */
export function keyKind(k?: string | null): string {
  if (!k) return "missing";
  if (k.startsWith("sb_secret_")) return "secret key";
  if (k.startsWith("sb_publishable_")) return "publishable key (WRONG: this is the public key)";
  const parts = k.split(".");
  if (parts.length === 3) {
    try {
      const p = JSON.parse(Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString());
      return p.role === "service_role" ? "service_role" : `${p.role ?? "unknown"} key (WRONG: this is not the service_role key)`;
    } catch { /* fall through */ }
  }
  return "unrecognised";
}
export const keyIsWrong = (kind: string) => kind.includes("WRONG") || kind === "missing" || kind === "unrecognised";
