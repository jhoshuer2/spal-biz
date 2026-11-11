import "./globals.css";
import type { Metadata, Viewport } from "next";

export const metadata: Metadata = { title: "SPAL Biz", description: "The assistant you can't afford to hire." };
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
