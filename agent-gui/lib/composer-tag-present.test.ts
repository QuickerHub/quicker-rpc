import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isComposerSubprogramTag,
  resolveComposerTagIconSpec,
} from "@/lib/composer-tag-present";
import { DEFAULT_GLOBAL_SUBPROGRAM_FA_ICON } from "@/lib/global-subprogram-icon";

describe("composer-tag-present", () => {
  it("defaults subprogram tags to Solid_Cubes FA glyph", () => {
    assert.equal(
      resolveComposerTagIconSpec({
        kind: "subprogram",
        id: "sp1",
        title: "QuickerRpc_Run",
      }),
      DEFAULT_GLOBAL_SUBPROGRAM_FA_ICON,
    );
    assert.equal(
      resolveComposerTagIconSpec({
        kind: "subprogram",
        id: "sp1",
        title: "Run",
        icon: "fa:Light_Code",
      }),
      "fa:Light_Code",
    );
    assert.equal(
      isComposerSubprogramTag({ kind: "subprogram", id: "sp1", title: "Run" }),
      true,
    );
    assert.equal(
      isComposerSubprogramTag({ kind: "action", id: "a1", title: "Run" }),
      false,
    );
  });
});
