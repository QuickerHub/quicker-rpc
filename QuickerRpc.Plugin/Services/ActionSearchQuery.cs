using System;

namespace QuickerRpc.Plugin.Services;

/// <summary>
/// Parsed action search query. Supports subprogram reference lookup via <c>uses:</c> / <c>ref:</c> prefixes
/// and install-source filters via <c>source:</c> / <c>installed:</c> / <c>shared:</c> prefixes.
/// </summary>
internal static class ActionSearchQuery
{
    public const int SubProgramReferenceScore = 10_000;
    public const int SourceFilterScore = 100;

    public static bool TryParseSubProgramReference(string? query, out SubProgramReferenceSearch parsed)
    {
        parsed = default;
        var raw = (query ?? string.Empty).Trim();
        if (raw.Length == 0)
        {
            return false;
        }

        if (TryParseSourceFilter(raw, out _, out var withoutSource))
        {
            raw = withoutSource;
            if (raw.Length == 0)
            {
                return false;
            }
        }

        if (TryStripPrefix(raw, "uses-only:", out var dedicatedTarget)
            || TryStripPrefix(raw, "uses:dedicated:", out dedicatedTarget)
            || TryStripPrefix(raw, "ref-only:", out dedicatedTarget))
        {
            if (dedicatedTarget.Length == 0)
            {
                return false;
            }

            parsed = new SubProgramReferenceSearch(dedicatedTarget, dedicatedOnly: true);
            return true;
        }

        if (TryStripPrefix(raw, "uses:", out var target)
            || TryStripPrefix(raw, "ref:", out target)
            || TryStripPrefix(raw, "调用:", out target))
        {
            if (target.Length == 0)
            {
                return false;
            }

            parsed = new SubProgramReferenceSearch(target, dedicatedOnly: false);
            return true;
        }

        return false;
    }

    public static bool TryParseSourceFilter(string? query, out ActionSourceFilter filter, out string keyword)
    {
        filter = default;
        keyword = (query ?? string.Empty).Trim();
        if (keyword.Length == 0)
        {
            return false;
        }

        if (TryParseSharedIdPrefix(keyword, out filter, out keyword))
        {
            return true;
        }

        foreach (var (prefix, kind) in SourcePrefixes)
        {
            if (!TryStripPrefix(keyword, prefix, out var remainder))
            {
                continue;
            }

            filter = new ActionSourceFilter(kind);
            keyword = remainder.Trim();
            return true;
        }

        return false;
    }

    public static bool HasSourceFilterPrefix(string? query) =>
        TryParseSourceFilter(query, out _, out _);

    private static bool TryParseSharedIdPrefix(string raw, out ActionSourceFilter filter, out string keyword)
    {
        filter = default;
        keyword = raw;
        if (!TryStripPrefix(raw, "shared:", out var remainder)
            && !TryStripPrefix(raw, "sharedid:", out remainder))
        {
            return false;
        }

        remainder = remainder.Trim();
        if (remainder.Length == 0)
        {
            return false;
        }

        var spaceIndex = remainder.IndexOf(' ');
        var idPart = spaceIndex >= 0 ? remainder.Substring(0, spaceIndex).Trim() : remainder;
        if (idPart.Length == 0)
        {
            return false;
        }

        filter = new ActionSourceFilter(ActionSourceFilterKind.SharedId, idPart);
        keyword = spaceIndex >= 0 ? remainder.Substring(spaceIndex + 1).Trim() : string.Empty;
        return true;
    }

    private static readonly (string Prefix, ActionSourceFilterKind Kind)[] SourcePrefixes =
    {
        ("source:library", ActionSourceFilterKind.Library),
        ("source:installed", ActionSourceFilterKind.Library),
        ("source:local", ActionSourceFilterKind.Local),
        ("source:published", ActionSourceFilterKind.Published),
        ("installed:", ActionSourceFilterKind.Library),
        ("library:", ActionSourceFilterKind.Library),
        ("local:", ActionSourceFilterKind.Local),
        ("published:", ActionSourceFilterKind.Published),
        ("动作库:", ActionSourceFilterKind.Library),
    };

    private static bool TryStripPrefix(string raw, string prefix, out string remainder)
    {
        if (raw.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
        {
            remainder = raw.Substring(prefix.Length).Trim();
            return true;
        }

        remainder = string.Empty;
        return false;
    }
}

internal readonly struct SubProgramReferenceSearch
{
    public SubProgramReferenceSearch(string subProgramRef, bool dedicatedOnly)
    {
        SubProgramRef = subProgramRef;
        DedicatedOnly = dedicatedOnly;
    }

    public string SubProgramRef { get; }

    public bool DedicatedOnly { get; }
}
