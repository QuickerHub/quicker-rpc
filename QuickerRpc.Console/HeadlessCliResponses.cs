using System.Text.Json;
using QuickerRpc.Contracts.Rpc;

namespace QuickerRpc.Console;

internal static class HeadlessCliResponses
{
    public static object ToGetPayload(QuickerRpcGetCompressedActionResult response)
    {
        if (!response.Success || string.IsNullOrWhiteSpace(response.CompressedJson))
        {
            return new
            {
                success = response.Success,
                errorMessage = response.ErrorMessage,
                actionId = response.ActionId,
                editVersion = response.EditVersion,
                returnMode = response.ReturnMode,
            };
        }

        using var doc = JsonDocument.Parse(response.CompressedJson);
        return new
        {
            success = response.Success,
            errorMessage = response.ErrorMessage,
            actionId = response.ActionId,
            editVersion = response.EditVersion,
            compressed = doc.RootElement.Clone(),
            omitDefaultLiteralInputsApplied = response.OmitDefaultLiteralInputsApplied,
            subProgramCount = response.SubProgramCount,
            returnMode = response.ReturnMode,
        };
    }

    public static object ToPatchPayload(QuickerRpcApplyActionPatchResult response) =>
        new
        {
            success = response.Success,
            errorMessage = response.ErrorMessage,
            actionId = response.ActionId,
            editVersion = response.EditVersion,
            versionConflict = response.VersionConflict,
            presentationUpdated = response.PresentationUpdated,
            updatedSteps = ParseJsonOrNull(response.UpdatedStepsJson),
            addedSteps = ParseJsonOrNull(response.AddedStepsJson),
            updatedVariables = ParseJsonOrNull(response.UpdatedVariablesJson),
            addedVariables = ParseJsonOrNull(response.AddedVariablesJson),
            updatedUtc = response.UpdatedUtc,
            warnings = ToWarningsArray(response.Warnings),
        };

    public static object ToReplacePayload(QuickerRpcApplyXActionResult response) =>
        new
        {
            success = response.Success,
            errorMessage = response.ErrorMessage,
            actionId = response.ActionId,
            editVersion = response.EditVersion,
            versionConflict = response.VersionConflict,
            updatedUtc = response.UpdatedUtc,
            warnings = ToWarningsArray(response.Warnings),
        };

    public static object ToMetadataPayload(QuickerRpcUpdateActionMetadataResult response) =>
        new
        {
            success = response.Success,
            errorMessage = response.ErrorMessage,
            actionId = response.ActionId,
            editVersion = response.EditVersion,
            versionConflict = response.VersionConflict,
            title = response.Title,
            description = response.Description,
            icon = response.Icon,
            contextMenuData = response.ContextMenuData,
            updatedUtc = response.UpdatedUtc,
        };

    public static object ToSubProgramGetPayload(QuickerRpcGetCompressedSubProgramResult response)
    {
        if (!response.Success || string.IsNullOrWhiteSpace(response.CompressedJson))
        {
            return new
            {
                success = response.Success,
                errorMessage = response.ErrorMessage,
                subProgramId = response.SubProgramId,
                name = response.Name,
                callIdentifier = response.CallIdentifier,
                editVersion = response.EditVersion,
                returnMode = response.ReturnMode,
            };
        }

        using var doc = JsonDocument.Parse(response.CompressedJson);
        return new
        {
            success = response.Success,
            errorMessage = response.ErrorMessage,
            subProgramId = response.SubProgramId,
            name = response.Name,
            callIdentifier = response.CallIdentifier,
            editVersion = response.EditVersion,
            compressed = doc.RootElement.Clone(),
            omitDefaultLiteralInputsApplied = response.OmitDefaultLiteralInputsApplied,
            returnMode = response.ReturnMode,
        };
    }

    public static object ToSubProgramPatchPayload(QuickerRpcApplySubProgramPatchResult response) =>
        new
        {
            success = response.Success,
            errorMessage = response.ErrorMessage,
            subProgramId = response.SubProgramId,
            callIdentifier = response.CallIdentifier,
            editVersion = response.EditVersion,
            versionConflict = response.VersionConflict,
            updatedSteps = ParseJsonOrNull(response.UpdatedStepsJson),
            addedSteps = ParseJsonOrNull(response.AddedStepsJson),
            updatedVariables = ParseJsonOrNull(response.UpdatedVariablesJson),
            addedVariables = ParseJsonOrNull(response.AddedVariablesJson),
            updatedUtc = response.UpdatedUtc,
            warnings = ToWarningsArray(response.Warnings),
        };

    public static object ToStepRunnerDetailPayload(QuickerRpcStepRunnerDetailResult response)
    {
        if (!response.Success || string.IsNullOrWhiteSpace(response.SchemaJson))
        {
            return new { success = response.Success, errorMessage = response.ErrorMessage };
        }

        using var doc = JsonDocument.Parse(response.SchemaJson);
        return new
        {
            success = response.Success,
            errorMessage = response.ErrorMessage,
            schema = doc.RootElement.Clone(),
        };
    }

    private static JsonElement? ParseJsonOrNull(string? json)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            return null;
        }

        using var doc = JsonDocument.Parse(json);
        return doc.RootElement.Clone();
    }

    public static string[] ToWarningsArray(IList<string>? warnings) =>
        warnings is null || warnings.Count == 0 ? Array.Empty<string>() : warnings.ToArray();

    public static void WriteWarningsToStderr(IEnumerable<string>? warnings)
    {
        if (warnings is null)
        {
            return;
        }

        foreach (var warning in warnings)
        {
            if (!string.IsNullOrWhiteSpace(warning))
            {
                global::System.Console.Error.WriteLine("warning: " + warning);
            }
        }
    }
}
