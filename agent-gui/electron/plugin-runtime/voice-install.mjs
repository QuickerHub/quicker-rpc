import { readFileSync } from "node:fs";
import { join } from "node:path";
import { voicePluginRoot } from "../quicker-agent-paths.mjs";
import { isVoiceAsrFullyInstalled } from "../voice-plugin/install.mjs";
import { resolveVoiceChannel } from "./channel.mjs";

export function isVoiceAsrInstalled(root = voicePluginRoot()) {
  return isVoiceAsrFullyInstalled(root);
}

export function readInstalledRuntimeVersion(root = voicePluginRoot()) {
  try {
    const raw = readFileSync(join(root, "runtime-version.txt"), "utf8").trim();
    return raw || null;
  } catch {
    return null;
  }
}

export async function needsRuntimeUpdate(ctx, root = voicePluginRoot()) {
  if (!isVoiceAsrInstalled(root)) return false;
  try {
    const channel = await resolveVoiceChannel({ ...ctx, forceRefresh: false });
    const channelVersion = String(channel.runtimeVersion ?? "").trim();
    const installed = readInstalledRuntimeVersion(root);
    if (!channelVersion || !installed) return false;
    return installed !== channelVersion;
  } catch {
    return false;
  }
}
