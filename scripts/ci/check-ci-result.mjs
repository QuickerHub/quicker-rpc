import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const HEAVY_JOBS = Object.freeze(["agent", "designer-dom", "static-spa", "transport-linux", "dotnet"]);

/** A successful scope check is the only authority for an intentional heavy-job skip. */
export function checkCiResult(needs) {
  const errors = [];
  const expected = ["docs", ...HEAVY_JOBS];
  if (!needs || typeof needs !== "object" || Array.isArray(needs)) throw new Error("Missing CI job results");
  if (Object.keys(needs).length !== expected.length || expected.some((key) => !Object.hasOwn(needs, key))) errors.push("Unexpected CI job set");
  if (needs.docs?.result !== "success") errors.push("Generated knowledge / CI policy did not succeed");
  const scope = needs.docs?.outputs?.scope;
  if (scope !== "full" && scope !== "docs-only") errors.push("Missing or invalid CI scope");
  for (const job of HEAVY_JOBS) {
    const result = needs[job]?.result;
    if (result === "success") continue;
    if (result === "skipped" && scope === "docs-only" && needs.docs?.result === "success") continue;
    errors.push(`${job}: ${result ?? "missing"}`);
  }
  if (errors.length) throw new Error(errors.join("; "));
  return { ok: true, scope };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    console.log(JSON.stringify(checkCiResult(JSON.parse(process.env.CI_NEEDS_JSON ?? "null"))));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
