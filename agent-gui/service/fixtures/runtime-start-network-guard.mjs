import net from "node:net";
import tls from "node:tls";
import dgram from "node:dgram";
import { syncBuiltinESMExports } from "node:module";

const allowed = new URL(process.env.FIXTURE_HEALTH_BASE);
const nativeFetch = globalThis.fetch;
globalThis.fetch = (input, options) => {
  const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
  if (url.origin !== allowed.origin) throw Error("Fixture denied outbound fetch: " + url.origin);
  return nativeFetch(input, options);
};
const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  const value = Array.isArray(args[0]) ? args[0][0] : args[0];
  const ipc = typeof value === "string" && (/^\\\\[.?]\\pipe\\/i.test(value) || process.platform !== "win32" && value.startsWith("/"))
    || value?.path && value.port == null;
  if (!ipc && !(value?.host === "127.0.0.1" && Number(value.port) === Number(allowed.port))) throw Error("Fixture denied outbound socket");
  return Reflect.apply(connect, this, args);
};
tls.connect = () => { throw Error("Fixture denied TLS"); };
dgram.Socket.prototype.send = () => { throw Error("Fixture denied datagram"); };
syncBuiltinESMExports();
