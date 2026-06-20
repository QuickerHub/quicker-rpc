import test from "node:test";
import assert from "node:assert/strict";
import {
  buildSlashCatalogItems,
  buildSlashMenuModel,
  rankSlashCatalogItems,
  stripSlashDescriptionPreview,
} from "@/lib/composer-slash-catalog";
import { formatSubagentsCatalogBlock } from "@/lib/agent-defs/workspace-instructions.server";

test("rankSlashCatalogItems shows recommended bundled skills on empty query", () => {
  const items = buildSlashCatalogItems({
    commands: [
      {
        name: "z-cmd",
        description: "last alphabetically",
        argumentHint: null,
        scope: "workspace",
      },
    ],
    skills: [
      {
        name: "quicker-eval-expression",
        description: "Expressions",
        scope: "bundled",
      },
      { name: "zz-skill", description: "other", scope: "bundled" },
    ],
    agents: [],
  });

  const ranked = rankSlashCatalogItems(items, "");
  assert.ok(ranked.length > 0);
  const evalIdx = ranked.findIndex(
    (i) => i.kind === "skill" && i.name === "quicker-eval-expression",
  );
  const zzIdx = ranked.findIndex((i) => i.name === "zz-skill");
  assert.ok(evalIdx >= 0);
  assert.ok(zzIdx < 0 || evalIdx < zzIdx);
});

test("rankSlashCatalogItems filters by query", () => {
  const items = buildSlashCatalogItems({
    commands: [
      { name: "frontend-check", description: "UI check", argumentHint: null, scope: "workspace" },
    ],
    skills: [{ name: "quicker-authoring", description: "Authoring", scope: "bundled" }],
    agents: [],
  });

  const ranked = rankSlashCatalogItems(items, "front");
  assert.equal(ranked.length, 1);
  assert.equal(ranked[0]?.name, "frontend-check");
});

test("buildSlashMenuModel groups sections and collapses long lists", () => {
  const skills = Array.from({ length: 8 }, (_, i) => ({
    name: `skill-${i}`,
    description: `Skill ${i}`,
    scope: "bundled",
  }));
  const items = buildSlashCatalogItems({
    commands: [],
    skills,
    agents: [],
  });

  const collapsed = buildSlashMenuModel(items, "", new Set());
  assert.equal(collapsed.sections.length, 1);
  assert.equal(collapsed.sections[0]?.heading, "Skills");
  assert.equal(collapsed.sections[0]?.visibleItems.length, 5);
  assert.equal(collapsed.sections[0]?.hiddenCount, 3);
  assert.equal(collapsed.flatVisible.length, 5);

  const expanded = buildSlashMenuModel(items, "", new Set(["skill"]));
  assert.equal(expanded.sections[0]?.hiddenCount, 0);
  assert.equal(expanded.flatVisible.length, 8);
});

test("rankSlashCatalogItems boosts bundled author command on empty query", () => {
  const items = buildSlashCatalogItems({
    commands: [
      {
        name: "author",
        description: "Author action",
        argumentHint: null,
        scope: "bundled",
      },
      {
        name: "z-other",
        description: "Other",
        argumentHint: null,
        scope: "bundled",
      },
    ],
    skills: [],
    agents: [],
  });
  const ranked = rankSlashCatalogItems(items, "");
  assert.equal(ranked[0]?.name, "author");
});

test("formatSubagentsCatalogBlock includes inherit hint", () => {
  const block = formatSubagentsCatalogBlock([
    {
      name: "authoring-verify",
      description: "Verify patch",
      inherit: ["skills", "workspace"],
    },
  ]);
  assert.ok(block.includes("inherit: skills, workspace"));
});

test("stripSlashDescriptionPreview removes markdown emphasis", () => {
  assert.equal(
    stripSlashDescriptionPreview("在 **quicker-rpc 仓库根目录** 执行"),
    "在 quicker-rpc 仓库根目录 执行",
  );
});
