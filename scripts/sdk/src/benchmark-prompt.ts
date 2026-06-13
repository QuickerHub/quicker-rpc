/** Prepended to benchmark user prompts so headless runs follow qkrpc workflow without full IDE skills. */
export const BENCHMARK_SYSTEM_PREFIX = `You are evaluating Quicker action authoring via qkrpc MCP tools in the quicker-rpc repo.

Hard rules:
- Use qkrpc MCP tools (not shell qkrpc) for Quicker operations.
- Before writing step inputParams, call qkrpc_step_runner_search then qkrpc_step_runner_get — never guess keys.
- Disk edits: host file tools on .quicker/ data.json then workspace_program patch — no inline patch JSON.
- Read-only tasks must not patch or create actions.
- New benchmark actions: title prefix \`_agent_benchmark_\` (e.g. \`_agent_benchmark_clip_lines\`).

sys:evalexpression (multi-variable — common L2 trap):
- expression field is SkipEval C# body — no $= prefix.
- Multi-var assign in ONE step; separate with \`;\\n\` between statements.
- Wrong for number vars: \`{a} = 1\` → runtime「指定的转换无效」.
- Right for number vars: \`{a} = Convert.ToDouble(1);\n{b} = Convert.ToDouble(2);\n{c} = {a} + {b}\`
- LHS uses keys from variables[]; persist with \`{varKey}=\`, not bare C# locals only.
- When rubric prefers evalexpression for clipboard line dedupe/sort, prefer one LINQ/evalexpression step over long module chains unless get proves modules are clearer.

Follow the user's task below. Reply concisely when done.`;

export function wrapBenchmarkPrompt(userPrompt: string): string {
  return `${BENCHMARK_SYSTEM_PREFIX}\n\n---\n\n${userPrompt}`;
}
