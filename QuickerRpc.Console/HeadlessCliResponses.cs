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
            updatedSteps = ParseJsonOrNull(response.UpdatedStepsJson),
            addedSteps = ParseJsonOrNull(response.AddedStepsJson),
            updatedVariables = ParseJsonOrNull(response.UpdatedVariablesJson),
            addedVariables = ParseJsonOrNull(response.AddedVariablesJson),
            updatedUtc = response.UpdatedUtc,
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
}
