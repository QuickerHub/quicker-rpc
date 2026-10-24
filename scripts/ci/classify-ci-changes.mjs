import { spawnSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

// These exact files have no generation, embedding or production-copy consumers.
// A new file or consumer requires a fresh dependency audit, not a wider glob.
export const DOCUMENTATION_ONLY_PATHS = Object.freeze([
  "docs/product/README.md",
  "docs/design/quicker-rpc-core-architecture.md",
  "docs/design/quicker-rpc-plugin-v2.md",
  "agent-gui/DESIGN.md",
  "docs/engineering/ci.md",
]);

const documentationPaths = new Set(DOCUMENTATION_ONLY_PATHS);
const commitPattern = /^[0-9a-f]{40}$/;
const maximumDiffBytes = 8 * 1024 * 1024;

function full(reason, changedFiles = 0) {
  return { scope: "full", reason, changedFiles };
}

/** Parse the entire unfiltered, no-renames raw diff, including both file modes. */
export function classifyRawDiff(raw) {
  if (!Buffer.isBuffer(raw) || raw.length > maximumDiffBytes) return full("invalid-diff");
  if (raw.length === 0) return full("empty-diff");
  let decoded;
  try {
    decoded = new TextDecoder("utf-8", { fatal: true }).decode(raw);
  } catch {
    return full("invalid-diff");
  }
  const fields = decoded.split("\0");
  if (fields.pop() !== "" || fields.length % 2 !== 0) return full("invalid-diff");
  const records = [];
  const seen = new Set();
  for (let index = 0; index < fields.length; index += 2) {
    const header = /^:([0-7]{6}) ([0-7]{6}) ([0-9a-f]{40}) ([0-9a-f]{40}) ([A-Z])$/.exec(fields[index]);
    const path = fields[index + 1];
    if (!header || !path || seen.has(path)) return full("invalid-diff");
    if (header[5] === "M" && (/^0+$/.test(header[3]) || /^0+$/.test(header[4]) || header[3] === header[4])) return full("invalid-diff");
    seen.add(path);
    records.push({ oldMode: header[1], newMode: header[2], status: header[5], path });
  }
  if (records.some(({ oldMode, newMode, status }) => oldMode !== "100644" || newMode !== "100644" || status !== "M")) {
    return full("file-shape-change", records.length);
  }
  if (records.some(({ path }) => !documentationPaths.has(path))) return full("non-documentation-input", records.length);
  return { scope: "docs-only", reason: "audited-documentation-only", changedFiles: records.length };
}

function gitCommand(repository, args) {
  const result = spawnSync("git", args, { cwd: repository, encoding: "buffer", timeout: 30_000, maxBuffer: maximumDiffBytes, windowsHide: true });
  if (result.error || result.status !== 0) throw new Error("Git comparison unavailable");
  return result.stdout;
}

/** Unknown events, incomplete history and every comparison error retain the full gate. */
export function classifyCiChanges({ repository, eventName, event, sha, git = gitCommand }) {
  if (!commitPattern.test(sha ?? "")) return full("invalid-revision");
  let base;
  let pullRequestHead;
  if (eventName === "pull_request") {
    const baseRepository = event?.pull_request?.base?.repo?.full_name;
    const headRepository = event?.pull_request?.head?.repo?.full_name;
    if (typeof baseRepository !== "string" || !baseRepository || baseRepository !== headRepository) return full("untrusted-pull-request");
    base = event?.pull_request?.base?.sha;
    pullRequestHead = event?.pull_request?.head?.sha;
    if (!commitPattern.test(pullRequestHead ?? "")) return full("invalid-revision");
  } else if (eventName === "push") {
    base = event?.before;
    if (event?.deleted !== false || event?.forced !== false || event?.created !== false || event?.after !== sha || !["refs/heads/main", "refs/heads/master"].includes(event?.ref)) return full("untrusted-push-range");
  } else {
    return full("event-requires-full");
  }
  if (!commitPattern.test(base ?? "") || /^0+$/.test(base)) return full("invalid-revision");
  try {
    const checkedOut = git(repository, ["rev-parse", "--verify", "HEAD"]).toString("utf8").trim();
    if (checkedOut !== sha) return full("checkout-mismatch");
    git(repository, ["merge-base", "--is-ancestor", base, sha]);
    if (pullRequestHead) git(repository, ["merge-base", "--is-ancestor", pullRequestHead, sha]);
    const raw = git(repository, ["diff", "--no-ext-diff", "--no-textconv", "--raw", "--no-renames", "--abbrev=40", "--ignore-submodules=none", "-z", base, sha, "--"]);
    return { ...classifyRawDiff(raw), base, head: sha };
  } catch {
    return full("comparison-unavailable");
  }
}

export function classifyEnvironment(environment = process.env) {
  try {
    const raw = readFileSync(environment.GITHUB_EVENT_PATH);
    if (raw.length > 1024 * 1024) return full("event-unavailable");
    return classifyCiChanges({ repository: environment.GITHUB_WORKSPACE ?? process.cwd(), eventName: environment.GITHUB_EVENT_NAME, event: JSON.parse(raw), sha: environment.GITHUB_SHA });
  } catch {
    return full("event-unavailable");
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = classifyEnvironment();
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `scope=${result.scope}\n`);
  console.log(JSON.stringify(result));
}
