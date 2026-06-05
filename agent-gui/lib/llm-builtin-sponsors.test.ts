import assert from "node:assert/strict";
import test from "node:test";
import {
  parseBuiltinSponsorsMap,
  resolveBuiltinSponsor,
} from "@/lib/llm-builtin-sponsors";
import { DEEPSEEK_PROVIDER_ID, LLM_PROVIDER_ID } from "@/lib/llm-providers";

test("parseBuiltinSponsorsMap reads publish config sponsors", () => {
  const map = parseBuiltinSponsorsMap({
    sponsors: {
      bingleimuzi: {
        name: "CL",
        url: "https://getquicker.net/User/Actions/3-CL",
      },
      deepseek: {
        name: "冰雷木子",
        url: "https://getquicker.net/User/Actions/749380-%E5%86%B0%E9%9B%B7%E6%9C%A8%E5%AD%90",
      },
    },
  });
  assert.equal(map[LLM_PROVIDER_ID]?.name, "CL");
  assert.equal(map[DEEPSEEK_PROVIDER_ID]?.name, "冰雷木子");
});

test("resolveBuiltinSponsor falls back to defaults", () => {
  const sponsor = resolveBuiltinSponsor({}, LLM_PROVIDER_ID);
  assert.equal(sponsor?.name, "CL");
});
