#!/usr/bin/env node
/**
 * Build static QuickerAgent download page into dist/.
 * Reads version.json; optionally enriches tag from GitHub Releases API.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = path.resolve(__dirname, "..");
const REPO_ROOT = path.resolve(WEB_ROOT, "..");
const SRC = path.join(WEB_ROOT, "src");
const DIST = path.join(WEB_ROOT, "dist");

const GITHUB_REPO = "QuickerHub/quicker-rpc";
const BITIFUL_DOWNLOAD_PREFIX =
  "https://s3.bitiful.net/quicker-pkgs/quicker-rpc/quicker-agent";
const QKRPC_DOWNLOAD_URL =
  "https://github.com/QuickerHub/quicker-rpc/releases/latest/download/qkrpc-win-x64-setup.exe";
const RELEASES_URL = `https://github.com/${GITHUB_REPO}/releases`;
const REPO_URL = `https://github.com/${GITHUB_REPO}`;
const README_URL = `${REPO_URL}#quickeragent-agent-gui`;

function semverFromQuickerRpcVersion(version) {
  const trimmed = version.trim().replace(/^v/i, "");
  const parts = trimmed.split(".");
  if (parts.length < 3) {
    throw new Error(`Version must have at least three segments: ${version}`);
  }
  return parts.slice(0, 3).join(".");
}

function tagFromSemver(semver) {
  return semver.startsWith("v") ? semver : `v${semver}`;
}

async function readVersionJson() {
  const raw = await fs.readFile(path.join(REPO_ROOT, "version.json"), "utf8");
  const json = JSON.parse(raw);
  const full = String(json.QuickerRpc ?? "").trim();
  if (!full) {
    throw new Error("version.json missing QuickerRpc");
  }
  const semver = semverFromQuickerRpcVersion(full);
  return { full, semver, tag: tagFromSemver(semver) };
}

async function fetchLatestReleaseTag() {
  const url = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "quicker-agent-web-build",
  };
  const token = process.env.GITHUB_TOKEN?.trim();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  try {
    const res = await fetch(url, { headers });
    if (!res.ok) {
      console.warn(`GitHub API ${res.status}; using version.json tag`);
      return null;
    }
    const data = await res.json();
    const tag = String(data.tag_name ?? "").trim();
    return tag || null;
  } catch (err) {
    console.warn(`GitHub API failed: ${err.message}; using version.json tag`);
    return null;
  }
}

function applyTemplate(html, vars) {
  let out = html;
  for (const [key, value] of Object.entries(vars)) {
    out = out.replaceAll(`__${key}__`, value);
  }
  return out;
}

function downloadRedirectHtml(targetUrl) {
  const safe = targetUrl.replace(/"/g, "&quot;");
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta http-equiv="refresh" content="0;url=${safe}">
  <link rel="canonical" href="${safe}">
  <title>正在跳转到 QuickerAgent 下载…</title>
  <script>location.replace(${JSON.stringify(targetUrl)});</script>
</head>
<body>
  <p>正在跳转到官方下载地址… <a href="${safe}">点此继续</a></p>
</body>
</html>
`;
}

async function main() {
  const fromJson = await readVersionJson();
  const apiTag = await fetchLatestReleaseTag();
  const releaseTag = apiTag ?? fromJson.tag;
  // Always derive download version from local version.json so link matches this repo build.
  const downloadVersion = fromJson.semver;
  const displayVersion = releaseTag.replace(/^v/i, "");
  const downloadUrl = `${BITIFUL_DOWNLOAD_PREFIX}/quicker-agent-${downloadVersion}-x64-setup.exe`;

  const vars = {
    RELEASE_TAG: releaseTag,
    DISPLAY_VERSION: displayVersion,
    VERSION_FULL: fromJson.full,
    DOWNLOAD_URL: downloadUrl,
    QKRPC_DOWNLOAD_URL,
    RELEASES_URL,
    REPO_URL,
    README_URL,
    BUILD_YEAR: String(new Date().getUTCFullYear()),
  };

  await fs.rm(DIST, { recursive: true, force: true });
  await fs.mkdir(DIST, { recursive: true });

  const indexTemplate = await fs.readFile(path.join(SRC, "index.html"), "utf8");
  await fs.writeFile(
    path.join(DIST, "index.html"),
    applyTemplate(indexTemplate, vars),
    "utf8",
  );

  await fs.copyFile(path.join(SRC, "styles.css"), path.join(DIST, "styles.css"));

  const iconSrc = path.join(
    REPO_ROOT,
    "agent-gui",
    "src-tauri",
    "icons",
    "icon.png",
  );
  await fs.copyFile(iconSrc, path.join(DIST, "icon.png"));

  await fs.mkdir(path.join(DIST, "download"), { recursive: true });
  await fs.writeFile(
    path.join(DIST, "download", "index.html"),
    downloadRedirectHtml(downloadUrl),
    "utf8",
  );

  await fs.writeFile(
    path.join(DIST, "site.json"),
    JSON.stringify(
      {
        product: "QuickerAgent",
        releaseTag,
        displayVersion,
        downloadVersion,
        versionFull: fromJson.full,
        downloadUrl,
        builtAt: new Date().toISOString(),
      },
      null,
      2,
    ),
    "utf8",
  );

  console.log(`Built ${DIST}`);
  console.log(`  release: ${releaseTag}`);
  console.log(`  download: ${downloadUrl}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
