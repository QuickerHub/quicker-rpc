import {
  describeLegacyScanRoots,
  scanLegacyChatLevelDbStores,
} from "@/lib/legacy-chat-leveldb-scan.server";

export const dynamic = "force-dynamic";

export async function POST() {
  const hits = scanLegacyChatLevelDbStores();
  return Response.json({
    hits,
    scannedRoots: describeLegacyScanRoots(),
  });
}
