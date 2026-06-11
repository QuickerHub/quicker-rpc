"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const logPath = path.join(
  process.env.TEMP || "C:\\Temp",
  "quicker-agent-electron-boot.log",
);

function bootLog(message) {
  const line = `${new Date().toISOString()} ${message}`;
  console.error(`[electron-boot] ${message}`);
  try {
    fs.appendFileSync(logPath, `${line}\n`, "utf8");
  } catch {
    // ignore log failures
  }
  if (process.env.LOCALAPPDATA) {
    try {
      const localLog = path.join(
        process.env.LOCALAPPDATA,
        "QuickerAgent",
        "electron-boot.log",
      );
      fs.mkdirSync(path.dirname(localLog), { recursive: true });
      fs.appendFileSync(localLog, `${line}\n`, "utf8");
    } catch {
      // ignore
    }
  }
}

bootLog(`bootstrap execPath=${process.execPath}`);

let electron;
try {
  electron = require("electron");
} catch (err) {
  bootLog(`FATAL require('electron') threw: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}

if (typeof electron !== "object" || !electron?.app) {
  bootLog(
    `FATAL require('electron') typeof=${typeof electron} value=${String(electron).slice(0, 120)}`,
  );
  process.exit(1);
}

globalThis.__QUICKER_ELECTRON__ = electron;
bootLog("bootstrap electron API ready");

const mainUrl = pathToFileURL(path.join(__dirname, "main.mjs")).href;

import(mainUrl)
  .then(() => bootLog("main.mjs loaded"))
  .catch((err) => {
    bootLog(`main.mjs load failed: ${err instanceof Error ? err.stack || err.message : String(err)}`);
    process.exit(1);
  });
