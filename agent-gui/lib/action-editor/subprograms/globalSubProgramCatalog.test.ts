import assert from "node:assert/strict";
import { test } from "node:test";
import { ActionSubProgramKind } from "@/lib/action-editor/subprograms/subProgramUi";
import {
  mapGlobalCatalogToActionSubPrograms,
  mergeSubProgramsForStepEditor,
} from "./globalSubProgramCatalog";

test("mapGlobalCatalogToActionSubPrograms uses callIdentifier", () => {
  const rows = mapGlobalCatalogToActionSubPrograms([
    {
      id: "b6dd77fd-4578-47f7-acfb-c11f90122b74",
      name: "Demo",
      callIdentifier: "%%b6dd77fd-4578-47f7-acfb-c11f90122b74",
    },
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.kind, ActionSubProgramKind.GlobalLink);
  assert.equal(rows[0]?.name, "%%b6dd77fd-4578-47f7-acfb-c11f90122b74");
});

test("mergeSubProgramsForStepEditor dedupes global by embedded id", () => {
  const embedded = [
    {
      id: "sp1",
      name: "Local",
      description: "",
      icon: "",
      kind: ActionSubProgramKind.Internal,
      stepCount: 0,
      variableCount: 0,
      variables: [],
      steps: [],
      subPrograms: [],
    },
  ];
  const global = mapGlobalCatalogToActionSubPrograms([
    { id: "sp1", name: "Dup", callIdentifier: "%%sp1" },
    { id: "g2", name: "Other", callIdentifier: "%%g2" },
  ]);
  const merged = mergeSubProgramsForStepEditor(embedded, global);
  assert.equal(merged.length, 2);
  assert.equal(merged[1]?.id, "g2");
});
