import "@fontsource-variable/inter";
import "@fontsource-variable/playfair-display";
import "./globals.css";
import type { Metadata, Viewport } from "next";
import { ThemeProvider } from "@/lib/theme";

export const metadata: Metadata = { title: "SPAL Biz", description: "The assistant you can't afford to hire." };
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f6fa" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0c10" },
  ],
};

// Runs before first paint so there is no flash of the wrong theme.
const themeScript = `(function(){try{var t=localStorage.getItem('spal-theme');if(t!=='light'&&t!=='dark')t='auto';document.documentElement.dataset.theme=t}catch(e){document.documentElement.dataset.theme='auto'}})()`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="auto" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
