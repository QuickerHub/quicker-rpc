#!/usr/bin/env node
/** Download getquicker User/Actions HTML fixtures for QuickerBench (maintainers only). */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  computeFromHtmlPages,
  detectUserActionsPagination,
  parseUserActionsPage,
} from "./quickerbench/lib/user-actions-likes.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const defaultUrl = "https://getquicker.net/User/Actions/113342-Cea";
const baseUrl = (process.argv[2] ?? defaultUrl).split("?")[0];
const fixtureDir = join(
  repoRoot,
  "agent-gui/benchmarks/quickerbench-fixtures/getquicker-user-actions/113342-cea",
);

async function fetchPage(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "quickerbench-fixture/1.0", Accept: "text/html" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.text();
}

async function main() {
  await mkdir(fixtureDir, { recursive: true });
  const html1 = await fetchPage(baseUrl);
  const { pages, totalActions } = detectUserActionsPagination(html1);
  const htmlPages = [html1];
  const pageFiles = ["page-1.html"];

  for (let p = 2; p <= pages; p += 1) {
    htmlPages.push(await fetchPage(`${baseUrl}?p=${p}`));
    pageFiles.push(`page-${p}.html`);
  }

  for (let i = 0; i < htmlPages.length; i += 1) {
    const fileName = pageFiles[i];
    await writeFile(join(fixtureDir, fileName), htmlPages[i], "utf8");
    const count = parseUserActionsPage(htmlPages[i]).length;
    console.error(`wrote ${fileName}: ${count} rows, ${htmlPages[i].length} bytes`);
  }

  const computed = computeFromHtmlPages(htmlPages);
  const manifest = {
    url: baseUrl,
    capturedAt: new Date().toISOString().slice(0, 10),
    pages: computed.pages,
    totalActions,
    parsedCount: computed.parsedCount,
    totalLikes: computed.totalLikes,
    pageFiles,
    oracle: computed.oracle,
  };
  await writeFile(
    join(fixtureDir, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
  console.log(JSON.stringify(manifest, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
