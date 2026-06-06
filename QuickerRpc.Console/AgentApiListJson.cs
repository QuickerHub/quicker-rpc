using System.Text.Json.Nodes;
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
        foreach (var item in source.Items ?? Array.Empty<QuickerRpcActionSummaryItem>())
        {
            items.Add(new JsonObject
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
            });
        }

        return new JsonObject
        {
            ["success"] = source.Success,
            ["errorMessage"] = source.ErrorMessage ?? string.Empty,
            ["query"] = source.Query ?? string.Empty,
            ["scope"] = source.Scope ?? string.Empty,
            ["sort"] = source.Sort ?? string.Empty,
            ["matchCount"] = source.MatchCount,
            ["items"] = items,
        };
    }
}
