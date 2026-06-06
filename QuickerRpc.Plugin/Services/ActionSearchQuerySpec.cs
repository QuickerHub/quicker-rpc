using System;
using System.Text.Json;

namespace QuickerRpc.Plugin.Services;

/// <summary>
/// Parsed action list/search query. Plain text keeps legacy behavior; JSON enables script filter/sorter.
/// </summary>
internal sealed class ActionSearchQuerySpec
{
    public string? Keyword { get; set; }

    public string? FilterScript { get; set; }

    public string? SorterScript { get; set; }

    public bool SortDescending { get; set; }

    public ActionSourceFilter? SourceFilter { get; set; }

    public SubProgramReferenceSearch? SubProgramSearch { get; set; }

    public bool IsJsonQuery { get; set; }

    public bool IsEmpty =>
        string.IsNullOrWhiteSpace(Keyword)
        && string.IsNullOrWhiteSpace(FilterScript)
        && string.IsNullOrWhiteSpace(SorterScript)
        && SourceFilter is null
        && SubProgramSearch is null;

    public bool HasFilterScript => !string.IsNullOrWhiteSpace(FilterScript);

    public bool HasSorterScript => !string.IsNullOrWhiteSpace(SorterScript);

    public bool UsesScript => HasFilterScript || HasSorterScript;

    public bool ApplyXActionCatalogFilter =>
        !UsesScript
        && SourceFilter is null
        && SubProgramSearch is null
        && !string.IsNullOrWhiteSpace(Keyword);

    public static bool TryParse(string? raw, out ActionSearchQuerySpec spec, out string? error)
    {
        spec = new ActionSearchQuerySpec();
        error = null;
        var text = (raw ?? string.Empty).Trim();
        if (text.Length == 0)
        {
            return true;
        }

        if (text.StartsWith("{", StringComparison.Ordinal))
        {
            if (!text.EndsWith("}", StringComparison.Ordinal))
            {
                error = "Invalid JSON query: unclosed object.";
                return false;
            }

            return TryParseJson(text, spec, out error);
        }

        return TryParseLegacy(text, spec, out error);
    }

    private static bool TryParseLegacy(string text, ActionSearchQuerySpec spec, out string? error)
    {
        error = null;
        if (ActionSearchQuery.TryParseSourceFilter(text, out var sourceFilter, out var keyword))
        {
            spec.SourceFilter = sourceFilter;
            spec.Keyword = string.IsNullOrWhiteSpace(keyword) ? null : keyword;
            return true;
        }

        if (ActionSearchQuery.TryParseSubProgramReference(text, out var subProgramSearch))
        {
            spec.SubProgramSearch = subProgramSearch;
            return true;
        }

        spec.Keyword = text;
        return true;
    }

    private static bool TryParseJson(string json, ActionSearchQuerySpec spec, out string? error)
    {
        error = null;
        spec.IsJsonQuery = true;
        try
        {
            using var doc = JsonDocument.Parse(json);
            if (doc.RootElement.ValueKind != JsonValueKind.Object)
            {
                error = "Query JSON must be an object.";
                return false;
            }

            var root = doc.RootElement;
            spec.Keyword = ReadOptionalString(root, "keyword", "q", "text");
            spec.FilterScript = ReadScript(root, "filter");
            spec.SorterScript = ReadScript(root, "sorter", "sort");
            spec.SortDescending = ReadOptionalBool(root, "desc", "sortDesc", "descending") ?? false;

            if (TryReadSourceFilter(root, out var sourceFilter))
            {
                spec.SourceFilter = sourceFilter;
            }

            if (TryReadSubProgramSearch(root, out var subProgramSearch))
            {
                spec.SubProgramSearch = subProgramSearch;
            }

            return true;
        }
        catch (JsonException ex)
        {
            error = ex.Message;
            return false;
        }
    }

    private static bool TryReadSourceFilter(JsonElement root, out ActionSourceFilter filter)
    {
        filter = default;
        var source = ReadOptionalString(root, "source", "filterSource");
        if (string.IsNullOrWhiteSpace(source))
        {
            return false;
        }

        var sharedId = ReadOptionalString(root, "sharedId", "sharedActionId", "templateId");
        switch (source.Trim().ToLowerInvariant())
        {
            case "library":
            case "installed":
                filter = new ActionSourceFilter(ActionSourceFilterKind.Library);
                return true;
            case "local":
                filter = new ActionSourceFilter(ActionSourceFilterKind.Local);
                return true;
            case "published":
            case "shared":
                filter = new ActionSourceFilter(ActionSourceFilterKind.Published);
                return true;
            case "sharedid":
            case "id":
                if (string.IsNullOrWhiteSpace(sharedId))
                {
                    return false;
                }

                filter = new ActionSourceFilter(ActionSourceFilterKind.SharedId, sharedId.Trim());
                return true;
            default:
                return false;
        }
    }

    private static bool TryReadSubProgramSearch(JsonElement root, out SubProgramReferenceSearch search)
    {
        search = default;
        var uses = ReadOptionalString(root, "uses", "ref", "subProgram");
        if (string.IsNullOrWhiteSpace(uses))
        {
            return false;
        }

        var dedicatedOnly = ReadOptionalBool(root, "usesOnly", "uses-only", "dedicatedOnly", "refOnly") ?? false;
        search = new SubProgramReferenceSearch(uses.Trim(), dedicatedOnly);
        return true;
    }

    private static string? ReadScript(JsonElement root, params string[] names)
    {
        foreach (var name in names)
        {
            if (!root.TryGetProperty(name, out var value))
            {
                continue;
            }

            switch (value.ValueKind)
            {
                case JsonValueKind.String:
                    return value.GetString();
                case JsonValueKind.Object when value.TryGetProperty("script", out var script):
                    return script.GetString();
                case JsonValueKind.Object when value.TryGetProperty("expr", out var expr):
                    return expr.GetString();
            }
        }

        return null;
    }

    private static string? ReadOptionalString(JsonElement root, params string[] names)
    {
        foreach (var name in names)
        {
            if (root.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.String)
            {
                var text = value.GetString();
                if (!string.IsNullOrWhiteSpace(text))
                {
                    return text.Trim();
                }
            }
        }

        return null;
    }

    private static bool? ReadOptionalBool(JsonElement root, params string[] names)
    {
        foreach (var name in names)
        {
            if (!root.TryGetProperty(name, out var value))
            {
                continue;
            }

            switch (value.ValueKind)
            {
                case JsonValueKind.True:
                    return true;
                case JsonValueKind.False:
                    return false;
                case JsonValueKind.String when bool.TryParse(value.GetString(), out var parsed):
                    return parsed;
            }
        }

        return null;
    }
}
