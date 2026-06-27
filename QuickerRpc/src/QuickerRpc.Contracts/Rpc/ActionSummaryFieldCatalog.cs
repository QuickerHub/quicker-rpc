using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;

namespace QuickerRpc.Contracts.Rpc;

/// <summary>Canonical action list field names, aliases, and projection for JSON/TSV output.</summary>
public static class ActionSummaryFieldCatalog
{
    public static readonly IReadOnlyList<string> AllFields = new[]
    {
        "actionId",
        "title",
        "description",
        "icon",
        "lastEditTimeUtc",
        "lastEditTimeLocal",
        "profileId",
        "profileName",
        "exeFile",
        "templateId",
        "sharedActionId",
        "source",
        "score",
    };

    private static readonly Dictionary<string, string> Aliases = new(StringComparer.OrdinalIgnoreCase)
    {
        ["id"] = "actionId",
        ["actionid"] = "actionId",
        ["name"] = "title",
        ["desc"] = "description",
        ["lastedit"] = "lastEditTimeLocal",
        ["lasteditutc"] = "lastEditTimeUtc",
        ["lasteditlocal"] = "lastEditTimeLocal",
        ["pagetitle"] = "profileName",
        ["page"] = "profileName",
        ["profile"] = "profileName",
        ["exe"] = "exeFile",
        ["sharedid"] = "sharedActionId",
        ["sharedactionid"] = "sharedActionId",
        ["template"] = "templateId",
        ["relevance"] = "score",
    };

    private static readonly Dictionary<string, Func<QuickerRpcActionSummaryItem, string?>> Getters =
        new(StringComparer.Ordinal)
        {
            ["actionId"] = item => item.ActionId,
            ["title"] = item => item.Title,
            ["description"] = item => item.Description,
            ["icon"] = item => item.Icon,
            ["lastEditTimeUtc"] = item => item.LastEditTimeUtc,
            ["lastEditTimeLocal"] = item => item.LastEditTimeLocal,
            ["profileId"] = item => item.ProfileId,
            ["profileName"] = item => item.ProfileName,
            ["exeFile"] = item => item.ExeFile,
            ["templateId"] = item => item.TemplateId,
            ["sharedActionId"] = item => item.SharedActionId,
            ["source"] = item => item.Source,
            ["score"] = item => item.Score?.ToString(),
        };

    public static readonly IReadOnlyList<string> DefaultTerminalFields = new[]
    {
        "actionId",
        "title",
        "profileName",
        "exeFile",
        "lastEditTimeLocal",
        "source",
    };

    public static bool TryNormalize(
        IEnumerable<string>? requested,
        out IReadOnlyList<string> normalized,
        out string? error)
    {
        normalized = Array.Empty<string>();
        error = null;
        if (requested is null)
        {
            return true;
        }

        var list = requested
            .Select(x => (x ?? string.Empty).Trim())
            .Where(x => x.Length > 0)
            .ToList();
        if (list.Count == 0)
        {
            return true;
        }

        if (list.Count == 1 && IsAllToken(list[0]))
        {
            normalized = AllFields;
            return true;
        }

        var seen = new HashSet<string>(StringComparer.Ordinal);
        var output = new List<string>(list.Count);
        foreach (var raw in list)
        {
            if (IsAllToken(raw))
            {
                error = "Use \"*\" or \"all\" alone; do not mix with other field names.";
                return false;
            }

            var canonical = ResolveCanonical(raw);
            if (canonical is null)
            {
                error =
                    $"Unknown field \"{raw}\". Supported: {string.Join(", ", AllFields)} "
                    + $"(aliases: id, pageTitle, exe, sharedId, lastEdit, score, …).";
                return false;
            }

            if (seen.Add(canonical))
            {
                output.Add(canonical);
            }
        }

        normalized = output;
        return true;
    }

    public static bool TryParseCsv(string? csv, out IReadOnlyList<string> parsed, out string? error)
    {
        parsed = Array.Empty<string>();
        error = null;
        if (string.IsNullOrWhiteSpace(csv))
        {
            return true;
        }

        var parts = csv.Split(new[] { ',' }, StringSplitOptions.RemoveEmptyEntries);
        var trimmed = parts.Select(part => part.Trim()).Where(part => part.Length > 0).ToArray();
        return TryNormalize(trimmed, out parsed, out error);
    }

    public static Dictionary<string, string?> ProjectItem(
        QuickerRpcActionSummaryItem item,
        IReadOnlyList<string> fields)
    {
        var row = new Dictionary<string, string?>(fields.Count, StringComparer.Ordinal);
        foreach (var field in fields)
        {
            row[field] = GetValue(item, field);
        }

        return row;
    }

    public static string FormatTsvHeader(IReadOnlyList<string> fields) =>
        string.Join("\t", fields);

    public static string FormatTsvLine(QuickerRpcActionSummaryItem item, IReadOnlyList<string> fields) =>
        string.Join("\t", fields.Select(field => EscapeTsv(GetValue(item, field) ?? string.Empty)));

    private static string? GetValue(QuickerRpcActionSummaryItem item, string canonicalField) =>
        Getters.TryGetValue(canonicalField, out var getter) ? getter(item) : null;

    private static string? ResolveCanonical(string raw)
    {
        if (Getters.ContainsKey(raw))
        {
            return raw;
        }

        return Aliases.TryGetValue(raw, out var mapped) ? mapped : null;
    }

    private static bool IsAllToken(string value) =>
        value.Equals("*", StringComparison.Ordinal)
        || value.Equals("all", StringComparison.OrdinalIgnoreCase);

    private static string EscapeTsv(string value)
    {
        if (value.IndexOfAny(new[] { '\t', '\r', '\n', '"' }) < 0)
        {
            return value;
        }

        return "\"" + value.Replace("\"", "\"\"") + "\"";
    }
}
