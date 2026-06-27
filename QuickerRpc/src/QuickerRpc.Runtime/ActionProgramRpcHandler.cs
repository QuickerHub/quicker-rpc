using System.Threading;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using QuickerRpc.AgentModel.Core;
using QuickerRpc.AgentModel.XAction;
using QuickerRpc.AgentModel.XAction.Project;
using QuickerRpc.Contracts.Rpc;
using QuickerRpc.Host;

namespace QuickerRpc.Runtime;

/// <summary>Maps action program host ports + AgentModel compression to wire DTOs.</summary>
public sealed class ActionProgramRpcHandler
{
    private readonly QuickerRpcRuntimeDependencies _dependencies;
    private readonly IActionProgramDesignerBridge? _designerBridge;

    public ActionProgramRpcHandler(
        QuickerRpcRuntimeDependencies dependencies,
        IActionProgramDesignerBridge? designerBridge = null)
    {
        _dependencies = dependencies ?? throw new System.ArgumentNullException(nameof(dependencies));
        _designerBridge = designerBridge;
    }

    public async Task<QuickerRpcGetCompressedActionResult> GetCompressedActionByIdAsync(
        IQuickerRpcActionProgramHost programs,
        string? actionId,
        string? returnMode,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();

        var id = (actionId ?? string.Empty).Trim();
        if (id.Length == 0)
        {
            return FailGet("actionId is required.");
        }

        if (!XActionGetReturnModeParser.TryParse(returnMode, out var mode, out var modeError))
        {
            return FailGet(modeError!);
        }

        if (_designerBridge?.TryGetCompressedAction(id, mode, out var designerResult) == true)
        {
            return designerResult;
        }

        var snapshot = await programs.TryGetProgramAsync(id, cancellationToken).ConfigureAwait(false);
        if (snapshot is null)
        {
            return FailGet($"Action not found: {id}");
        }

        return CompressSnapshot(snapshot, mode);
    }

    private QuickerRpcGetCompressedActionResult CompressSnapshot(
        QuickerRpcActionProgramSnapshot snapshot,
        XActionGetReturnMode mode)
    {
        JObject body;
        try
        {
            body = JObject.Parse(snapshot.BodyJson);
        }
        catch (System.Exception ex)
        {
            return FailGet($"Invalid XAction body JSON for {snapshot.ActionId}: {ex.Message}");
        }

        var (steps, variables, subPrograms) = ReadBodyArrays(body);
        XActionProgramService.EnsureEphemeralIds(steps, variables);

        var catalog = _dependencies.GetStepRunnerCatalog();
        var wireMode = XActionGetReturnModeParser.ToWire(mode);
        var presentation = snapshot.Presentation;

        JObject compressedRoot;
        bool? omitApplied = null;
        switch (mode)
        {
            case XActionGetReturnMode.Structure:
                compressedRoot = XActionProgramService.Compress(mode, steps, variables, catalog);
                break;
            case XActionGetReturnMode.Metadata:
                compressedRoot = XActionProgramService.Compress(
                    mode,
                    steps,
                    variables,
                    catalog,
                    title: presentation.Title,
                    description: presentation.Description,
                    icon: presentation.Icon,
                    contextMenuData: presentation.ContextMenuData,
                    subProgramCount: subPrograms.Count);
                break;
            case XActionGetReturnMode.Runtime:
                compressedRoot = new JObject
                {
                    ["steps"] = steps,
                    ["variables"] = variables,
                };
                if (subPrograms.Count > 0)
                {
                    compressedRoot["subPrograms"] = subPrograms;
                }

                break;
            default:
                compressedRoot = XActionProgramService.Compress(mode, steps, variables, catalog, omitDefaultLiteralInputs: true);
                omitApplied = true;
                if (subPrograms.Count > 0)
                {
                    compressedRoot["subPrograms"] = ActionEmbeddedSubProgramWire.CompressFromNative(
                        subPrograms,
                        catalog,
                        omitDefaultLiteralInputs: true);
                }

                break;
        }

        compressedRoot["actionId"] = snapshot.ActionId;
        compressedRoot["editVersion"] = snapshot.EditVersion;
        compressedRoot["returnMode"] = wireMode;
        compressedRoot["subProgramCount"] = subPrograms.Count;
        if (omitApplied.HasValue)
        {
            compressedRoot["omitDefaultLiteralInputsApplied"] = omitApplied.Value;
        }

        return new QuickerRpcGetCompressedActionResult
        {
            Success = true,
            ActionId = snapshot.ActionId,
            EditVersion = snapshot.EditVersion,
            CompressedJson = JTokenCompat.Compact(compressedRoot),
            OmitDefaultLiteralInputsApplied = omitApplied,
            SubProgramCount = subPrograms.Count,
            ReturnMode = wireMode,
            ReadSource = _dependencies.CatalogReadSource,
        };
    }

    private static (JArray Steps, JArray Variables, JArray SubPrograms) ReadBodyArrays(JObject body) =>
        (
            (body["steps"] ?? body["Steps"]) as JArray ?? new JArray(),
            (body["variables"] ?? body["Variables"]) as JArray ?? new JArray(),
            (body["subPrograms"] ?? body["SubPrograms"]) as JArray ?? new JArray());

    private static QuickerRpcGetCompressedActionResult FailGet(string message) =>
        new() { Success = false, ErrorMessage = message };
}
