import { readFileSync } from "node:fs";

export type PluginChannelBootstrapEntry = {
  channelUrl: string;
  channelMirrorUrl?: string | null;
  minHostVersion?: string;
  activationEvents?: string[];
};

export type PluginRegistryBootstrap = {
  schemaVersion: number;
  registryUrl: string;
  registryMirrorUrl?: string | null;
  cacheTtlHours: number;
  offlineFallbackRegistry: {
    plugins: Record<string, PluginChannelBootstrapEntry>;
  };
};

export function readPluginRegistryBootstrap(
  bootstrapPath: string,
): PluginRegistryBootstrap {
  return JSON.parse(readFileSync(bootstrapPath, "utf8")) as PluginRegistryBootstrap;
}

export function voiceAsrChannelEntryFromBootstrap(
  bootstrap: PluginRegistryBootstrap,
): PluginChannelBootstrapEntry {
  const entry = bootstrap.offlineFallbackRegistry.plugins["voice-asr"];
  if (!entry) {
    throw new Error("bootstrap missing voice-asr entry");
  }
  return entry;
}
