import type { Metadata } from "next";
import { RootLayoutExtras } from "@/components/RootLayoutExtras";
import { ThemeProvider } from "@/components/ThemeProvider";
import { AppBootstrapSplash } from "@/components/shell/AppBootstrapSplash";
import {
  APP_BOOTSTRAP_SPLASH_DISMISS_SCRIPT,
  APP_BOOTSTRAP_SPLASH_INIT_SCRIPT,
  APP_BOOTSTRAP_SPLASH_MARKUP,
} from "@/lib/app-bootstrap-splash-markup";
import { CLIENT_RUNTIME_RECOVERY_SCRIPT } from "@/lib/client-runtime-recovery-script";
import { DEV_INTERACTION_RECOVERY_SCRIPT } from "@/lib/dev-interaction-recovery-script";
import { RELEASE_PREVIEW_INIT_SCRIPT } from "@/lib/release-preview-constants";
import { SIDEBAR_INIT_SCRIPT } from "@/lib/sidebar-prefs";
import { THEME_INIT_SCRIPT } from "@/lib/theme-constants";
import { TAURI_DEV_HMR_MUTE_SCRIPT } from "@/lib/tauri-dev-hmr-mute-script";
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
        <script dangerouslySetInnerHTML={{ __html: CLIENT_RUNTIME_RECOVERY_SCRIPT }} />
        {process.env.NODE_ENV === "development" ? (
          <script dangerouslySetInnerHTML={{ __html: TAURI_DEV_HMR_MUTE_SCRIPT }} />
        ) : null}
        {process.env.NODE_ENV === "development" ? (
          <script dangerouslySetInnerHTML={{ __html: DEV_INTERACTION_RECOVERY_SCRIPT }} />
        ) : null}
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
