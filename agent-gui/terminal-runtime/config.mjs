export const RUNTIME_VERSION = "0.3.0";
export const PROTOCOL_VERSION = "quicker-terminal-v3";

/**
 * @param {string[]} [argv]
 */
export function loadConfig(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const host =
    args.host?.trim()
    ?? process.env.QUICKER_TERMINAL_HOST?.trim()
    ?? "127.0.0.1";
  const port = Number(
    args.port ?? process.env.QUICKER_TERMINAL_PORT ?? "6022",
  );
  return { host, port };
}

/** @param {string[]} argv */
function parseArgs(argv) {
  /** @type {Record<string, string | undefined>} */
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      out[key] = next;
      i += 1;
    } else {
      out[key] = "true";
    }
  }
  return out;
}
