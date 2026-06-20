import "server-only";

import { quickerTools } from "@/lib/tools";
import {
  selectChatToolsFromRegistry,
  type SelectChatToolsParams,
} from "@/lib/chat-tool-selection";

export function selectChatTools(params: SelectChatToolsParams) {
  return selectChatToolsFromRegistry(quickerTools, params);
}
