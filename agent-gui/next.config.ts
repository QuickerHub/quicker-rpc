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
    // WebView2 on Windows freezes when Next dev HMR / Fast Refresh is active.
    if (dev && !isServer && isTauriDevShell) {
      const blocked = new Set([
        "ReactRefreshWebpackPlugin",
        "HotModuleReplacementPlugin",
      ]);
      config.plugins = config.plugins?.filter(
        (plugin: { constructor: { name: string } } | false | 0 | "" | null | undefined) =>
          plugin != null && !blocked.has(plugin.constructor.name),
      );
      for (const rule of config.module.rules) {
        if (!("oneOf" in rule) || !Array.isArray(rule.oneOf)) continue;
        for (const one of rule.oneOf) {
          if (!one || !Array.isArray(one.use)) continue;
          one.use = one.use.filter((loader: unknown) => {
            const path =
              typeof loader === "string"
                ? loader
                : typeof loader === "object"
                  && loader !== null
                  && "loader" in loader
                  ? String((loader as { loader?: string }).loader ?? "")
                  : "";
            return !path.includes("react-refresh");
          });
        }
      }
    }
    return config;
  },
};

export default nextConfig;
