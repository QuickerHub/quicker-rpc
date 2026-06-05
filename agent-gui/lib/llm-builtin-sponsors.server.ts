import {
  DEFAULT_BUILTIN_SPONSORS,
  mergeBuiltinSponsors,
  type LlmBuiltinSponsorsMap,
} from "@/lib/llm-builtin-sponsors";
import { loadLlmConfigSponsors } from "@/lib/llm-config";
import { sponsorsFromGroupsConfig } from "@/lib/llm-endpoint-groups";
import { loadMergedBuiltinGroupsConfig } from "@/lib/llm-bundled-secrets";
import { loadPublishConfigSponsors } from "@/lib/llm-publish-config";

export function resolveBuiltinModelSponsors(): LlmBuiltinSponsorsMap {
  return mergeBuiltinSponsors(
    DEFAULT_BUILTIN_SPONSORS,
    loadLlmConfigSponsors(),
    loadPublishConfigSponsors(),
    sponsorsFromGroupsConfig(loadMergedBuiltinGroupsConfig()),
  );
}
