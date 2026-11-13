import "@fontsource-variable/inter-tight"; // headline stand-in for Neue Haas Grotesk Display
import "@fontsource-variable/source-sans-3"; // body
import "./globals.css";
import type { Metadata, Viewport } from "next";
import { ThemeProvider } from "@/lib/theme";

export const metadata: Metadata = {
  title: "SPAL Biz",
  description: "The assistant you can't afford to hire.",
  applicationName: "Spal",
  appleWebApp: { capable: true, title: "Spal", statusBarStyle: "default" },
  icons: { apple: "/icons/apple-touch-icon.png" },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f6fa" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0c10" },
  ],
};

// Before the page's code has loaded (slow phones), remember what she taps or types on the first screen, so it carries over instead of being lost.
const earlyScript = `(function(){window.__typed={};document.addEventListener('click',function(e){if(window.__hydrated)return;var t=e.target&&e.target.closest&&e.target.closest('[data-early]');if(t)window.__early=t.getAttribute('data-early')},true);document.addEventListener('input',function(e){if(window.__hydrated)return;var t=e.target;if(t&&t.name)window.__typed[t.name]=t.value},true)})()`;

// Runs before first paint so there is no flash of the wrong theme.
const themeScript = `(function(){var d=document.documentElement;try{var t=localStorage.getItem('spal-theme');if(t!=='light'&&t!=='dark')t='auto';d.dataset.theme=t}catch(e){d.dataset.theme='auto'}try{d.dataset.boot=/(?:^|;\\s*)sb-[^=]*-auth-token/.test(document.cookie)?'returning':'new'}catch(e){d.dataset.boot='new'}})()`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="auto" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <script dangerouslySetInnerHTML={{ __html: earlyScript }} />
      </head>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
