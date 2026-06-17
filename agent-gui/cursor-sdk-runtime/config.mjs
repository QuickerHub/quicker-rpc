export const RUNTIME_VERSION = "1.0.0";
export const PROTOCOL_VERSION = "1";

const DEFAULT_PORT = 6023;

export function loadConfig(argv = process.argv.slice(2)) {
  let host = process.env.QUICKER_CURSOR_SDK_HOST?.trim() || "127.0.0.1";
  let port = DEFAULT_PORT;

  const portEnv =
    process.env.QUICKER_CURSOR_SDK_PORT?.trim()
    || process.env.AGENT_GUI_CURSOR_SDK_PORT?.trim();
  if (portEnv) {
    const parsed = Number(portEnv);
    if (Number.isFinite(parsed) && parsed > 0 && parsed <= 65535) {
      port = parsed;
    }
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--host" && argv[i + 1]) {
      host = argv[i + 1];
      i += 1;
    } else if (arg === "--port" && argv[i + 1]) {
      const parsed = Number(argv[i + 1]);
      if (Number.isFinite(parsed) && parsed > 0 && parsed <= 65535) {
        port = parsed;
      }
      i += 1;
    }
  }

  return { host, port };
}
