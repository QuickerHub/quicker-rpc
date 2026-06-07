using System.Text.Json.Nodes;
using QuickerRpc.Contracts.Rpc;

namespace QuickerRpc.Console;

/// <summary>
/// Composer @-mention search JSON (native Quicker search box scoring + pinyin).
/// </summary>
internal static class AgentApiMentionSearchJson
{
    public static JsonObject ToPayload(QuickerRpcActionSearchResult source, string? query)
    {
        var items = new JsonArray();
        foreach (var item in source.Items ?? Array.Empty<QuickerRpcActionSummary>())
        {
            var row = new JsonObject
            {
                ["actionId"] = item.Id,
                ["id"] = item.Id,
                ["title"] = item.Title,
                ["score"] = item.Score,
            };
            if (!string.IsNullOrWhiteSpace(item.Description))
            {
                row["description"] = item.Description;
            }

            var profileName = item.ProfileName ?? item.PageTitle;
            if (!string.IsNullOrWhiteSpace(profileName))
            {
                row["profileName"] = profileName;
            }

            if (!string.IsNullOrWhiteSpace(item.ExeFile))
            {
                row["exeFile"] = item.ExeFile;
            }

            items.Add(row);
        }

        return new JsonObject
        {
            ["success"] = source.Ok,
            ["errorMessage"] = source.Message ?? string.Empty,
            ["query"] = query ?? string.Empty,
            ["scope"] = source.Scope ?? string.Empty,
            ["matchCount"] = items.Count,
            ["items"] = items,
        };
    }
}
