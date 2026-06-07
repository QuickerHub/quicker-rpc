using System.Text.Json.Nodes;
using QuickerRpc.Contracts.Rpc;

namespace QuickerRpc.Console;

/// <summary>
/// Composer @-mention search JSON (actions + global subprograms, native scoring).
/// </summary>
internal static class AgentApiMentionSearchJson
{
    public static JsonObject ToMergedPayload(
        QuickerRpcActionSearchResult actions,
        QuickerRpcSubProgramSearchResult subprograms,
        string? query,
        int limit)
    {
        var merged = new List<(int Score, string Title, JsonObject Row)>();

        foreach (var item in actions.Items ?? Array.Empty<QuickerRpcActionSummary>())
        {
            var row = ActionRow(item);
            if (row is null)
            {
                continue;
            }

            merged.Add((item.Score, item.Title ?? string.Empty, row));
        }

        foreach (var item in subprograms.Items ?? Array.Empty<QuickerRpcSubProgramSummary>())
        {
            var row = SubprogramRow(item);
            if (row is null)
            {
                continue;
            }

            merged.Add((item.Score, item.Name ?? string.Empty, row));
        }

        var items = new JsonArray();
        foreach (var row in merged
                     .OrderByDescending(x => x.Score)
                     .ThenBy(x => x.Title, StringComparer.OrdinalIgnoreCase)
                     .Take(Math.Max(1, limit))
                     .Select(x => x.Row))
        {
            items.Add(row);
        }

        var ok = actions.Ok || subprograms.Ok;
        var message = string.Empty;
        if (items.Count == 0)
        {
            message = actions.Message;
            if (string.IsNullOrWhiteSpace(message))
            {
                message = subprograms.Message;
            }

            if (string.IsNullOrWhiteSpace(message))
            {
                message = "No matching actions or subprograms.";
            }
        }

        return new JsonObject
        {
            ["success"] = ok,
            ["errorMessage"] = message,
            ["query"] = query ?? string.Empty,
            ["scope"] = actions.Scope ?? string.Empty,
            ["matchCount"] = items.Count,
            ["items"] = items,
        };
    }

    public static JsonObject ToPayload(QuickerRpcActionSearchResult source, string? query) =>
        ToMergedPayload(
            source,
            new QuickerRpcSubProgramSearchResult { Ok = true, Items = Array.Empty<QuickerRpcSubProgramSummary>() },
            query,
            source.Items?.Count ?? 0);

    private static JsonObject? ActionRow(QuickerRpcActionSummary item)
    {
        var id = (item.Id ?? string.Empty).Trim();
        if (id.Length == 0)
        {
            return null;
        }

        var row = new JsonObject
        {
            ["kind"] = "action",
            ["actionId"] = id,
            ["id"] = id,
            ["title"] = item.Title ?? string.Empty,
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

        if (!string.IsNullOrWhiteSpace(item.Icon))
        {
            row["icon"] = item.Icon.Trim();
        }

        return row;
    }

    private static JsonObject? SubprogramRow(QuickerRpcSubProgramSummary item)
    {
        var id = (item.Id ?? string.Empty).Trim();
        if (id.Length == 0)
        {
            return null;
        }

        var row = new JsonObject
        {
            ["kind"] = "subprogram",
            ["subProgramId"] = id,
            ["id"] = id,
            ["title"] = item.Name ?? string.Empty,
            ["score"] = item.Score,
        };
        if (!string.IsNullOrWhiteSpace(item.Description))
        {
            row["description"] = item.Description;
        }

        if (!string.IsNullOrWhiteSpace(item.CallIdentifier))
        {
            row["callIdentifier"] = item.CallIdentifier;
        }

        if (!string.IsNullOrWhiteSpace(item.Icon))
        {
            row["icon"] = item.Icon.Trim();
        }

        return row;
    }
}
