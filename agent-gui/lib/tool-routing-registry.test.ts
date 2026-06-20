import assert from "node:assert/strict";
import { test } from "node:test";

import { ALL_QKRPC_TOOL_IDS } from "./tool-registry.ts";
import { TOOL_ROUTING_TABLE } from "./tool-routing.ts";

const REGISTRY_SORTED = [...ALL_QKRPC_TOOL_IDS].sort((a, b) => b.length - a.length);

function registryIdsInText(text: string): string[] {
  const found: string[] = [];
  let scratch = text;
  for (const id of REGISTRY_SORTED) {
    if (scratch.includes(id)) {
      found.push(id);
      scratch = scratch.split(id).join("");
    }
  }
  return found;
}

function routingToolCells(table: string): string[] {
  const cells: string[] = [];
  for (const line of table.split("\n")) {
    if (!line.startsWith("| ") || line.includes("User intent")) continue;
    const parts = line.split("|").map((c) => c.trim());
    if (parts.length < 4) continue;
    const toolCell = parts[2];
    if (!toolCell || toolCell === "Tool") continue;
    cells.push(toolCell);
  }
  return cells;
}

test("every routing tool cell references at least one registry tool", () => {
  const cells = routingToolCells(TOOL_ROUTING_TABLE);
  assert.ok(cells.length > 20);

  for (const cell of cells) {
    if (cell.startsWith("Tell user")) continue;
    const ids = registryIdsInText(cell);
    assert.ok(ids.length > 0, `routing cell has no registry tool id: ${cell}`);
    for (const id of ids) {
      assert.ok(ALL_QKRPC_TOOL_IDS.includes(id), `unexpected id ${id} from cell ${cell}`);
    }
  }
});

test("routing table mentions core merged and split tools", () => {
  assert.ok(TOOL_ROUTING_TABLE.includes("qkrpc_designer_open"));
  assert.ok(TOOL_ROUTING_TABLE.includes("qkrpc_subprogram_transfer"));
  assert.ok(!TOOL_ROUTING_TABLE.includes("qkrpc_action_edit"));
  assert.ok(!TOOL_ROUTING_TABLE.includes("qkrpc_subprogram_export"));
});
