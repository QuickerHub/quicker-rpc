function parseTriple(version) {
  const parts = [0, 0, 0];
  String(version)
    .split(".")
    .slice(0, 3)
    .forEach((segment, index) => {
      const digits = segment.replace(/\D/g, "");
      parts[index] = Number.parseInt(digits || "0", 10);
    });
  return parts;
}

function compareSemverTriple(left, right) {
  const a = parseTriple(left);
  const b = parseTriple(right);
  for (let i = 0; i < 3; i++) {
    if (a[i] < b[i]) return -1;
    if (a[i] > b[i]) return 1;
  }
  return 0;
}

export function hostSatisfiesMinVersion(hostVersion, minRequired) {
  return compareSemverTriple(hostVersion, minRequired) >= 0;
}
