/** Format raw IPv4/IPv6 hosts without producing ambiguous URL authorities. */
export function runtimeHttpOrigin(host, port) {
  const authority = host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
  return `http://${authority}:${port}`;
}
