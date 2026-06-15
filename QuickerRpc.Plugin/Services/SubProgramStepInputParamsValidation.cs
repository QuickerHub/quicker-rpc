using System.Collections.Generic;
using Newtonsoft.Json.Linq;
using QuickerRpc.AgentModel.XAction.Validation;

namespace QuickerRpc.Plugin.Services;

/// <summary>Builds validation context for sys:subprogram <c>var:*</c> input params.</summary>
internal static class SubProgramStepInputParamsValidation
{
    public static StepInputParamsValidationContext CreateContext(
        JToken? embeddedSubPrograms,
        string? workspaceRoot = null) =>
        new()
        {
            EmbeddedSubPrograms = embeddedSubPrograms as JArray,
            WorkspaceRoot = workspaceRoot,
            ResolveGlobalSubProgramInputVarKeys = TryResolveGlobalSubProgramInputVarKeys,
        };

    private static IReadOnlyList<string>? TryResolveGlobalSubProgramInputVarKeys(string identifier)
    {
        if (!ActionSubProgramCallScanner.TryResolveSubProgram(identifier, out var subProgram, out _, out _)
            || subProgram is null)
        {
            return null;
        }

        var variables = SubProgramProgramSerialization.VariablesToJArray(subProgram.Variables);
        return SubProgramStepWireKeys.CollectInputVarKeys(variables);
    }
}
