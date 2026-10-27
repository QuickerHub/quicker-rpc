import { runQkrpc } from "@/lib/qkrpc";
import { DesignerCatalogError } from "@/lib/action-editor/catalog/designerCatalogContext";
import { postDesignerCatalogRequest, requireDesignerCatalogResult } from "@/lib/action-editor/catalog/designerCatalogRequest.server";
import { readStepRunnerInputContract, STEP_RUNNER_INPUT_CONTRACT_CAPABILITY, StepRunnerInputContractError } from "@/lib/step-runner-input-contract";

export const dynamic = "force-dynamic";

/** A document-bound native policy read, separate from UI schemas and static catalogs. */
export async function POST(req: Request) {
  return postDesignerCatalogRequest(req, async (body, request) => {
    const binding = request.rpcOptions.hostBinding;
    if (!request.bound || !binding) throw new DesignerCatalogError("HOST_BINDING_REQUIRED", "A resolved document target is required for input contracts.");
    if (binding.capabilities[STEP_RUNNER_INPUT_CONTRACT_CAPABILITY] !== true)
      throw new DesignerCatalogError("INPUT_CONTRACT_UNSUPPORTED", "The bound host does not provide runtime input contracts.", 503);
    if (binding.hostKind !== "v1" && binding.hostKind !== "v2")
      throw new DesignerCatalogError("INPUT_CONTRACT_UNSUPPORTED", "The bound host kind is unsupported.", 503);
    if (typeof body.key !== "string" || !body.key.trim() || body.key.length > 1024
      || (body.controlField !== undefined && (typeof body.controlField !== "string" || body.controlField.length > 100_000)))
      throw new DesignerCatalogError("INVALID_INPUT_CONTRACT_REQUEST", "A runner key and optional literal control value are required.", 400);
    const key = body.key.trim();
    // A JSON string also preserves empty values in the CLI option parser.
    const args = ["step-runner", "input-contract", `--key=${key}`, "--no-bootstrap"];
    if (typeof body.controlField === "string") args.push("--control-field-json", JSON.stringify(body.controlField));
    const result = await runQkrpc(args, { timeoutMs: 30_000, ...request.rpcOptions });
    requireDesignerCatalogResult(result, request);
    request.rpcOptions.abortSignal?.throwIfAborted();
    const parsed = result.parsed as { payload?: unknown } | undefined;
    const payload = (parsed?.payload ?? result.parsed) as { success?: unknown; contract?: unknown } | undefined;
    if (payload?.success !== true)
      throw new DesignerCatalogError("INVALID_INPUT_CONTRACT_RESPONSE", "The bound host did not confirm its input contract.", 503);
    try {
      const contract = readStepRunnerInputContract(payload.contract, { hostKind: binding.hostKind, stepRunnerKey: key });
      if (typeof body.controlField === "string" && contract.appliedControlFieldValue !== body.controlField)
        throw new StepRunnerInputContractError("The native contract did not apply the exact requested control value.");
      request.rpcOptions.abortSignal?.throwIfAborted();
      return Response.json({ ok: true, source: "live", contract });
    } catch (error) {
      if (error instanceof StepRunnerInputContractError)
        throw new DesignerCatalogError("INVALID_INPUT_CONTRACT_RESPONSE", error.message, 503);
      throw error;
    }
  });
}
