import Link from "next/link";
import { UPDATED } from "@/lib/legal";

export function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main style={{ maxWidth: 680, margin: "0 auto", padding: "24px 20px 80px" }}>
      <Link href="/" className="label" style={{ fontSize: 16, textDecoration: "none" }}>← Back to Spal</Link>
      <h1 className="head" style={{ fontSize: 40, margin: "20px 0 4px" }}>{title}</h1>
      <p className="label" style={{ margin: "0 0 28px" }}>Last updated {UPDATED}</p>
      <div className="legal">{children}</div>
    </main>
  );
}
