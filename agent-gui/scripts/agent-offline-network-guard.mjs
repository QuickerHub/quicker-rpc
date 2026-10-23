import http from "node:http";
import https from "node:https";
import net from "node:net";
import tls from "node:tls";
import dgram from "node:dgram";
import { syncBuiltinESMExports } from "node:module";

// In-process regression tripwire, not an OS sandbox. Tests install their own fake fetch.
const denied = () => { throw new Error("Offline Agent checks attempted a real network request"); };
globalThis.fetch = async () => denied();
http.request = denied;
http.get = denied;
https.request = denied;
https.get = denied;
const connect = net.Socket.prototype.connect;
const isLocalIpcPath = (path) => typeof path === "string" && (
  /^\\\\[.?]\\pipe\\/i.test(path)
  || process.platform !== "win32" && path.startsWith("/") && !path.startsWith("//")
);
net.Socket.prototype.connect = function (...args) {
  // tsx may use local IPC; no TCP destination is permitted.
  const first = args[0];
  const localPath = isLocalIpcPath(first)
    || first && typeof first === "object" && isLocalIpcPath(first.path) && first.port == null;
  if (!localPath) return denied();
  return Reflect.apply(connect, this, args);
};
tls.connect = denied;
dgram.Socket.prototype.send = denied;
syncBuiltinESMExports();
