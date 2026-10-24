import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { checkDocumentationLinks } from "./check-documentation-links.mjs";

const temporary = resolve(dirname(fileURLToPath(import.meta.url)), "../../.tmp");
function fixture(t) {
  mkdirSync(temporary, { recursive: true });
  const parent = mkdtempSync(join(temporary, "documentation-links-")), root = join(parent, "repository");
  mkdirSync(root);
  t.after(() => {
    const suffix = relative(temporary, parent);
    assert.ok(suffix && !suffix.startsWith("..") && !suffix.includes(sep));
    rmSync(parent, { recursive: true, force: true });
  });
  const file = (name, content) => { const path = join(root, name); mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, content); return path; };
  return { root, parent, file, check: () => checkDocumentationLinks(root, ["docs/source.md"]) };
}

test("inline/image/reference links, encoded paths, titles, directories and Markdown anchors are checked", (t) => {
  const f = fixture(t);
  f.file("docs/target (copy).md", "# Repeat\n# Repeat\n## PR / publish instructions\n## 中文（当前）\n## `code_name`\n<a id=\"explicit-anchor\"></a>\n<a name='legacy-anchor'></a>\n");
  f.file("docs/code.cs", "source file, never executed");
  f.file("docs/image.png", "inert fixture bytes");
  f.file("docs/folder/keep.txt", "directory target");
  f.file("docs/source.md", `# Source
[nested](target%20(copy).md#repeat-1 "a title")
[angle](<target (copy).md#pr--publish-instructions>)
[中文](target%20(copy).md#中文当前)
[code](target%20(copy).md#code_name)
[explicit][named]
[collapsed][]
[shortcut]
[root](/docs/code.cs)
[directory](folder/)
![image](image.png)
[self](#source)
[remote](https://example.invalid/no-network)
[mail](mailto:nobody@example.invalid)
[scheme relative](//example.invalid/no-network)
[named]: target%20(copy).md#explicit-anchor 'title'
[collapsed]: target%20(copy).md#legacy-anchor
[shortcut]: code.cs
`);
  const result = f.check();
  assert.equal(result.ok, true);
  assert.equal(result.links, 14);
  assert.ok(result.bytesRead > 0 && result.bytesRead < 10000);
});

test("fenced and inline code and comments cannot invent links or heading anchors", (t) => {
  const f = fixture(t);
  f.file("docs/source.md", "# Real\n`[inline](absent.md)`\n<!-- [comment](absent.md) -->\n```md\n# Fake\n[fence](absent.md)\n```\n~~~\n[other](absent.md)\n~~~\n[self](#real)\n");
  assert.equal(f.check().links, 1);
  f.file("docs/source.md", "# Real\n```md\n# Fake\n```\n[self](#fake)\n");
  assert.throws(f.check, /Missing Markdown fragment/);
  for (const fake of ['`<a id="fake"></a>`', '<div data-id="fake"></div>', `<div title=' id="fake"'></div>`]) {
    f.file("docs/source.md", `${fake}\n[self](#fake)\n`);
    assert.throws(f.check, /Missing Markdown fragment/);
  }
});

test("CRLF Markdown retains heading fragments and closed fences", (t) => {
  const f = fixture(t);
  f.file("docs/target.md", "# Target\r\n```md\r\n# Hidden\r\n```\r\n### 工作台组合边界\r\n");
  f.file("docs/source.md", "[target](target.md#工作台组合边界)\r\n");
  assert.equal(f.check().ok, true);
});

test("missing targets and fragments fail, including reference links", (t) => {
  const f = fixture(t); f.file("docs/target.md", "# Existing\n");
  for (const content of ["[bad](absent.md)", "[bad](target.md#absent)", "[bad][alias]\n[alias]: absent.md", "[bad][missing]"]) {
    f.file("docs/source.md", content);
    assert.throws(f.check, /ENOENT|Missing Markdown fragment|Undefined Markdown reference/);
  }
  f.file("docs/code.cs", "not a Markdown file"); f.file("docs/source.md", "[bad](code.cs#line)");
  assert.throws(f.check, /Fragment target must be Markdown/);
});

test("repository escape, adjacent prefixes and all symlink redirects are rejected before content reads", (t) => {
  const f = fixture(t);
  const neighbor = join(f.parent, "repository-neighbor"); mkdirSync(neighbor);
  writeFileSync(join(neighbor, "target.md"), "not read through a redirect");
  f.file("docs/source.md", "[escape](../../repository-neighbor/target.md)");
  assert.throws(f.check, /escapes repository/);
  symlinkSync(neighbor, join(f.root, "linked"), process.platform === "win32" ? "junction" : "dir");
  f.file("docs/source.md", "[redirect](../linked/target.md)");
  assert.throws(f.check, /symlink/);
  const internal = join(f.root, "internal"); mkdirSync(internal); writeFileSync(join(internal, "target.md"), "# Target");
  symlinkSync(internal, join(f.root, "internal-link"), process.platform === "win32" ? "junction" : "dir");
  f.file("docs/source.md", "[internal redirect](../internal-link/target.md)");
  assert.throws(f.check, /symlink/);
});

test("unsafe URL forms and unsupported obvious Markdown syntax fail closed", (t) => {
  const f = fixture(t);
  const cases = [
    "[bad](javascript:alert)", "[bad](file:///outside.md)", "[bad](data:text/plain,a)",
    "[bad](target%2fchild.md)", "[bad](target%00.md)", "[bad](bad%ZZ.md)",
    "[bad](unclosed.md", "[bad] (space.md)", "[[wiki]]", "[^footnote]",
    '<a href="target.md">HTML link</a>', "[bad][id]\n[id]:", "[bad][id]\n[id]: a.md\n[id]: b.md",
    "    [indented](target.md)", "```md\nunclosed fence", "<!-- unclosed comment",
  ];
  for (const content of cases) { f.file("docs/source.md", content); assert.throws(f.check, undefined, content); }
});

test("source and fragment-target reads have bounded sizes", (t) => {
  const f = fixture(t);
  f.file("docs/source.md", "x".repeat(1024 * 1024 + 1));
  assert.throws(f.check, /read limit/);
  f.file("docs/source.md", "[large](large.md#heading)"); f.file("docs/large.md", "x".repeat(1024 * 1024 + 1));
  assert.throws(f.check, /read limit/);
});
