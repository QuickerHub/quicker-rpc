// Ported from Quicker Quicker.Ai.Workspace, revision 574556d76b0b10bd9a8a7951277435649650fab8.
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text;
using Newtonsoft.Json.Linq;

namespace QuickerRpc.AgentModel.XAction.Source;

/// <summary>Deterministic YAML emitter for S0 program source (2-space indent, LF).</summary>
public static class ProgramSourceYamlEmitter
{
    private static readonly HashSet<string> AmbiguousScalars = new(StringComparer.OrdinalIgnoreCase)
    {
        "y", "Y", "yes", "Yes", "YES",
        "n", "N", "no", "No", "NO",
        "true", "True", "TRUE",
        "false", "False", "FALSE",
        "on", "On", "OFF", "off", "Off",
        "null", "Null", "NULL",
        "~",
    };

    public static string Emit(JToken root)
    {
        var sb = new StringBuilder();
        WriteNode(sb, root, indent: 0, isSequenceItem: false);
        var text = sb.ToString();
        if (!text.EndsWith('\n'))
        {
            text += "\n";
        }

        return CawCanonicalizer.NormalizeNewlines(text);
    }

    private static void WriteNode(StringBuilder sb, JToken token, int indent, bool isSequenceItem)
    {
        switch (token.Type)
        {
            case JTokenType.Object:
                WriteObject(sb, (JObject)token, indent, isSequenceItem);
                break;
            case JTokenType.Array:
                WriteArray(sb, (JArray)token, indent, isSequenceItem);
                break;
            default:
                if (isSequenceItem)
                {
                    sb.Append(Indent(indent)).Append("- ").Append(FormatScalar(token)).Append('\n');
                }
                else
                {
                    sb.Append(FormatScalar(token)).Append('\n');
                }

                break;
        }
    }

    private static void WriteObject(StringBuilder sb, JObject obj, int indent, bool isSequenceItem)
    {
        var props = obj.Properties().ToList();
        if (props.Count == 0)
        {
            if (isSequenceItem)
            {
                sb.Append(Indent(indent)).Append("- {}\n");
            }
            else
            {
                sb.Append(Indent(indent)).Append("{}\n");
            }

            return;
        }

        var first = true;
        foreach (var prop in props)
        {
            var key = prop.Name;
            var value = prop.Value;
            if (first && isSequenceItem)
            {
                sb.Append(Indent(indent)).Append("- ").Append(FormatKey(key)).Append(':');
                // Nested mapping under "- key:" must indent past the sequence marker
                // (indent+2), otherwise YAML treats sibling keys as part of the item map.
                WriteValueAfterColon(sb, value, indent + 2, continuationIndent: indent + 2);
                first = false;
            }
            else
            {
                var lineIndent = isSequenceItem ? indent + 1 : indent;
                sb.Append(Indent(lineIndent)).Append(FormatKey(key)).Append(':');
                WriteValueAfterColon(sb, value, lineIndent + 1, continuationIndent: lineIndent + 1);
            }
        }
    }

    private static void WriteValueAfterColon(
        StringBuilder sb,
        JToken value,
        int nestedIndent,
        int continuationIndent)
    {
        if (value.Type is JTokenType.Object or JTokenType.Array)
        {
            if (value is JObject { Count: 0 })
            {
                sb.Append(" {}\n");
                return;
            }

            if (value is JArray { Count: 0 })
            {
                sb.Append(" []\n");
                return;
            }

            sb.Append('\n');
            WriteNode(sb, value, nestedIndent, isSequenceItem: false);
            return;
        }

        if (value.Type == JTokenType.String)
        {
            var s = value.Value<string>() ?? string.Empty;
            if (s.Contains('\n'))
            {
                // Expressions with $= / $$ keep quoted form per roundtrip §5.
                // Quote TAB as well: the restricted parser treats a leading content TAB as indentation.
                // Escapes preserve the original code exactly instead of replacing tabs with spaces.
                if (s.StartsWith("$=", StringComparison.Ordinal)
                    || s.StartsWith("$$", StringComparison.Ordinal)
                    || s.Any(static c => c < ' ' && c != '\n'))
                {
                    sb.Append(' ').Append(FormatDoubleQuoted(s)).Append('\n');
                    return;
                }

                // Count trailing newlines to pick chomping (|- / | / |+).
                var trailingNewlines = 0;
                for (var i = s.Length - 1; i >= 0 && s[i] == '\n'; i--)
                {
                    trailingNewlines++;
                }

                string chomp;
                string body;
                if (trailingNewlines == 0)
                {
                    chomp = "|-";
                    body = s;
                }
                else if (trailingNewlines == 1)
                {
                    chomp = "|";
                    body = s.Substring(0, s.Length - 1);
                }
                else
                {
                    chomp = "|+";
                    body = s.TrimEnd('\n');
                    // Keep exact trailing count via explicit blank lines after body.
                    // Parser |+ keeps all newlines we emit after content lines.
                }

                sb.Append(' ').Append(chomp).Append('\n');
                if (body.Length == 0)
                {
                    // Pure newlines: |+ needs one content line per trailing newline.
                    for (var i = 0; i < trailingNewlines; i++)
                    {
                        sb.Append(Indent(continuationIndent)).Append('\n');
                    }

                    return;
                }

                foreach (var line in body.Split('\n'))
                {
                    sb.Append(Indent(continuationIndent)).Append(line).Append('\n');
                }

                // | and |- already encode one / zero trailing newlines via the header;
                // |+ needs extra blank content lines beyond the single newline after the last text line.
                if (chomp == "|+")
                {
                    for (var i = 1; i < trailingNewlines; i++)
                    {
                        sb.Append(Indent(continuationIndent)).Append('\n');
                    }
                }

                return;
            }
        }

        sb.Append(' ').Append(FormatScalar(value)).Append('\n');
    }

    private static void WriteArray(StringBuilder sb, JArray array, int indent, bool isSequenceItem)
    {
        // When this array is itself a sequence item, emit a lone "-" then nest the
        // array one indent deeper. Otherwise nested arrays flatten into one sequence.
        if (isSequenceItem)
        {
            if (array.Count == 0)
            {
                sb.Append(Indent(indent)).Append("- []\n");
                return;
            }

            sb.Append(Indent(indent)).Append("-\n");
            WriteArray(sb, array, indent + 1, isSequenceItem: false);
            return;
        }

        if (array.Count == 0)
        {
            sb.Append(Indent(indent)).Append("[]\n");
            return;
        }

        foreach (var item in array)
        {
            WriteNode(sb, item, indent, isSequenceItem: true);
        }
    }

    private static string FormatKey(string key)
    {
        // >> is primary-output sugar; do not apply value-scalar rules that quote leading '>'.
        if (key == ">>")
        {
            return key;
        }

        if (key.Length == 0 || NeedsQuotes(key) || key.Contains(':'))
        {
            return FormatDoubleQuoted(key);
        }

        return key;
    }

    private static string FormatScalar(JToken token) =>
        token.Type switch
        {
            JTokenType.Null => "null",
            JTokenType.Boolean => token.Value<bool>() ? "true" : "false",
            JTokenType.Integer => FormatInteger(token),
            JTokenType.Float => FormatFloat(token.Value<double>()),
            JTokenType.String => FormatString(token.Value<string>() ?? string.Empty),
            JTokenType.Date => FormatDate(token),
            _ => FormatDoubleQuoted(token.ToString()),
        };

    private static string FormatDate(JToken token)
    {
        // Emit ISO-8601 UTC so Encode does not depend on local ToString() culture.
        if (token is JValue { Value: DateTimeOffset dto })
        {
            return FormatString(
                dto.UtcDateTime.ToString("yyyy-MM-dd'T'HH:mm:ss.FFFFFFF'Z'", CultureInfo.InvariantCulture));
        }

        var dt = token.Value<DateTime>();
        var utc = dt.Kind == DateTimeKind.Unspecified
            ? DateTime.SpecifyKind(dt, DateTimeKind.Utc)
            : dt.ToUniversalTime();
        return FormatString(
            utc.ToString("yyyy-MM-dd'T'HH:mm:ss.FFFFFFF'Z'", CultureInfo.InvariantCulture));
    }

    private static string FormatInteger(JToken token)
    {
        if (token is JValue { Value: System.Numerics.BigInteger bi })
        {
            return bi.ToString(CultureInfo.InvariantCulture);
        }

        return ((JValue)token).ToString(CultureInfo.InvariantCulture) ?? "0";
    }

    private static string FormatFloat(double value)
    {
        if (double.IsNaN(value) || double.IsInfinity(value))
        {
            return FormatDoubleQuoted(value.ToString(CultureInfo.InvariantCulture));
        }

        var s = value.ToString("G17", CultureInfo.InvariantCulture);
        // Integer-valued floats must keep a decimal marker so Decode stays JTokenType.Float.
        if (s.Contains('.') || s.Contains('e', StringComparison.OrdinalIgnoreCase))
        {
            return s;
        }

        if (value == 0.0 && BitConverter.DoubleToInt64Bits(value) < 0)
        {
            return "-0.0";
        }

        return s + ".0";
    }

    private static string FormatString(string s)
    {
        if (s.Length == 0)
        {
            return "\"\"";
        }

        if (NeedsQuotes(s))
        {
            return FormatDoubleQuoted(s);
        }

        return s;
    }

    private static bool NeedsQuotes(string s)
    {
        if (s.Length == 0)
        {
            return true;
        }

        if (AmbiguousScalars.Contains(s))
        {
            return true;
        }

        if (s.Length > 0 && (char.IsWhiteSpace(s[0]) || char.IsWhiteSpace(s[s.Length - 1])))
        {
            return true;
        }

        if (s.Any(static c => c < ' '))
        {
            return true;
        }

        if (s.Contains(':') || s.Contains('#') || s.Contains('\n') || s.Contains('\r'))
        {
            return true;
        }

        if (s.StartsWith('-') || s.StartsWith('?') || s.StartsWith('[') || s.StartsWith('{')
            || s.StartsWith('&') || s.StartsWith('*') || s.StartsWith('!') || s.StartsWith('|')
            || s.StartsWith('>') || s.StartsWith('\'') || s.StartsWith('"') || s.StartsWith('%')
            || s.StartsWith('@') || s.StartsWith('`'))
        {
            return true;
        }

        // Leading digit / number-like → quote to preserve string identity in roundtrip when needed.
        // CAW may use numeric JSON types; string "0" must stay quoted.
        if (char.IsDigit(s[0]) || s[0] == '+' || s[0] == '.')
        {
            return true;
        }

        if (s.StartsWith("$=", StringComparison.Ordinal) || s.StartsWith("$$", StringComparison.Ordinal))
        {
            return true;
        }

        return false;
    }

    private static string FormatDoubleQuoted(string s)
    {
        var sb = new StringBuilder(s.Length + 2);
        sb.Append('"');
        foreach (var ch in s)
        {
            switch (ch)
            {
                case '\\':
                    sb.Append("\\\\");
                    break;
                case '"':
                    sb.Append("\\\"");
                    break;
                case '\n':
                    sb.Append("\\n");
                    break;
                case '\r':
                    sb.Append("\\r");
                    break;
                case '\t':
                    sb.Append("\\t");
                    break;
                case '\0':
                    sb.Append("\\0");
                    break;
                default:
                    if (ch < ' ')
                    {
                        sb.Append("\\u").Append(((int)ch).ToString("X4", CultureInfo.InvariantCulture));
                    }
                    else
                    {
                        sb.Append(ch);
                    }

                    break;
            }
        }

        sb.Append('"');
        return sb.ToString();
    }

    private static string Indent(int level) => new(' ', level * 2);
}
