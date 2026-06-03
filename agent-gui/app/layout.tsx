import type { Metadata } from "next";
import { AppMessageHost } from "@/components/AppMessageHost";
import { QuickerAgentUpdateChecker } from "@/components/QuickerAgentUpdateChecker";
import { TauriDialogPatch } from "@/components/TauriDialogPatch";
import { ThemeProvider } from "@/components/ThemeProvider";
import { TAURI_CONFIRM_PATCH_SCRIPT } from "@/lib/native-confirm";
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
        <script dangerouslySetInnerHTML={{ __html: SIDEBAR_INIT_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: TAURI_CONFIRM_PATCH_SCRIPT }} />
      </head>
      <body>
        <ThemeProvider>
          <TauriDialogPatch />
          <QuickerAgentUpdateChecker />
          <AppMessageHost />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
