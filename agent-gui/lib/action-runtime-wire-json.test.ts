import { describe, expect, it } from "vitest";
import { compactProgramWireJson } from "@/lib/action-runtime-wire-json";

describe("compactProgramWireJson", () => {
  it("compacts canonical inputParams to wire strings", () => {
    const out = compactProgramWireJson({
      steps: [
        {
          stepRunnerKey: "sys:assign",
          disabled: false,
          inputParams: { input: { value: "ok" } },
          outputParams: { output: "result" },
        },
      ],
      variables: [{ key: "result", defaultValue: "" }],
    });
    expect(out).toContain('"input": "ok"');
    expect(out).not.toContain('"value"');
    expect(out).not.toContain('"defaultValue"');
    expect(out).toContain('"default": ""');
  });

  it("compacts varKey bindings to .var suffix", () => {
    const out = compactProgramWireJson({
      steps: [
        {
          stepRunnerKey: "sys:readFile",
          inputParams: { path: { varKey: "path" } },
          outputParams: { txt: "content" },
        },
      ],
      variables: [{ key: "path", defaultValue: "D:\\\\a.txt" }],
    });
    expect(out).toContain('"path.var": "path"');
    expect(out).toContain('"default": "D:\\\\a.txt"');
  });

  it("omits subPrograms bodies for display input JSON", () => {
    const out = compactProgramWireJson(
      {
        steps: [
          {
            stepRunnerKey: "sys:subprogram",
            inputParams: { subProgram: "Inner" },
          },
        ],
        subPrograms: [
          {
            name: "Inner",
            steps: [
              {
                stepRunnerKey: "sys:assign",
                inputParams: { input: "nested" },
              },
            ],
          },
        ],
      },
      { omitSubProgramBodies: true },
    );
    expect(out).toContain('"subProgram": "Inner"');
    expect(out).not.toContain('"subPrograms"');
    expect(out).not.toContain("nested");
  });
});
