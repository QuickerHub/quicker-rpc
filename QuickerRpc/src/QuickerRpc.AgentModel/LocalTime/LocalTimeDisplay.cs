using System;
using System.Globalization;
using System.Text.RegularExpressions;

namespace QuickerRpc.AgentModel.LocalTime;

/// <summary>Formats UTC ISO timestamps for display in the user's local timezone.</summary>
public static class LocalTimeDisplay
{
    private static readonly Regex OffsetSuffix = new(
        @"[+-]\d{2}:\d{2}(:\d{2})?$",
        RegexOptions.CultureInvariant | RegexOptions.Compiled);

    /// <summary>Ensure ambiguous ISO datetimes (no offset) are treated as UTC.</summary>
    public static string NormalizeUtcIso(string? utcIso)
    {
        if (string.IsNullOrWhiteSpace(utcIso))
        {
            return string.Empty;
        }

        var trimmed = utcIso.Trim();
        if (trimmed.EndsWith("Z", StringComparison.OrdinalIgnoreCase))
        {
            return trimmed;
        }

        if (OffsetSuffix.IsMatch(trimmed))
        {
            return trimmed;
        }

        return trimmed + "Z";
    }

    public static bool TryParseUtc(string? utcIso, out DateTimeOffset utc)
    {
        utc = default;
        if (string.IsNullOrWhiteSpace(utcIso))
        {
            return false;
        }

        var normalized = NormalizeUtcIso(utcIso);
        return DateTimeOffset.TryParse(
            normalized,
            CultureInfo.InvariantCulture,
            DateTimeStyles.RoundtripKind,
            out utc);
    }

    public static string FormatUtcIso(string? utcIso)
    {
        if (!TryParseUtc(utcIso, out var utc))
        {
            return utcIso ?? string.Empty;
        }

        var local = utc.ToLocalTime();
        var now = DateTimeOffset.Now;
        var localDate = local.Date;
        var today = now.Date;

        if (localDate == today)
        {
            return $"今天 {local:HH:mm}";
        }

        if (localDate == today.AddDays(-1))
        {
            return $"昨天 {local:HH:mm}";
        }

        if (local.Year == now.Year)
        {
            return local.ToString("M月d日 HH:mm", CultureInfo.CurrentCulture);
        }

        return local.ToString("yyyy-MM-dd HH:mm", CultureInfo.CurrentCulture);
    }
}
