using System;

namespace QuickerRpc.Plugin.Services;

/// <summary>
/// Parsed action search query. Supports subprogram reference lookup via <c>uses:</c> / <c>ref:</c> prefixes.
/// </summary>
internal static class ActionSearchQuery
{
    public const int SubProgramReferenceScore = 10_000;

    public static bool TryParseSubProgramReference(string? query, out SubProgramReferenceSearch parsed)
    {
        parsed = default;
        var raw = (query ?? string.Empty).Trim();
        if (raw.Length == 0)
        {
            return false;
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
