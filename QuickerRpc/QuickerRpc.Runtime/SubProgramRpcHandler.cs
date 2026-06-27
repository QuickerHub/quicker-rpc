using System.Threading;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using QuickerRpc.AgentModel.Core;
using QuickerRpc.AgentModel.XAction;
using QuickerRpc.Contracts.Rpc;
using QuickerRpc.Host;

namespace QuickerRpc.Runtime;

/// <summary>Maps subprogram host ports + AgentModel compression to wire DTOs.</summary>
public sealed class SubProgramRpcHandler
{
    private readonly QuickerRpcRuntimeDependencies _dependencies;
    private readonly ISubProgramDesignerBridge? _designerBridge;

    public SubProgramRpcHandler(
        QuickerRpcRuntimeDependencies dependencies,
        ISubProgramDesignerBridge? designerBridge = null)
    {
        _dependencies = dependencies ?? throw new System.ArgumentNullException(nameof(dependencies));
        _designerBridge = designerBridge;
    }

    public async Task<QuickerRpcGetCompressedSubProgramResult> GetCompressedSubProgramAsync(
        IQuickerRpcSubProgramHost programs,
        string? idOrName,
        string? returnMode,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();

        var key = (idOrName ?? string.Empty).Trim();
        if (key.Length == 0)
        {
            return FailGet("subProgram id or name is required.");
        }

        if (!XActionGetReturnModeParser.TryParse(returnMode, out var mode, out var modeError))
        {
            return FailGet(modeError!);
        }

        if (_designerBridge?.TryGetCompressedSubProgram(key, mode, out var designerResult) == true)
        {
            return designerResult;
        }

        var snapshot = await programs.TryGetAsync(key, cancellationToken).ConfigureAwait(false);
        if (snapshot is null)
        {
            return FailGet($"Subprogram not found: {key}");
        }

        return CompressSnapshot(snapshot, mode);
    }

    private QuickerRpcGetCompressedSubProgramResult CompressSnapshot(
        QuickerRpcSubProgramSnapshot snapshot,
        XActionGetReturnMode mode)
    {
        JObject body;
        try
        {
            body = JObject.Parse(snapshot.BodyJson);
        }
        catch (System.Exception ex)
        {
            return FailGet($"Invalid subprogram body JSON for {snapshot.Id}: {ex.Message}");
        }

        var steps = (body["steps"] ?? body["Steps"]) as JArray ?? new JArray();
        var variables = (body["variables"] ?? body["Variables"]) as JArray ?? new JArray();
        XActionProgramService.EnsureEphemeralIds(steps, variables);

        var catalog = _dependencies.GetStepRunnerCatalog();
        var wireMode = XActionGetReturnModeParser.ToWire(mode);

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
                    title: snapshot.Name,
                    description: snapshot.Description ?? string.Empty,
                    icon: snapshot.Icon ?? string.Empty,
                    subProgramCount: 0);
                break;
            default:
                compressedRoot = XActionProgramService.Compress(mode, steps, variables, catalog, omitDefaultLiteralInputs: true);
                omitApplied = true;
                break;
        }

        compressedRoot["subProgramId"] = snapshot.Id;
        compressedRoot["name"] = snapshot.Name;
        compressedRoot["callIdentifier"] = snapshot.CallIdentifier ?? snapshot.Name;
        compressedRoot["editVersion"] = snapshot.EditVersion;
        compressedRoot["returnMode"] = wireMode;
        if (omitApplied.HasValue)
        {
            compressedRoot["omitDefaultLiteralInputsApplied"] = omitApplied.Value;
        }

        return new QuickerRpcGetCompressedSubProgramResult
        {
            Success = true,
            SubProgramId = snapshot.Id,
            Name = snapshot.Name,
            CallIdentifier = snapshot.CallIdentifier ?? snapshot.Name,
            EditVersion = snapshot.EditVersion,
            CompressedJson = JTokenCompat.Compact(compressedRoot),
            OmitDefaultLiteralInputsApplied = omitApplied,
            ReturnMode = wireMode,
            ReadSource = _dependencies.CatalogReadSource,
        };
    }

    private static QuickerRpcGetCompressedSubProgramResult FailGet(string message) =>
        new() { Success = false, ErrorMessage = message };
}
