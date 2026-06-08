import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const agentGuiRoot = path.dirname(fileURLToPath(import.meta.url));

const isTauriDevShell =
  process.env.TAURI_ENV_DEBUG === "true"
  || process.env.AGENT_GUI_TAURI_SHELL === "1";

const nextConfig: NextConfig = {
  output: "standalone",
  // Monorepo: trace from repo root for standalone deps; use isolated USERPROFILE on Windows (see publish/qkrpc-publish-lib.ps1).
  outputFileTracingRoot: path.join(agentGuiRoot, ".."),
  outputFileTracingExcludes: {
    "*": [
      "agent-gui/src-tauri/**",
      "agent-gui/.next/**",
      "publish/**",
      "voice-asr-runtime/**",
      "../browser-runtime/**",
    ],
  },
  serverExternalPackages: [
    "@tauri-apps/api",
    "@tauri-apps/plugin-dialog",
    "@tauri-apps/plugin-global-shortcut",
    "@tauri-apps/plugin-opener",
  ],
  async rewrites() {
    return [
      {
        source: "/ActionDesignerIcons/:path*",
        destination: "/api/icons/res?path=:path*",
      },
    ];
  },
  experimental: {
    webpackMemoryOptimizations: true,
    serverActions: {
      bodySizeLimit: "4mb",
    },
  },
  webpack: (config, { dev, isServer }) => {
    // Do NOT remove ReactRefreshWebpackPlugin / HotModuleReplacementPlugin here —
    // that breaks the client bundle (encode-uri-path / React never hydrates; only
    // native <a href> clicks work). Mute HMR at runtime in Tauri instead
    // (see lib/tauri-dev-hmr-mute-script.ts).
    if (dev && !isServer && isTauriDevShell) {
      config.watchOptions = {
        ...config.watchOptions,
        // Reduce rebuild churn in WebView2; HMR websocket is blocked in Tauri shell.
        aggregateTimeout: 600,
      };
    }
    return config;
  },
};

export default nextConfig;
