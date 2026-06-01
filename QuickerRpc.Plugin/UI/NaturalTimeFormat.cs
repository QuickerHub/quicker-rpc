using System;
using System.Globalization;

namespace QuickerRpc.Plugin.UI;

internal static class NaturalTimeFormat
{
    public static string FormatUtcIso(string? utcIso)
    {
        if (string.IsNullOrWhiteSpace(utcIso))
        {
            return string.Empty;
        }

        if (!DateTimeOffset.TryParse(
                utcIso,
                CultureInfo.InvariantCulture,
                DateTimeStyles.RoundtripKind,
                out var utc))
        {
            return utcIso;
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
