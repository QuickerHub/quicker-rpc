using QuickerRpc.AgentModel.LocalTime;

namespace QuickerRpc.Plugin.UI;

internal static class NaturalTimeFormat
{
    public static string FormatUtcIso(string? utcIso) => LocalTimeDisplay.FormatUtcIso(utcIso);
}
