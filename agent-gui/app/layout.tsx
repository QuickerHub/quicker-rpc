import type { Metadata } from "next";
import { RootLayoutExtras } from "@/components/RootLayoutExtras";
import { ThemeProvider } from "@/components/ThemeProvider";
import { AppBootstrapSplash } from "@/components/shell/AppBootstrapSplash";
import {
  APP_BOOTSTRAP_SPLASH_DISMISS_SCRIPT,
  APP_BOOTSTRAP_SPLASH_INIT_SCRIPT,
  APP_BOOTSTRAP_SPLASH_MARKUP,
} from "@/lib/app-bootstrap-splash-markup";
import { RELEASE_PREVIEW_INIT_SCRIPT } from "@/lib/release-preview-constants";
import { SIDEBAR_INIT_SCRIPT } from "@/lib/sidebar-prefs";
import { THEME_INIT_SCRIPT } from "@/lib/theme-constants";
import "./globals.css";

export const metadata: Metadata = {
  title: "QuickerAgent",
  description: "Chat agent for Quicker via qkrpc CLI",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: APP_BOOTSTRAP_SPLASH_INIT_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: RELEASE_PREVIEW_INIT_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: SIDEBAR_INIT_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: APP_BOOTSTRAP_SPLASH_DISMISS_SCRIPT }} />
      </head>
      <body>
        <div
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: APP_BOOTSTRAP_SPLASH_MARKUP }}
        />
        <ThemeProvider>
          <AppBootstrapSplash />
          <RootLayoutExtras />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
