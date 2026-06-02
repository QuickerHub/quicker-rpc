import {
  measureToolDefinitionCharSizes,
  sumToolDefinitionChars,
} from "@/lib/tool-definition-sizes.server";
import { defaultEnabledToolIds } from "@/lib/tool-registry";

export const dynamic = "force-dynamic";

export async function GET() {
  const sizes = await measureToolDefinitionCharSizes();
  const defaultEnabled = defaultEnabledToolIds();
  return Response.json({
    sizes,
    totalAll: sumToolDefinitionChars(defaultEnabled, sizes),
  });
}
