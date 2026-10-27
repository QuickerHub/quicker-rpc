import type { Tool, ToolExecutionOptions, ToolSet } from "ai";
import type { ChatMode } from "./chat-mode";
import type { ToolOperationConstraints } from "./agent-tool-mode-guard";
import { LIST_TOOLS_TOOL } from "./list-tools-tool";

export type CurrentToolCatalogPolicy = Readonly<{
  mode: ChatMode;
  readOnlyExecutorToolIds?: readonly string[];
  operationConstraints?: ToolOperationConstraints;
}>;
export type CurrentToolCatalog = CurrentToolCatalogPolicy & Readonly<{ tools: ToolSet }>;

// Model input cannot supply these keys. Carry the child's narrower observation
// through the parent's existing execute wrappers, including its shared budget.
const catalogInvocation = Symbol("current-tool-catalog-invocation");
const catalogPolicy = Symbol("current-tool-catalog-policy");
type CatalogOptions = ToolExecutionOptions & { [catalogInvocation]?: CurrentToolCatalog };
type CatalogTool = Tool & { [catalogPolicy]?: CurrentToolCatalogPolicy };

export function currentToolCatalogForExecution(options?: ToolExecutionOptions): CurrentToolCatalog | undefined {
  return (options as CatalogOptions | undefined)?.[catalogInvocation];
}

/** Bind only discovery; preserve every executable definition and parent guard. */
export function bindCurrentToolCatalog<T extends ToolSet>(tools: T, policy?: CurrentToolCatalogPolicy): T {
  const definition = tools[LIST_TOOLS_TOOL] as CatalogTool | undefined;
  const inheritedPolicy = policy ?? definition?.[catalogPolicy];
  if (!definition?.execute || !inheritedPolicy) return tools;
  const capturedPolicy: CurrentToolCatalogPolicy = Object.freeze({
    mode: inheritedPolicy.mode,
    readOnlyExecutorToolIds: Object.freeze([...(inheritedPolicy.readOnlyExecutorToolIds ?? [])]),
    operationConstraints: Object.freeze(Object.fromEntries(Object.entries(inheritedPolicy.operationConstraints ?? {})
      .map(([id, constraint]) => [id, constraint ? Object.freeze({ allowedActions: Object.freeze([...constraint.allowedActions]) }) : undefined]))),
  });
  const catalog: CurrentToolCatalog = Object.freeze({ ...capturedPolicy, tools: Object.freeze({ ...tools }) });
  const execute = definition.execute;
  return { ...tools, [LIST_TOOLS_TOOL]: {
    ...definition,
    [catalogPolicy]: capturedPolicy,
    execute: (input: unknown, options: ToolExecutionOptions) => execute(input, {
      ...options,
      [catalogInvocation]: (options as CatalogOptions | undefined)?.[catalogInvocation] ?? catalog,
    } as CatalogOptions),
  } } as T;
}
