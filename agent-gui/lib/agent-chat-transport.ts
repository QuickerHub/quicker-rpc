import { DefaultChatTransport } from "ai";
import type { AgentUIMessage } from "@/lib/chat-types";
import type { ChatMode } from "@/lib/chat-mode";
import { resolveEnabledToolsForChatMode } from "@/lib/chat-mode";
import { loadStoredEnabledTools } from "@/lib/tool-registry";

type RefLike<T> = { current: T };

export type ActionDesignerChatRef = {
  entityId: string;
  isSubProgram?: boolean;
};

export type AgentChatTransportRefs = {
  threadId: string;
  chatMode: RefLike<ChatMode>;
  enabledTools: RefLike<string[]>;
  llmSelection: RefLike<string>;
  workingDirectory: RefLike<string | undefined>;
  titleManual: RefLike<boolean>;
  designerEmbedScoped: RefLike<boolean>;
  actionDesigner: RefLike<ActionDesignerChatRef | undefined>;
  benchMode?: RefLike<boolean>;
};

/** Stable DefaultChatTransport for main chat — body reads latest composer state via refs. */
export function createAgentChatTransport(refs: AgentChatTransportRefs): DefaultChatTransport<AgentUIMessage> {
  return new DefaultChatTransport({
    api: "/api/chat",
    body: () => ({
      threadId: refs.threadId,
      chatMode: refs.chatMode.current,
      enabledTools: resolveEnabledToolsForChatMode(
        refs.chatMode.current,
        refs.enabledTools.current,
        loadStoredEnabledTools,
      ),
      llmSelection: refs.llmSelection.current,
      llmProvider: refs.llmSelection.current,
      workingDirectory: refs.workingDirectory.current?.trim() || undefined,
      titleManual: refs.titleManual.current,
      designerEmbedScoped: refs.designerEmbedScoped.current,
      actionDesigner: refs.designerEmbedScoped.current
        ? refs.actionDesigner.current
        : undefined,
      ...(refs.benchMode?.current === true ? { benchMode: true } : {}),
    }),
  });
}

export type DevChatTransportOptions = {
  api?: string;
  body: () => Record<string, unknown>;
};

/** Thin wrapper for tool-test / dev panels with custom POST body. */
export function createDevChatTransport(options: DevChatTransportOptions): DefaultChatTransport<AgentUIMessage> {
  return new DefaultChatTransport({
    api: options.api ?? "/api/chat",
    body: options.body,
  });
}
