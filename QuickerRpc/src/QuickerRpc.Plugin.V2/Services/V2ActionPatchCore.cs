using Newtonsoft.Json.Linq;
using QuickerRpc.AgentModel.Catalog;
using QuickerRpc.AgentModel.Core;
using QuickerRpc.AgentModel.XAction;
using QuickerRpc.AgentModel.XAction.Compression;
using QuickerRpc.AgentModel.XAction.Patch;
using QuickerRpc.Contracts.Rpc;

namespace QuickerRpc.Plugin.V2.Services;

internal static class V2ActionPatchCore
{
    private const int MaxContextMenuDataLength = 1500;

    public static V2ActionPatchCoreResult Apply(
        JObject body,
        JObject patch,
        StepRunnerCatalog? catalog = null)
    {
        var metadata = ReadMetadataPatch(patch);
        var programPatch = BuildProgramPatch(patch);
        var hasMeta = metadata.HasAny;
        var hasProgramPatch = programPatch["steps"] is JArray || programPatch["variables"] is JArray;

        if (XActionPatchApplier.IsProgramReplaceMode(patch)
            && (programPatch["steps"] is not JArray || programPatch["variables"] is not JArray))
        {
            return Fail("replace patch requires steps and variables JSON arrays (same as action replace).");
        }

        if (!hasMeta && !hasProgramPatch)
        {
            return Fail("patch must contain steps/variables arrays and/or title, description, icon, contextMenuData.");
        }

        if (!ValidateMetadata(metadata, out var metadataError))
        {
            return Fail(metadataError ?? "metadata patch is invalid.");
        }

        var formPreprocess = XActionProgramService.PreprocessPatch(programPatch, projectDirectory: null);
        if (!formPreprocess.Success)
        {
            return Fail(formPreprocess.ErrorMessage ?? "form spec compile failed.");
        }

        var (steps, variables, _) = ActionProgramContent.ReadBodyArrays(body);
        var stepsClone = (JArray)steps.DeepClone();
        var variablesClone = (JArray)variables.DeepClone();
        XActionProgramService.EnsureEphemeralIds(stepsClone, variablesClone);

        var applyResult = new XActionPatchApplier.ApplyResult { Success = true };
        var effectiveCatalog = catalog ?? new StepRunnerCatalog();
        if (hasProgramPatch)
        {
            applyResult = XActionProgramService.ApplyPatch(stepsClone, variablesClone, programPatch);
            if (!applyResult.Success)
            {
                return Fail(applyResult.ErrorMessage ?? "patch apply failed.");
            }

            XActionProgramService.NormalizeStepsInputParamKeys(stepsClone, effectiveCatalog);
        }

        var normalizedVariables = XActionProgramService.NormalizeVariablesForSave(variablesClone);
        body["steps"] = stepsClone;
        body["variables"] = normalizedVariables;
        if (programPatch["subPrograms"] is JArray subPrograms)
        {
            body["subPrograms"] = subPrograms;
        }

        return new V2ActionPatchCoreResult
        {
            Success = true,
            Body = body,
            Metadata = metadata,
            PresentationUpdated = hasMeta,
            UpdatedStepsJson = JTokenCompat.Compact(CompressSteps(applyResult.UpdatedSteps, effectiveCatalog)),
            AddedStepsJson = applyResult.AddedSteps.Count > 0
                ? JTokenCompat.Compact(CompressSteps(applyResult.AddedSteps, effectiveCatalog))
                : null,
            UpdatedVariablesJson = JTokenCompat.Compact(CompressVariables(applyResult.UpdatedVariables)),
            AddedVariablesJson = applyResult.AddedVariables.Count > 0
                ? JTokenCompat.Compact(CompressVariables(applyResult.AddedVariables))
                : null,
            Warnings = hasProgramPatch
                ? XActionProgramService.CollectStepsInputParamsWarnings(stepsClone, effectiveCatalog).ToList()
                : new List<string>(),
        };
    }

    private static JObject BuildProgramPatch(JObject patch)
    {
        var programPatch = (JObject)patch.DeepClone();
        programPatch.Remove("title");
        programPatch.Remove("description");
        programPatch.Remove("icon");
        programPatch.Remove("contextMenuData");
        return programPatch;
    }

    private static V2ActionMetadataPatch ReadMetadataPatch(JObject patch) =>
        new()
        {
            Title = ReadOptionalPatchString(patch["title"]),
            Description = ReadOptionalPatchString(patch["description"]),
            Icon = ReadOptionalPatchString(patch["icon"]),
            ContextMenuData = ReadOptionalPatchString(patch["contextMenuData"]),
        };

    private static bool ValidateMetadata(V2ActionMetadataPatch metadata, out string? error)
    {
        error = null;
        if (metadata.Title is not null && metadata.Title.Trim().Length == 0)
        {
            error = "title cannot be empty.";
            return false;
        }

        if (metadata.ContextMenuData is not null && metadata.ContextMenuData.Length > MaxContextMenuDataLength)
        {
            error = $"contextMenuData exceeds max length ({MaxContextMenuDataLength}).";
            return false;
        }

        return true;
    }

    private static string? ReadOptionalPatchString(JToken? token)
    {
        if (token is null)
        {
            return null;
        }

        return token.Type switch
        {
            JTokenType.Null => string.Empty,
            JTokenType.String => token.ToString(),
            _ => JTokenCompat.Compact(token),
        };
    }

    private static JArray CompressSteps(IEnumerable<JObject> steps, StepRunnerCatalog catalog)
    {
        var compressed = new JArray();
        foreach (var step in steps)
        {
            compressed.Add(XActionCompressor.CompressStep(step, catalog, omitDefaultLiteralInputs: false));
        }

        return compressed;
    }

    private static JArray CompressVariables(IEnumerable<JObject> variables)
    {
        var compressed = new JArray();
        foreach (var variable in variables)
        {
            compressed.Add(XActionCompressor.CompressVariable(variable));
        }

        return compressed;
    }

    private static V2ActionPatchCoreResult Fail(string message) =>
        new() { Success = false, ErrorMessage = message };
}

internal sealed class V2ActionPatchCoreResult
{
    public bool Success { get; set; }

    public string? ErrorMessage { get; set; }

    public JObject Body { get; set; } = new();

    public V2ActionMetadataPatch Metadata { get; set; } = new();

    public bool PresentationUpdated { get; set; }

    public string? UpdatedStepsJson { get; set; }

    public string? AddedStepsJson { get; set; }

    public string? UpdatedVariablesJson { get; set; }

    public string? AddedVariablesJson { get; set; }

    public IList<string> Warnings { get; set; } = new List<string>();
}

internal sealed class V2ActionMetadataPatch
{
    public string? Title { get; set; }

    public string? Description { get; set; }

    public string? Icon { get; set; }

    public string? ContextMenuData { get; set; }

    public bool HasAny =>
        Title is not null
        || Description is not null
        || Icon is not null
        || ContextMenuData is not null;
}
