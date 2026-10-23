import { createServer } from "node:net";
import { randomUUID } from "node:crypto";
import { join } from "node:path";

async function unusedPort(host: string): Promise<number> {
  const listener = createServer();
  await new Promise<void>((resolve, reject) => {
    listener.once("error", reject);
    listener.listen(0, host, resolve);
  });
  const address = listener.address();
  if (!address || typeof address === "string") throw new Error("Runtime port reservation failed");
  await new Promise<void>((resolve, reject) => listener.close((error) => error ? reject(error) : resolve()));
  return address.port;
}

/** A service never borrows another profile's browser or terminal by its default port. */
export async function configureOwnedRuntimeEnvironment(host: string, profileDirectory: string) {
  const owner = randomUUID();
  process.env.QUICKER_AGENT_RUNTIME_OWNER = owner;
  process.env.QUICKER_BROWSER_HOST = host;
  process.env.QUICKER_TERMINAL_HOST = host;
  process.env.AGENT_GUI_RUNTIME_STATE_DIR = join(profileDirectory, "runtime", owner);
  for (const [name, alias] of [["QUICKER_BROWSER_PORT", "AGENT_GUI_BROWSER_PORT"], ["QUICKER_TERMINAL_PORT", "AGENT_GUI_TERMINAL_PORT"]]) {
    if (!process.env[name]?.trim()) process.env[name] = process.env[alias]?.trim() || String(await unusedPort(host));
  }
}
