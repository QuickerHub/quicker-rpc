import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const agentGuiRoot = path.dirname(fileURLToPath(import.meta.url));

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
};

export default nextConfig;
