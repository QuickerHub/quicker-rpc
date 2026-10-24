import assert from "node:assert/strict";
import { test } from "node:test";
import { inspectDesignerDocumentDependencies } from "./check-designer-document-dependencies.mjs";

test("the complete production document runtime graph stays independent of UI, server and Node", async () => {
  const result = await inspectDesignerDocumentDependencies();
  assert.equal(result.ok, true);
  assert.ok(result.entryPoints.includes("lib/action-editor/document/programDocumentSession.ts"));
  assert.ok(result.entryPoints.includes("lib/action-editor/document/programDocumentSubPrograms.ts"));
  assert.ok(result.inputCount >= result.entryPoints.length);
});

test("runtime Node/framework imports are rejected even in otherwise plain TypeScript", async () => {
  for (const dependency of ["node:fs", "fs", "react", "next/headers", "server-only"]) {
    await assert.rejects(inspectDesignerDocumentDependencies({ stdin: {
      contents: `export * from ${JSON.stringify(dependency)};`, loader: "ts",
    } }), (error) => error instanceof Error && error.message.includes(`-> ${dependency}`));
  }
});

test("a transitive UI dependency fails but a type-only React import is erased", async () => {
  await assert.rejects(inspectDesignerDocumentDependencies({ stdin: {
    contents: 'export { IconControl } from "@/lib/action-editor/shared/IconControl";', loader: "ts",
  } }), /UI\/server\/asset module|-> react/);
  await assert.rejects(inspectDesignerDocumentDependencies({ stdin: {
    contents: 'import "@/components/action-editor/program-editor-toolbox.css"; export const revision = 1;', loader: "ts",
  } }), /UI\/server\/asset module/);
  const result = await inspectDesignerDocumentDependencies({ stdin: {
    contents: 'import type { JSX } from "react"; export type View = JSX.Element; export const revision = 1;', loader: "ts",
  } });
  assert.deepEqual(result.externalImports, []);
});

test("framework directives in .ts are rejected after comments and other directives", async () => {
  for (const directive of ["use client", "use server"]) {
    await assert.rejects(inspectDesignerDocumentDependencies({ stdin: {
      contents: `/* source comment */ "use strict"; ${JSON.stringify(directive)}; export const state = 1;`, loader: "ts",
    } }), (error) => error instanceof Error && error.message.includes(`${directive} module`));
  }
});
