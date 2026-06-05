import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const agentGuiRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  output: "standalone",
  // Monorepo: trace from repo root so standalone build does not walk the runner profile (e.g. Documents).
  outputFileTracingRoot: path.join(agentGuiRoot, ".."),
  outputFileTracingExcludes: {
    "*": [
      "agent-gui/src-tauri/**",
      "agent-gui/.next/**",
      "publish/**",
      "voice-asr-runtime/**",
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
    serverActions: {
      bodySizeLimit: "4mb",
    },
  },
};

export default nextConfig;
