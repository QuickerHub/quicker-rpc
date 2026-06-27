using Newtonsoft.Json.Linq;
using QuickerRpc.AgentModel.Catalog;
using QuickerRpc.AgentModel.XAction.Compression;
using QuickerRpc.AgentModel.XAction.Patch;
using QuickerRpc.AgentModel.XAction.Project;
using QuickerRpc.AgentModel.XAction.Validation;

namespace QuickerRpc.AgentModel.XAction;

/// <summary>High-level XAction compress / patch operations for hosts (MCP, RPC plugin).</summary>
public static class XActionProgramService
{
    public static JObject Compress(
        XActionGetReturnMode mode,
        JArray steps,
        JArray variables,
        StepRunnerCatalog catalog,
        bool omitDefaultLiteralInputs = true,
        string? title = null,
        string? description = null,
        string? icon = null,
        string? contextMenuData = null,
        int subProgramCount = 0)
    {
        switch (mode)
        {
            case XActionGetReturnMode.Structure:
                return XActionCompressor.CompressStructure(steps, variables);
            case XActionGetReturnMode.Metadata:
                return XActionCompressor.CompressMetadata(
                    steps,
                    variables,
                    title,
                    description,
                    icon,
                    contextMenuData,
                    subProgramCount);
            default:
                return XActionCompressor.Compress(steps, variables, catalog, omitDefaultLiteralInputs);
        }
    }

    public static void EnsureEphemeralIds(JArray steps, JArray variables)
    {
        XActionCompressor.EnsureEphemeralStepIds(steps);
        XActionCompressor.EnsureEphemeralVariableIds(variables);
    }

    public static void NormalizeStepsInputParamKeys(JArray steps, StepRunnerCatalog? catalog) =>
        XActionCompressor.NormalizeStepsInputParamKeys(steps, catalog);

    public static IList<string> CollectStepsInputParamsWarnings(
        JArray steps,
        StepRunnerCatalog? catalog,
        StepInputParamsValidationContext? context = null) =>
        StepInputParamsValidator.CollectWarnings(steps, catalog, context);

    public static JArray NormalizeVariablesForSave(JArray variables) =>
        XActionCompressor.NormalizeVariablesForSave(variables);

    public static XActionPatchApplier.ApplyResult ApplyPatch(
        JArray steps,
        JArray variables,
        JObject patch) =>
        XActionPatchApplier.Apply(steps, variables, patch);

    /// <summary>Compile <c>formDef.file</c> / legacy <c>formSpec</c> on patch steps before apply (in-memory only).</summary>
    public static XActionFormSpecCompiler.CompileResult PreprocessPatch(
        JObject patch,
        string? projectDirectory = null) =>
        XActionFormSpecCompiler.CompilePatch(patch, projectDirectory);
}
