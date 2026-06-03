import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  fileIconKindToBadgeLabel,
  fileIconKindToLanguage,
  resolveFileIconKind,
} from "./file-icon-kind";

describe("resolveFileIconKind", () => {
  it("maps common code extensions", () => {
    assert.equal(resolveFileIconKind("data.json"), "json");
    assert.equal(resolveFileIconKind("patch.jsonc"), "jsonc");
    assert.equal(resolveFileIconKind("Main.cs"), "csharp");
    assert.equal(resolveFileIconKind("clip.eval.cs"), "csharp");
    assert.equal(resolveFileIconKind("index.ts"), "typescript");
    assert.equal(resolveFileIconKind("App.tsx"), "tsx");
    assert.equal(resolveFileIconKind("main.py"), "python");
    assert.equal(resolveFileIconKind("README.md"), "markdown");
    assert.equal(resolveFileIconKind("page.html"), "html");
    assert.equal(resolveFileIconKind("styles.scss"), "scss");
    assert.equal(resolveFileIconKind("config.yaml"), "yaml");
    assert.equal(resolveFileIconKind("run.sh"), "shell");
    assert.equal(resolveFileIconKind("deploy.ps1"), "powershell");
    assert.equal(resolveFileIconKind("lib.rs"), "rust");
    assert.equal(resolveFileIconKind("main.go"), "go");
  });

  it("maps special basenames", () => {
    assert.equal(resolveFileIconKind("Dockerfile"), "docker");
    assert.equal(resolveFileIconKind(".gitignore"), "git");
    assert.equal(resolveFileIconKind(".env"), "env");
  });

  it("falls back to generic", () => {
    assert.equal(resolveFileIconKind("notes"), "generic");
    assert.equal(resolveFileIconKind("data.bin"), "generic");
  });
});

describe("fileIconKindToLanguage", () => {
  it("returns highlight language ids", () => {
    assert.equal(fileIconKindToLanguage("json"), "json");
    assert.equal(fileIconKindToLanguage("csharp"), "csharp");
    assert.equal(fileIconKindToLanguage("python"), "python");
    assert.equal(fileIconKindToLanguage("generic"), undefined);
  });
});

describe("fileIconKindToBadgeLabel", () => {
  it("returns short badge text", () => {
    assert.equal(fileIconKindToBadgeLabel("typescript"), "TS");
    assert.equal(fileIconKindToBadgeLabel("csharp"), "C#");
  });
});
