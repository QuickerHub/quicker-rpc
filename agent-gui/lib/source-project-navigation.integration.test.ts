import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";
import { GET } from "../app/api/workspace/route";
import { actionProjectInfoJsonPath, type ActionExplorerTree } from "./action-explorer-tree";

const gui = fileURLToPath(new URL("../", import.meta.url));
const fixtures = resolve(gui, "..", ".tmp", "source-project-navigation");
const sourceId = "d8bdf8fe-1dbb-4915-a752-f6b10b7b890a";
const legacyId = "46967cb7-d487-48cf-9507-c0c131a0c14d";
const sourceDirectory = `.quicker/actions/${sourceId}`;
const legacyDirectory = `.quicker/actions/${legacyId}`;
const sourceEntry = `${sourceDirectory}/program.source.yaml`;
const legacyEntry = `${legacyDirectory}/data.json`;
const sourceTitle = "Synthetic source navigation title";
const legacyTitle = "Synthetic legacy navigation title";
const yaml = "$schema: quicker.program.source.v1\nvariables: []\nsteps: []\nsubPrograms: []\n";
const body = '{"Steps":[],"Variables":[],"SubPrograms":[]}';
const caw = '{"steps":[],"variables":[],"subPrograms":[],"$schema":"quicker.action.v1"}';
const hash = (text: string | Uint8Array) => createHash("sha256").update(text).digest("hex").toUpperCase();

type TreeResponse = { ok: true; tree: ActionExplorerTree; subprogramTree: ActionExplorerTree };
type NavigationReceipt = {
  markup: string;
  opened: { path: string; content?: string; options?: { revealInTree: boolean; tabLabel: string } }[];
  selected: string[];
  toggled: string[];
  cleared: number;
};

async function workspaceGet(cwd: string, parameters: Record<string, string>): Promise<Response> {
  // Request/Response invokes the production handler in-process; no listener is opened.
  return GET(new Request(`http://fixture.invalid/api/workspace?${new URLSearchParams({ cwd, ...parameters })}`));
}

async function inventory(directory: string, prefix = ""): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  for (const entry of await readdir(join(directory, prefix), { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    assert.equal(entry.isSymbolicLink(), false, "the synthetic fixture must contain no links");
    if (entry.isDirectory()) Object.assign(result, await inventory(directory, relative));
    else result[relative] = hash(await readFile(join(directory, relative)));
  }
  return result;
}

async function compileNavigation(entry: string): Promise<void> {
  const compiled = await build({
    absWorkingDir: gui, bundle: true, platform: "node", format: "cjs", packages: "external",
    jsx: "automatic", write: false, alias: { "@": gui }, tsconfig: join(gui, "tsconfig.json"),
    stdin: { resolveDir: gui, loader: "tsx", contents: `
      import fs from 'node:fs';
      import React from 'react';
      import {renderToStaticMarkup} from 'react-dom/server';
      import {WorkspaceExplorerTreePane} from './components/workspace/WorkspaceExplorerTreePane';
      const input=JSON.parse(fs.readFileSync(0,'utf8'));
      const state=globalThis.navigationFixture={...input,buttons:[],opened:[],selected:[],toggled:[],cleared:0};
      const markup=renderToStaticMarkup(React.createElement(WorkspaceExplorerTreePane));
      for(const node of input.tree.children){
        const title=node.title?node.title+'\\n'+node.path:node.path;
        const matches=state.buttons.filter(button=>button.title===title);
        if(matches.length!==1)throw Error('Expected exactly one actual project row for '+node.path+'; got '+matches.length);
        matches[0].onClick();
      }
      process.stdout.write(JSON.stringify({markup,opened:state.opened,selected:state.selected,toggled:state.toggled,cleared:state.cleared}));
    ` },
    plugins: [{ name: "synthetic-navigation-environment", setup(plugin) {
      // The real Pane, Tree, row callbacks and navigation helpers remain bundled.
      plugin.onResolve({ filter: /^react$/ }, args => args.importer.replace(/\\/g, "/").endsWith("/WorkspaceExplorerTreePane.tsx")
        ? { path: "expanded-pane-react", namespace: "navigation" } : undefined);
      plugin.onResolve({ filter: /^react\/jsx-runtime$/ }, () => ({ path: "capture-jsx", namespace: "navigation" }));
      plugin.onResolve({ filter: /^@\/lib\/(workspace-explorer|docs-viewer|explorer-prefs|use-action-project-delete)$/ }, args => ({ path: args.path, namespace: "navigation" }));
      plugin.onLoad({ filter: /.*/, namespace: "navigation" }, ({ path }) => {
        if (path === "expanded-pane-react") return { loader: "js", contents: `
          export {memo,useCallback,useEffect} from 'react';
          import {useState as actualUseState} from 'react';
          export const useState=initial=>actualUseState(initial===false?true:initial);
        ` };
        if (path === "capture-jsx") return { loader: "js", contents: `
          import React from 'react';
          export const Fragment=React.Fragment;
          export function jsx(type,props,key){
            if(type==='button'&&props.className?.split(' ').includes('explorer-tree-row')&&typeof props.onClick==='function')globalThis.navigationFixture.buttons.push(props);
            return React.createElement(type,key===undefined?props:{...props,key});
          }
          export const jsxs=jsx;
        ` };
        if (path.endsWith("workspace-explorer")) return { loader: "js", contents: `
          export const useWorkspaceExplorerTree=()=>{const s=globalThis.navigationFixture;return {cwd:s.cwd,tree:s.tree,subprogramTree:s.subprogramTree,
            treeChildrenLoading:false,treeError:null,expandedPaths:new Set([s.tree.rootPath,s.subprogramTree.rootPath]),selectedPath:s.selectedPath,
            ensureFullTree:async()=>{},toggleExpanded:path=>s.toggled.push(path),setSelectedPath:path=>s.selected.push(path)};};
          export const workspaceExplorerActionsRef={current:{openFile:(path,content,options)=>globalThis.navigationFixture.opened.push({path,content,options}),
            notifyProjectRemoved:()=>{throw Error('Deletion prohibited in navigation test');}}};
        ` };
        if (path.endsWith("docs-viewer")) return { loader: "js", contents: "export const useDocsViewer=()=>({clearActiveTopic:()=>{globalThis.navigationFixture.cleared++;}});" };
        if (path.endsWith("explorer-prefs")) return { loader: "js", contents: "export const loadExplorerPanelView=()=>({projectsExpanded:true});export const storeExplorerPanelView=()=>{};" };
        return { loader: "js", contents: `
          const prohibited=()=>{throw Error('Deletion/host commands prohibited in navigation test');};
          export const useActionProjectDelete=()=>({busy:false,disabled:true,statusText:null,statusErr:false,deleteInWorkspaceOnly:prohibited,deleteDirect:prohibited});
        ` };
      });
    } }],
  });
  await writeFile(entry, compiled.outputFiles[0]!.contents);
}

test("production tree API and real Explorer row callback open source YAML without legacy mirrors and preserve legacy navigation", async () => {
  await mkdir(fixtures, { recursive: true });
  const root = await mkdtemp(join(fixtures, "fixture-"));
  const cwd = join(root, "workspace");
  try {
    await mkdir(join(cwd, sourceDirectory, ".qkrpc"), { recursive: true });
    await mkdir(join(cwd, legacyDirectory), { recursive: true });
    await writeFile(join(cwd, sourceEntry), yaml);
    await writeFile(join(cwd, sourceDirectory, "quicker.source.json"), JSON.stringify({
      schema: "quicker.source-bundle.v1", kind: "action", actionId: sourceId, title: sourceTitle,
      editVersion: "7", hostBinding: null, storageIdentity: null, readSource: "catalog",
    }));
    await writeFile(join(cwd, sourceDirectory, ".qkrpc/baseline.json"),
      '{"schema":"qkrpc.native-baseline.v1","actionId":' + JSON.stringify(sourceId)
      + ',"hostBinding":null,"editVersion":"7","bodyHash":' + JSON.stringify(hash(body)) + ',"body":' + body
      + ',"cawHash":' + JSON.stringify(hash(caw)) + ',"caw":' + caw + ',"storageIdentity":null}');
    await writeFile(join(cwd, legacyEntry), '{"steps":[],"variables":[],"legacyMarker":"kept"}');
    await writeFile(join(cwd, legacyDirectory, "info.json"), JSON.stringify({ id: legacyId, title: legacyTitle }));
    const before = await inventory(cwd);
    const entry = join(root, "navigation.cjs");
    await compileNavigation(entry);

    for (const depth of ["roots", "full"]) {
      const response = await workspaceGet(cwd, { op: "tree", depth });
      assert.equal(response.status, 200);
      const tree = await response.json() as TreeResponse;
      assert.equal(tree.ok, true);
      assert.equal(tree.tree.children.length, 2);
      const source = tree.tree.children.find(node => node.path === sourceDirectory);
      const legacy = tree.tree.children.find(node => node.path === legacyDirectory);
      assert.ok(source); assert.ok(legacy);
      assert.equal(source.title, sourceTitle);
      assert.equal(source.actionId, sourceId);
      assert.equal(source.entryPath, sourceEntry);
      assert.equal(actionProjectInfoJsonPath(source, tree.tree.rootPath), null, "source metadata must not select legacy info.json");
      assert.equal(actionProjectInfoJsonPath(legacy, tree.tree.rootPath), `${legacyDirectory}/info.json`);
      if (depth === "roots") assert.equal(source.children?.length ?? 0, 0);
      else assert.ok(source.children?.some(node => node.path === sourceEntry), "full tree must contain the actual YAML file");

      // Static React markup and its real event callback are exercised, not browser DOM dispatch.
      const raw = execFileSync(process.execPath, ["--import", pathToFileURL(join(gui, "scripts/agent-offline-network-guard.mjs")).href, entry], {
        cwd: gui, env: { ...process.env, NODE_OPTIONS: "", NODE_PATH: join(gui, "node_modules") },
        input: JSON.stringify({ cwd, ...tree, selectedPath: sourceEntry }), encoding: "utf8", timeout: 8_000, stdio: "pipe",
      });
      const receipt = JSON.parse(raw) as NavigationReceipt;
      assert.match(receipt.markup, /Synthetic source navigation title/);
      assert.match(receipt.markup, /explorer-tree-row explorer-tree-row--selected/);
      assert.equal(receipt.cleared, 2);
      assert.deepEqual([...receipt.selected].sort(), [sourceDirectory, legacyDirectory].sort());
      assert.deepEqual([...receipt.toggled].sort(), [sourceDirectory, legacyDirectory].sort());
      assert.deepEqual([...receipt.opened].sort((a, b) => a.path.localeCompare(b.path)), [
        { path: sourceEntry, options: { revealInTree: false, tabLabel: sourceTitle } },
        { path: legacyEntry, options: { revealInTree: false, tabLabel: legacyTitle } },
      ].sort((a, b) => a.path.localeCompare(b.path)));

      for (const opened of receipt.opened) {
        const read = await workspaceGet(cwd, { op: "read", path: opened.path });
        assert.equal(read.status, 200, `${depth}: ${opened.path}`);
        const content = await read.json() as { ok: boolean; path: string; content: string; truncated: boolean };
        assert.equal(content.ok, true); assert.equal(content.path, opened.path); assert.equal(content.truncated, false);
        assert.equal(content.content, opened.path === sourceEntry ? yaml : '{"steps":[],"variables":[],"legacyMarker":"kept"}');
      }
    }
    assert.deepEqual(await inventory(cwd), before, "navigation and read must not create JSON mirrors or change managed source bytes");
    assert.deepEqual((await readdir(join(cwd, sourceDirectory))).sort(), [".qkrpc", "program.source.yaml", "quicker.source.json"]);
  } finally {
    assert.equal(dirname(root), fixtures, "cleanup must stay in the current repository's owned fixture root");
    await rm(root, { recursive: true, force: true });
  }
});
