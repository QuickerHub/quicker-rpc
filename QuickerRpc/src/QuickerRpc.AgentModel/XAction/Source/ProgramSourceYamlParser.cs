// Ported from Quicker Quicker.Ai.Workspace, revision 574556d76b0b10bd9a8a7951277435649650fab8.
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text;
using Newtonsoft.Json.Linq;

namespace QuickerRpc.AgentModel.XAction.Source;

/// <summary>
/// Restricted YAML 1.2 parser for S0 program source.
/// Accepts literal and folded block scalars. Rejects anchors, aliases, and merge keys.
/// </summary>
public static class ProgramSourceYamlParser
{
    public static JToken Parse(string text)
    {
        var normalized = CawCanonicalizer.NormalizeNewlines(text ?? string.Empty);
        if (normalized.IndexOf('\0') >= 0)
        {
            throw new ProgramSourceException(ProgramSourceCodes.YamlParseError, "NUL in YAML.");
        }

        // Fast reject for alias / merge / anchor forms that break bijection.
        // Skip lines inside | / > block scalar content (those may start with *).
        RejectForbiddenYamlForms(normalized.Split('\n'));

        var lines = normalized.Split('\n');
        var index = 0;
        SkipBlank(lines, ref index);
        if (index >= lines.Length)
        {
            return new JObject();
        }

        var result = ParseNode(lines, ref index, minIndent: 0);
        SkipBlank(lines, ref index);
        if (index < lines.Length && !string.IsNullOrWhiteSpace(StripComment(lines[index])))
        {
            throw new ProgramSourceException(
                ProgramSourceCodes.YamlParseError,
                $"Unexpected trailing content at line {index + 1}.");
        }

        return result;
    }

    private static void RejectForbiddenYamlForms(string[] lines)
    {
        var inBlock = false;
        var blockContentIndent = 0;

        foreach (var rawLine in lines)
        {
            var line = StripComment(rawLine);
            if (string.IsNullOrWhiteSpace(line))
            {
                continue;
            }

            var indent = GetIndent(line);
            var trimmed = line.TrimStart();

            if (inBlock)
            {
                if (indent >= blockContentIndent)
                {
                    continue;
                }

                inBlock = false;
            }

            if (TryOpenBlockScalar(trimmed, indent, out blockContentIndent))
            {
                inBlock = true;
                continue;
            }

            if (HasMergeKeyToken(trimmed)
                || trimmed.StartsWith('*')
                || HasAliasToken(trimmed)
                || HasAnchorToken(trimmed))
            {
                throw new ProgramSourceException(
                    ProgramSourceCodes.YamlAliasForbidden,
                    "YAML anchors/aliases/merge keys are forbidden.");
            }
        }
    }

    private static bool TryOpenBlockScalar(string trimmed, int lineIndent, out int contentIndent)
    {
        contentIndent = 0;
        static bool IsBlockScalarHeader(string s) =>
            s is "|" or "|-" or "|+" or ">" or ">-" or ">+";

        if (IsBlockScalarHeader(trimmed))
        {
            contentIndent = lineIndent + 2;
            return true;
        }

        if (trimmed.StartsWith("- ", StringComparison.Ordinal) || trimmed == "-")
        {
            var afterDash = trimmed.Length <= 1 ? string.Empty : trimmed.Substring(1).TrimStart();
            if (IsBlockScalarHeader(afterDash))
            {
                contentIndent = lineIndent + 2;
                return true;
            }

            if (TryParseInlineKeyValue(afterDash, out _, out var rest)
                && IsBlockScalarHeader(rest.Trim()))
            {
                contentIndent = lineIndent + 2;
                return true;
            }

            return false;
        }

        if (TryParseInlineKeyValue(trimmed, out _, out var mapRest)
            && IsBlockScalarHeader(mapRest.Trim()))
        {
            contentIndent = lineIndent + 2;
            return true;
        }

        return false;
    }

    /// <summary>Detect YAML merge key <c>&lt;&lt;:</c> outside quotes (not the literal text).</summary>
    private static bool HasMergeKeyToken(string trimmed)
    {
        for (var i = 0; i < trimmed.Length - 2; i++)
        {
            if (trimmed[i] != '<' || trimmed[i + 1] != '<' || trimmed[i + 2] != ':')
            {
                continue;
            }

            if (IsInsideQuotes(trimmed, i))
            {
                continue;
            }

            // Merge key at mapping position: start or after whitespace / list dash.
            if (i == 0)
            {
                return true;
            }

            var prev = trimmed[i - 1];
            if (char.IsWhiteSpace(prev) || prev is '-' or '{' or ',')
            {
                return true;
            }
        }

        return false;
    }

    private static bool HasAliasToken(string trimmed)
    {
        // Alias is a whole YAML scalar (*name), not a mid-string "*word".
        return ScalarValueStartsWithForbidden(trimmed, '*');
    }

    private static bool HasAnchorToken(string trimmed)
    {
        return ScalarValueStartsWithForbidden(trimmed, '&');
    }

    private static bool ScalarValueStartsWithForbidden(string trimmed, char marker)
    {
        static bool IsForbiddenScalar(string value, char m)
        {
            if (value.Length < 2 || value[0] != m)
            {
                return false;
            }

            return char.IsLetterOrDigit(value[1]) || value[1] == '_';
        }

        if (TryParseInlineKeyValue(trimmed, out _, out var rest))
        {
            return IsForbiddenScalar(rest.TrimStart(), marker);
        }

        if (trimmed.StartsWith("- ", StringComparison.Ordinal) || trimmed == "-")
        {
            var afterDash = trimmed.Length <= 1 ? string.Empty : trimmed.Substring(1).TrimStart();
            if (TryParseInlineKeyValue(afterDash, out _, out var nestedRest))
            {
                return IsForbiddenScalar(nestedRest.TrimStart(), marker);
            }

            return IsForbiddenScalar(afterDash, marker);
        }

        return IsForbiddenScalar(trimmed, marker);
    }

    private static bool IsInsideQuotes(string s, int index)
    {
        var inSingle = false;
        var inDouble = false;
        for (var i = 0; i < index; i++)
        {
            var ch = s[i];
            if (ch == '\\' && inDouble)
            {
                i++;
                continue;
            }

            if (ch == '\'' && !inDouble)
            {
                inSingle = !inSingle;
            }
            else if (ch == '"' && !inSingle)
            {
                inDouble = !inDouble;
            }
        }

        return inSingle || inDouble;
    }

    private static JToken ParseNode(string[] lines, ref int index, int minIndent)
    {
        SkipBlank(lines, ref index);
        if (index >= lines.Length)
        {
            return JValue.CreateNull();
        }

        var line = StripComment(lines[index]);
        var indent = GetIndent(line);
        if (indent < minIndent)
        {
            return JValue.CreateNull();
        }

        var trimmed = line.TrimStart();
        if (trimmed.StartsWith("- ", StringComparison.Ordinal) || trimmed == "-")
        {
            return ParseSequence(lines, ref index, indent);
        }

        return ParseMapping(lines, ref index, indent);
    }

    private static JArray ParseSequence(string[] lines, ref int index, int seqIndent)
    {
        var array = new JArray();
        while (index < lines.Length)
        {
            SkipBlank(lines, ref index);
            if (index >= lines.Length)
            {
                break;
            }

            var line = StripComment(lines[index]);
            if (string.IsNullOrWhiteSpace(line))
            {
                index++;
                continue;
            }

            var indent = GetIndent(line);
            if (indent < seqIndent)
            {
                break;
            }

            if (indent > seqIndent)
            {
                throw new ProgramSourceException(
                    ProgramSourceCodes.YamlParseError,
                    $"Bad sequence indent at line {index + 1}.");
            }

            var trimmed = line.TrimStart();
            if (!trimmed.StartsWith('-'))
            {
                break;
            }

            var sourceLineNumber = index + 1;
            var sourceLineText = lines[index];
            var afterDash = trimmed.Length == 1 ? string.Empty : trimmed.Substring(1).TrimStart();
            index++;

            if (string.IsNullOrEmpty(afterDash))
            {
                // Nested block under this item.
                var nested = ParseNode(lines, ref index, seqIndent + 1);
                ProgramSourceLocations.AnnotateIfAbsent(nested, sourceLineNumber, sourceLineText);
                array.Add(nested);
                continue;
            }

            if (TryParseInlineKeyValue(afterDash, out var key, out var rest))
            {
                var obj = new JObject();
                ProgramSourceLocations.Annotate(obj, sourceLineNumber, sourceLineText);
                obj[key] = ParseValueOrNested(
                    lines,
                    ref index,
                    rest,
                    seqIndent + 2,
                    sourceLineText,
                    sourceLineNumber);
                // Additional keys at indent > seqIndent (typically seqIndent+2 for "- key:" style,
                // or seqIndent+1 when written as "  key:" under "- ").
                while (index < lines.Length)
                {
                    SkipBlank(lines, ref index);
                    if (index >= lines.Length)
                    {
                        break;
                    }

                    var next = StripComment(lines[index]);
                    if (string.IsNullOrWhiteSpace(next))
                    {
                        index++;
                        continue;
                    }

                    var nextIndent = GetIndent(next);
                    if (nextIndent <= seqIndent)
                    {
                        break;
                    }

                    var nextTrim = next.TrimStart();
                    if (nextTrim.StartsWith('-'))
                    {
                        break;
                    }

                    if (!TryParseInlineKeyValue(nextTrim, out var moreKey, out var moreRest))
                    {
                        throw new ProgramSourceException(
                            ProgramSourceCodes.YamlParseError,
                            $"Expected mapping key at line {index + 1}.");
                    }

                    index++;
                    if (obj.ContainsKey(moreKey))
                    {
                        throw new ProgramSourceException(
                            ProgramSourceCodes.YamlParseError,
                            $"Duplicate mapping key '{moreKey}' at line {index}.");
                    }

                    obj[moreKey] = ParseValueOrNested(
                        lines,
                        ref index,
                        moreRest,
                        nextIndent + 2,
                        lines[index - 1],
                        index);
                }

                array.Add(obj);
            }
            else
            {
                var scalar = ParseScalar(afterDash);
                var dashWidth = trimmed.StartsWith("- ", StringComparison.Ordinal) ? 2 : 1;
                ProgramSourceLocations.Annotate(
                    scalar,
                    sourceLineNumber,
                    sourceLineText,
                    indent + dashWidth + 1);
                array.Add(scalar);
            }
        }

        return array;
    }

    private static JObject ParseMapping(string[] lines, ref int index, int mapIndent)
    {
        var obj = new JObject();
        var annotated = false;
        while (index < lines.Length)
        {
            SkipBlank(lines, ref index);
            if (index >= lines.Length)
            {
                break;
            }

            var line = StripComment(lines[index]);
            if (string.IsNullOrWhiteSpace(line))
            {
                index++;
                continue;
            }

            var indent = GetIndent(line);
            if (indent < mapIndent)
            {
                break;
            }

            if (indent > mapIndent)
            {
                throw new ProgramSourceException(
                    ProgramSourceCodes.YamlParseError,
                    $"Bad mapping indent at line {index + 1}.");
            }

            var trimmed = line.TrimStart();
            if (trimmed.StartsWith('-'))
            {
                break;
            }

            if (!TryParseInlineKeyValue(trimmed, out var key, out var rest))
            {
                throw new ProgramSourceException(
                    ProgramSourceCodes.YamlParseError,
                    $"Expected key: value at line {index + 1}.");
            }

            if (!annotated)
            {
                ProgramSourceLocations.Annotate(obj, index + 1, lines[index]);
                annotated = true;
            }

            index++;
            if (obj.ContainsKey(key))
            {
                throw new ProgramSourceException(
                    ProgramSourceCodes.YamlParseError,
                    $"Duplicate mapping key '{key}' at line {index}.");
            }

            obj[key] = ParseValueOrNested(
                lines,
                ref index,
                rest,
                mapIndent + 2,
                lines[index - 1],
                index);
        }

        return obj;
    }

    private static JToken ParseValueOrNested(
        string[] lines,
        ref int index,
        string rest,
        int childIndent,
        string keyRawLine,
        int keyLineNumber)
    {
        if (string.IsNullOrWhiteSpace(rest))
        {
            SkipBlank(lines, ref index);
            if (index >= lines.Length)
            {
                return JValue.CreateNull();
            }

            var peek = StripComment(lines[index]);
            var peekIndent = GetIndent(peek);
            if (peekIndent < childIndent && !string.IsNullOrWhiteSpace(peek))
            {
                // Empty value
                return JValue.CreateNull();
            }

            return ParseNode(lines, ref index, childIndent);
        }

        var trimmed = rest.Trim();
        if (trimmed is ">" or ">-" or ">+" or "|" or "|-" or "|+")
        {
            return ParseBlockScalar(lines, ref index, childIndent, trimmed);
        }

        if (trimmed is "{}" or "[]")
        {
            return trimmed == "{}" ? new JObject() : new JArray();
        }

        if (trimmed.StartsWith('{') || trimmed.StartsWith('['))
        {
            throw new ProgramSourceException(
                ProgramSourceCodes.YamlParseError,
                "Non-empty flow collections are not supported; use block style.");
        }

        var scalar = ParseScalar(trimmed);
        ProgramSourceLocations.Annotate(
            scalar,
            keyLineNumber,
            keyRawLine,
            FindValueColumn(keyRawLine, rest));
        return scalar;
    }

    private static JToken ParseBlockScalar(string[] lines, ref int index, int minContentIndent, string header)
    {
        // YAML 1.2: indentation is taken from the first non-empty content line
        // (must be >= the structural minimum from the parent key / list item).
        var contentIndent = -1;
        var firstContentLine = 0;
        var firstContentColumn = 0;
        var contentLines = new List<string>();
        while (index < lines.Length)
        {
            var raw = lines[index];
            if (string.IsNullOrEmpty(raw))
            {
                // Empty lines are block content (including leading blanks). Split('\n')
                // on a trailing document newline adds one empty EOF sentinel — keep any
                // earlier empties so |+ / >+ can preserve extra trailing breaks.
                if (OnlyTrailingEmptyLinesRemain(lines, index))
                {
                    var keep = lines.Length - index - 1;
                    for (var i = 0; i < keep; i++)
                    {
                        contentLines.Add(string.Empty);
                    }

                    index = lines.Length;
                    break;
                }

                contentLines.Add(string.Empty);
                index++;
                continue;
            }

            var indent = GetIndent(raw);
            if (contentIndent < 0)
            {
                if (string.IsNullOrWhiteSpace(raw))
                {
                    contentLines.Add(string.Empty);
                    index++;
                    continue;
                }

                if (indent < minContentIndent)
                {
                    break;
                }

                contentIndent = indent;
                firstContentLine = index + 1;
                firstContentColumn = contentIndent + 1;
            }
            else if (indent < contentIndent && raw.Trim().Length > 0)
            {
                break;
            }

            // Use physical indent: if line has only spaces less than contentIndent, treat as blank.
            if (GetIndent(raw) < contentIndent && string.IsNullOrWhiteSpace(raw))
            {
                contentLines.Add(string.Empty);
                index++;
                continue;
            }

            var content = raw.Length <= contentIndent ? string.Empty : raw.Substring(contentIndent);
            contentLines.Add(content);
            index++;
        }

        var text = header.StartsWith('>')
            ? FoldBlockScalarLines(contentLines)
            : JoinLiteralBlockLines(contentLines);
        if (header.Contains('-', StringComparison.Ordinal))
        {
            // Strip final newline(s) chomping.
            text = text.TrimEnd('\n');
        }
        else if (header.Contains('+', StringComparison.Ordinal))
        {
            // keep all
        }
        else
        {
            // Clip: keep single trailing newline
            text = text.TrimEnd('\n') + "\n";
        }

        JToken token = text;
        if (firstContentLine > 0)
        {
            ProgramSourceLocations.Annotate(
                token,
                firstContentLine,
                lines[firstContentLine - 1],
                firstContentColumn,
                firstContentColumn);
        }

        return token;
    }

    private static string JoinLiteralBlockLines(List<string> contentLines)
    {
        var sb = new StringBuilder();
        foreach (var line in contentLines)
        {
            sb.Append(line).Append('\n');
        }

        return sb.ToString();
    }

    /// <summary>YAML 1.2 folded style: adjacent non-empty lines become spaces; blank / more-indented lines keep breaks.</summary>
    private static string FoldBlockScalarLines(IReadOnlyList<string> lines)
    {
        var sb = new StringBuilder();
        var i = 0;
        while (i < lines.Count)
        {
            var line = lines[i];
            if (line.Length == 0)
            {
                sb.Append('\n');
                i++;
                continue;
            }

            if (IsMoreIndentedBlockLine(line))
            {
                sb.Append(line).Append('\n');
                i++;
                continue;
            }

            sb.Append(line);
            i++;
            while (i < lines.Count && lines[i].Length > 0 && !IsMoreIndentedBlockLine(lines[i]))
            {
                sb.Append(' ').Append(lines[i]);
                i++;
            }

            if (i < lines.Count && lines[i].Length == 0)
            {
                var empties = 0;
                while (i < lines.Count && lines[i].Length == 0)
                {
                    empties++;
                    i++;
                }

                // Interior: first empty is the paragraph break. Trailing at EOF: also
                // keep the paragraph's final break so >+ can retain extra newlines.
                if (i >= lines.Count)
                {
                    sb.Append('\n');
                }

                for (var n = 0; n < empties; n++)
                {
                    sb.Append('\n');
                }

                continue;
            }

            if (i >= lines.Count || IsMoreIndentedBlockLine(lines[i]))
            {
                sb.Append('\n');
            }
        }

        return sb.ToString();
    }

    private static bool IsMoreIndentedBlockLine(string line) =>
        line.Length > 0 && line[0] is ' ' or '\t';

    /// <summary>1-based column of the first character of the parsed scalar on the key line.</summary>
    private static int FindValueColumn(string rawLine, string rest)
    {
        var stripped = StripComment(rawLine);
        var indent = GetIndent(stripped);
        if (string.IsNullOrWhiteSpace(rest))
        {
            return indent + 1;
        }

        var trimmed = indent < stripped.Length ? stripped.Substring(indent) : string.Empty;
        if (!TryParseInlineKeyValue(trimmed, out _, out _, out var separatorInTrimmed)
            || separatorInTrimmed < 0)
        {
            return indent + 1;
        }

        var i = indent + separatorInTrimmed + 1;
        while (i < stripped.Length && IsInlineWhitespace(stripped[i]))
        {
            i++;
        }

        // Skip YAML quotes so Column is the first parsed character (e.g. '$' of '$=').
        if (i < stripped.Length
            && rest.Length > 0
            && stripped[i] == rest[0]
            && rest[0] is '"' or '\'')
        {
            i++;
        }

        return i + 1;
    }

    private static bool TryParseInlineKeyValue(string trimmed, out string key, out string rest) =>
        TryParseInlineKeyValue(trimmed, out key, out rest, out _);

    private static bool TryParseInlineKeyValue(
        string trimmed,
        out string key,
        out string rest,
        out int separatorIndex)
    {
        key = string.Empty;
        rest = string.Empty;
        separatorIndex = -1;
        if (trimmed.Length == 0)
        {
            return false;
        }

        // key may be quoted
        if (trimmed[0] is '"' or '\'')
        {
            var q = trimmed[0];
            var i = 1;
            var sb = new StringBuilder();
            while (i < trimmed.Length)
            {
                var ch = trimmed[i++];
                if (ch == '\\' && q == '"' && i < trimmed.Length)
                {
                    sb.Append(DecodeEscape(trimmed, ref i));
                    continue;
                }

                if (ch == q)
                {
                    break;
                }

                sb.Append(ch);
            }

            key = sb.ToString();
            while (i < trimmed.Length && IsInlineWhitespace(trimmed[i]))
            {
                i++;
            }

            if (i >= trimmed.Length || trimmed[i] != ':')
            {
                return false;
            }

            separatorIndex = i;
            rest = trimmed.Substring(i + 1).TrimStart();
            return true;
        }

        var colon = trimmed.IndexOf(':');
        if (colon <= 0)
        {
            return false;
        }

        // "key: value" — key cannot contain unquoted ':'
        key = trimmed.Substring(0, colon).TrimEnd();
        var afterColon = trimmed.Substring(colon + 1);
        // URLs like https://example.com are scalars, not key/value pairs.
        if (afterColon.StartsWith("//", StringComparison.Ordinal))
        {
            return false;
        }

        separatorIndex = colon;
        rest = afterColon.TrimStart();
        return key.Length > 0;
    }

    private static bool IsInlineWhitespace(char value) => value is ' ' or '\t';

    private static JToken ParseScalar(string raw)
    {
        if (raw.Length >= 2 && raw[0] == '"' && raw[raw.Length - 1] == '"')
        {
            return UnescapeDoubleQuoted(raw.Substring(1, raw.Length - 2));
        }

        if (raw.Length >= 2 && raw[0] == '\'' && raw[raw.Length - 1] == '\'')
        {
            return raw.Substring(1, raw.Length - 2).Replace("''", "'", StringComparison.Ordinal);
        }

        if (raw is "null" or "~" or "Null" or "NULL")
        {
            return JValue.CreateNull();
        }

        if (raw is "true" or "True" or "TRUE")
        {
            return true;
        }

        if (raw is "false" or "False" or "FALSE")
        {
            return false;
        }

        if (long.TryParse(raw, NumberStyles.Integer, CultureInfo.InvariantCulture, out var l))
        {
            return l;
        }

        if (System.Numerics.BigInteger.TryParse(
                raw,
                NumberStyles.Integer,
                CultureInfo.InvariantCulture,
                out var bi))
        {
            return new JValue(bi);
        }

        if (double.TryParse(raw, NumberStyles.Float, CultureInfo.InvariantCulture, out var d)
            && !double.IsNaN(d) && !double.IsInfinity(d))
        {
            return d;
        }

        return raw;
    }

    private static string UnescapeDoubleQuoted(string s)
    {
        var sb = new StringBuilder(s.Length);
        for (var i = 0; i < s.Length; i++)
        {
            var ch = s[i];
            if (ch == '\\' && i + 1 < s.Length)
            {
                i++;
                sb.Append(DecodeEscape(s, ref i));
            }
            else
            {
                sb.Append(ch);
            }
        }

        return sb.ToString();
    }

    private static char DecodeEscape(string s, ref int index)
    {
        var ch = s[index];
        switch (ch)
        {
            case '0':
                return '\0';
            case 'n':
                return '\n';
            case 'r':
                return '\r';
            case 't':
                return '\t';
            case '\\':
                return '\\';
            case '"':
                return '"';
            case '/':
                return '/';
            case 'u':
                if (index + 4 >= s.Length)
                {
                    throw new ProgramSourceException(
                        ProgramSourceCodes.YamlParseError,
                        "Incomplete \\u escape in double-quoted string.");
                }

                var hex = s.Substring(index + 1, 4);
                if (!int.TryParse(hex, NumberStyles.HexNumber, CultureInfo.InvariantCulture, out var code)
                    || code < 0
                    || code > 0xFFFF)
                {
                    throw new ProgramSourceException(
                        ProgramSourceCodes.YamlParseError,
                        $"Invalid \\u escape '\\u{hex}'.");
                }

                index += 4;
                return (char)code;
            default:
                return ch;
        }
    }

    private static void SkipBlank(string[] lines, ref int index)
    {
        while (index < lines.Length)
        {
            var line = StripComment(lines[index]);
            if (!string.IsNullOrWhiteSpace(line))
            {
                return;
            }

            index++;
        }
    }

    private static string StripComment(string line)
    {
        // Strip unquoted # comments.
        var inSingle = false;
        var inDouble = false;
        for (var i = 0; i < line.Length; i++)
        {
            var ch = line[i];
            if (ch == '\\' && inDouble && i + 1 < line.Length)
            {
                i++;
                continue;
            }

            if (ch == '\'' && !inDouble)
            {
                inSingle = !inSingle;
            }
            else if (ch == '"' && !inSingle)
            {
                inDouble = !inDouble;
            }
            else if (ch == '#' && !inSingle && !inDouble)
            {
                // YAML comments require # at line start or after whitespace.
                if (i == 0 || char.IsWhiteSpace(line[i - 1]))
                {
                    return line.Substring(0, i).TrimEnd();
                }
            }
        }

        return line;
    }

    private static bool OnlyTrailingEmptyLinesRemain(string[] lines, int index)
    {
        for (var i = index; i < lines.Length; i++)
        {
            if (!string.IsNullOrEmpty(lines[i]))
            {
                return false;
            }
        }

        return true;
    }

    private static int GetIndent(string line)
    {
        var i = 0;
        while (i < line.Length && line[i] == ' ')
        {
            i++;
        }

        if (i < line.Length && line[i] == '\t')
        {
            throw new ProgramSourceException(
                ProgramSourceCodes.YamlParseError,
                "Tabs are not allowed for indentation.");
        }

        return i;
    }
}
