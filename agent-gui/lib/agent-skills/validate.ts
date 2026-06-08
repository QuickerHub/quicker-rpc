const NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Lenient agentskills.io name validation — warn, do not block loading. */
export function validateSkillName(
  name: string,
  dirName: string,
): string[] {
  const warnings: string[] = [];
  if (!name) {
    warnings.push("missing name in frontmatter");
    return warnings;
  }
  if (name.length > 64) {
    warnings.push(`name exceeds 64 characters (${name.length})`);
  }
  if (!NAME_RE.test(name)) {
    warnings.push(`name "${name}" has invalid characters`);
  }
  if (name.startsWith("-") || name.endsWith("-")) {
    warnings.push(`name "${name}" must not start or end with hyphen`);
  }
  if (name.includes("--")) {
    warnings.push(`name "${name}" must not contain consecutive hyphens`);
  }
  if (dirName && name !== dirName) {
    warnings.push(
      `name "${name}" does not match directory "${dirName}" (loaded anyway)`,
    );
  }
  return warnings;
}
