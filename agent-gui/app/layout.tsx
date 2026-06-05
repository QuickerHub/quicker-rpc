import type { Metadata } from "next";
import { AppConfirmHost } from "@/components/AppConfirmHost";
import { AppMessageHost } from "@/components/AppMessageHost";
import { DevErrorCaptureGate } from "@/components/dev/DevErrorCaptureGate";
import { QuickerAgentUpdateChecker } from "@/components/QuickerAgentUpdateChecker";
import { ThemeProvider } from "@/components/ThemeProvider";
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
      </head>
      <body>
        <ThemeProvider>
          <DevErrorCaptureGate />
          <QuickerAgentUpdateChecker />
          <AppConfirmHost />
          <AppMessageHost />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
