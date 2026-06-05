using System;
using System.Text.RegularExpressions;

namespace QuickerRpc.AgentModel.XAction.Lint;

internal static class ProgramSyntaxCompileMessageParser
{
    private static readonly Regex ParenLineColumn = new(
        @"\(\s*(\d+)\s*,\s*(\d+)\s*\)",
        RegexOptions.Compiled | RegexOptions.CultureInvariant);

    private static readonly Regex LineColumnWords = new(
        @"\bline\s+(\d+)\s*,?\s*column\s+(\d+)\b",
        RegexOptions.Compiled | RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);

    internal static bool TryParseLineColumn(string? message, out int line, out int column)
    {
        line = 0;
        column = 0;
        if (string.IsNullOrWhiteSpace(message))
        {
            return false;
        }

        var m = ParenLineColumn.Match(message);
        if (m.Success
            && int.TryParse(m.Groups[1].Value, out line)
            && int.TryParse(m.Groups[2].Value, out column)
            && line > 0)
        {
            return true;
        }

        m = LineColumnWords.Match(message);
        if (m.Success
            && int.TryParse(m.Groups[1].Value, out line)
            && int.TryParse(m.Groups[2].Value, out column)
            && line > 0)
        {
            return true;
        }

        return false;
    }
}
