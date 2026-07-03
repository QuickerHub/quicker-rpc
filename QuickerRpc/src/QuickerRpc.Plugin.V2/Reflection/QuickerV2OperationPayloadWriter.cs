using System.Reflection;
using Newtonsoft.Json;

namespace QuickerRpc.Plugin.V2.Reflection;

/// <summary>
/// Writes XAction JSON onto <see cref="QuickerV2TypeNames.ActionItem2"/> via <c>XActionDto</c>.
/// V2 <c>OperationPayload</c> is <c>IOperationPayload</c>, not a raw string (unlike V1 <c>Data</c>).
/// </summary>
internal static class QuickerV2OperationPayloadWriter
{
    private const string DefaultXActionOperationType = "xaction";

    public static bool TrySetXActionPayloadJson(object action, string payloadJson, out string? error)
    {
        error = null;
        if (string.IsNullOrWhiteSpace(payloadJson))
        {
            error = "payloadJson is required.";
            return false;
        }

        var dtoType = QuickerV2Runtime.ResolveType(QuickerV2TypeNames.XActionDto);
        if (dtoType is null)
        {
            error = $"Type not found: {QuickerV2TypeNames.XActionDto}";
            return false;
        }

        object? dto;
        try
        {
            dto = JsonConvert.DeserializeObject(payloadJson, dtoType);
        }
        catch (Exception ex)
        {
            error = "XActionDto deserialize failed: " + ex.Message;
            return false;
        }

        if (dto is null)
        {
            error = "XActionDto deserialize returned null.";
            return false;
        }

        if (!TryResolveXActionOperationType(out var operationType))
        {
            operationType = DefaultXActionOperationType;
        }

        try
        {
            QuickerV2Reflection.WriteMember(action, "OperationType", operationType);
            QuickerV2Reflection.WriteMember(action, "OperationPayload", dto);
            return true;
        }
        catch (Exception ex)
        {
            error = ex.InnerException?.Message ?? ex.Message;
            return false;
        }
    }

    private static bool TryResolveXActionOperationType(out string operationType)
    {
        operationType = DefaultXActionOperationType;
        var opTypes = QuickerV2Runtime.ResolveType(QuickerV2TypeNames.OperationTypes);
        if (opTypes is null)
        {
            return false;
        }

        var field = opTypes.GetField(
            "XACTION",
            BindingFlags.Public | BindingFlags.Static | BindingFlags.IgnoreCase);
        if (field?.GetValue(null) is string value && value.Length > 0)
        {
            operationType = value;
            return true;
        }

        return false;
    }
}
