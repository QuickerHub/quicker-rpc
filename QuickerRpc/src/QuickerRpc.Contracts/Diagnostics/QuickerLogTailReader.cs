using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
using System.Text.RegularExpressions;

namespace QuickerRpc.Diagnostics;

/// <summary>Reads recent error blocks from Quicker's log4net file for agent debugging.</summary>
public static class QuickerLogTailReader
{
    private static readonly Regex LogEntryStart = new(
        @"^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}",
        RegexOptions.Compiled | RegexOptions.CultureInvariant);

    public static string DefaultLogPath =>
        Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "Quicker",
            "logs",
            "quicker.log");

    /// <summary>
    /// Returns the most recent WARN/ERROR block for the given action (title and/or id), including stack lines.
    /// </summary>
    public static string? TryReadActionErrorExcerpt(
        string? actionTitle,
        string? actionId = null,
        string? logPath = null,
        int tailBytes = 512 * 1024)
    {
        var title = NullIfWhiteSpace(actionTitle);
        var id = NullIfWhiteSpace(actionId);
        if (title is null && id is null)
        {
            return null;
        }

        logPath = NullIfWhiteSpace(logPath) ?? DefaultLogPath;
        if (!File.Exists(logPath))
        {
            return null;
        }

        var lines = ReadTailLines(logPath, tailBytes);
        if (lines.Count == 0)
        {
            return null;
        }

        var startIndex = FindLastActionErrorIndex(lines, title, id);
        if (startIndex < 0)
        {
            return null;
        }

        var excerpt = CollectErrorBlock(lines, startIndex);
        return string.IsNullOrWhiteSpace(excerpt) ? null : excerpt.Trim();
    }

    internal static int FindLastActionErrorIndex(IReadOnlyList<string> lines, string? title, string? id)
    {
        for (var i = lines.Count - 1; i >= 0; i--)
        {
            var line = lines[i];
            if (!IsWarnOrErrorLine(line))
            {
                continue;
            }

            if (MatchesAction(line, title, id))
            {
                return i;
            }
        }

        return -1;
    }

    internal static string CollectErrorBlock(IReadOnlyList<string> lines, int startIndex)
    {
        var title = ExtractActionTitle(lines[startIndex]);
        var sb = new StringBuilder();
        sb.AppendLine(lines[startIndex]);

        for (var i = startIndex + 1; i < lines.Count; i++)
        {
            var line = lines[i];
            if (IsNewActionRunStart(line, title))
            {
                break;
            }

            sb.AppendLine(line);
        }

        return sb.ToString();
    }

    private static bool IsNewActionRunStart(string line, string? currentTitle)
    {
        if (!LogEntryStart.IsMatch(line))
        {
            return false;
        }

        if (!line.Contains(" INFO ", StringComparison.Ordinal)
            || !line.Contains("执行动作", StringComparison.Ordinal))
        {
            return false;
        }

        if (currentTitle is null)
        {
            return true;
        }

        return !line.Contains($"[action:{currentTitle}]", StringComparison.Ordinal);
    }

    private static string? ExtractActionTitle(string line)
    {
        const string prefix = "[action:";
        var start = line.IndexOf(prefix, StringComparison.Ordinal);
        if (start < 0)
        {
            return null;
        }

        start += prefix.Length;
        var end = line.IndexOf(']', start);
        if (end <= start)
        {
            return null;
        }

        return line.Substring(start, end - start);
    }

    private static bool MatchesAction(string line, string? title, string? id)
    {
        if (title is not null && line.Contains($"[action:{title}]", StringComparison.Ordinal))
        {
            return true;
        }

        if (id is not null && line.Contains($"id={id}", StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        return false;
    }

    private static bool IsWarnOrErrorLine(string line) =>
        line.Contains(" WARN ", StringComparison.Ordinal)
        || line.Contains(" ERROR ", StringComparison.Ordinal);

    private static List<string> ReadTailLines(string logPath, int tailBytes)
    {
        tailBytes = Math.Max(tailBytes, 16 * 1024);
        using var stream = new FileStream(
            logPath,
            FileMode.Open,
            FileAccess.Read,
            FileShare.ReadWrite);
        var length = stream.Length;
        var readSize = (int)Math.Min(length, tailBytes);
        stream.Seek(-readSize, SeekOrigin.End);
        var buffer = new byte[readSize];
        _ = stream.Read(buffer, 0, readSize);
        var text = Encoding.UTF8.GetString(buffer);
        var lines = text.Split(new[] { "\r\n", "\n" }, StringSplitOptions.None);
        var list = new List<string>(lines.Length);
        foreach (var line in lines)
        {
            if (line.Length > 0)
            {
                list.Add(line);
            }
        }

        return list;
    }

    private static string? NullIfWhiteSpace(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}
