using System.Text.Json.Nodes;
using System.Linq;
using QuickerRpc.AgentModel.LocalTime;
using QuickerRpc.Contracts.Rpc;

namespace QuickerRpc.Console;

/// <summary>
/// action list JSON without loading Google.Protobuf at runtime (portable qkrpc installs).
/// </summary>
internal static class AgentApiListJson
{
    public static JsonObject ToPayload(QuickerRpcSearchActionSummariesResult source)
    {
        var items = new JsonArray();
        var projectedFields = ResolveProjectedFields(source);
        foreach (var item in source.Items ?? Array.Empty<QuickerRpcActionSummaryItem>())
        {
            items.Add(projectedFields is null
                ? BuildFullItem(item)
                : BuildProjectedItem(item, projectedFields));
        }

        var payload = new JsonObject
        {
            ["success"] = source.Success,
            ["errorMessage"] = source.ErrorMessage ?? string.Empty,
            ["query"] = source.Query ?? string.Empty,
            ["scope"] = source.Scope ?? string.Empty,
            ["sort"] = source.Sort ?? string.Empty,
            ["matchCount"] = source.MatchCount,
            ["items"] = items,
        };

        if (projectedFields is not null)
        {
            payload["fields"] = new JsonArray(projectedFields.Select(field => JsonValue.Create(field)).ToArray());
        }

        return payload;
    }

    private static IReadOnlyList<string>? ResolveProjectedFields(QuickerRpcSearchActionSummariesResult source)
    {
        if (source.Fields is not { Count: > 0 } fields)
        {
            return null;
        }

        return ActionSummaryFieldCatalog.TryNormalize(fields, out var normalized, out _)
            ? normalized
            : (IReadOnlyList<string>)fields;
    }

    private static JsonObject BuildFullItem(QuickerRpcActionSummaryItem item) =>
        new()
        {
            ["actionId"] = item.ActionId ?? string.Empty,
            ["title"] = item.Title ?? string.Empty,
            ["description"] = item.Description ?? string.Empty,
            ["icon"] = item.Icon ?? string.Empty,
            ["profileId"] = item.ProfileId ?? string.Empty,
            ["profileName"] = item.ProfileName ?? string.Empty,
            ["exeFile"] = item.ExeFile ?? string.Empty,
            ["lastEditTimeUtc"] = item.LastEditTimeUtc ?? string.Empty,
            ["lastEditTimeLocal"] = string.IsNullOrWhiteSpace(item.LastEditTimeLocal)
                ? LocalTimeDisplay.FormatUtcIso(item.LastEditTimeUtc)
                : item.LastEditTimeLocal,
            ["templateId"] = item.TemplateId ?? string.Empty,
            ["sharedActionId"] = item.SharedActionId ?? string.Empty,
            ["source"] = item.Source ?? string.Empty,
            ["score"] = item.Score,
        };

    private static JsonObject BuildProjectedItem(
        QuickerRpcActionSummaryItem item,
        IReadOnlyList<string> fields)
    {
        var row = new JsonObject();
        foreach (var entry in ActionSummaryFieldCatalog.ProjectItem(item, fields))
        {
            row[entry.Key] = entry.Value ?? string.Empty;
        }

        return row;
    }
}
