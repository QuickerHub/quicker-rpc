using System;
using System.Collections.Generic;
using System.Text;

namespace QuickerRpc.AgentModel.Search;

/// <summary>
/// Mixed Chinese/English tokenizer aligned with agent-gui docs search:
/// whitespace splits, CJK bigrams for short phrases, lowercase ascii tokens.
/// </summary>
public static class SearchTokenizer
{
    private static readonly char[] TokenSplit =
        { ' ', '\t', '\r', '\n', '-', '_', ':', '.', '/', '|', '#', '*', '(', ')', '[', ']', '{', '}', '`', '\'', '"', ',', ';', '，', '。', '；', '、', '！', '？' };

    public static IReadOnlyList<string> Tokenize(string? text)
    {
        if (string.IsNullOrWhiteSpace(text))
        {
            return Array.Empty<string>();
        }

        var tokens = new HashSet<string>(StringComparer.Ordinal);
        var lower = text.ToLowerInvariant();

        foreach (var part in lower.Split(TokenSplit, StringSplitOptions.RemoveEmptyEntries))
        {
            var trimmed = part.Trim();
            if (trimmed.Length > 0)
            {
                tokens.Add(trimmed);
            }
        }

        foreach (var seq in ExtractCjkSequences(text))
        {
            tokens.Add(seq);
            if (seq.Length <= 6)
            {
                for (var i = 0; i < seq.Length - 1; i++)
                {
                    tokens.Add(seq.Substring(i, 2));
                }
            }
        }

        var list = new List<string>(tokens.Count);
        list.AddRange(tokens);
        return list;
    }

    public static string NormalizeQuery(string? keyword) =>
        (keyword ?? string.Empty).Trim();

    private static IEnumerable<string> ExtractCjkSequences(string text)
    {
        var buffer = new StringBuilder();
        foreach (var ch in text)
        {
            if (IsCjk(ch))
            {
                buffer.Append(ch);
                continue;
            }

            if (buffer.Length >= 2)
            {
                yield return buffer.ToString();
            }

            buffer.Clear();
        }

        if (buffer.Length >= 2)
        {
            yield return buffer.ToString();
        }
    }

    private static bool IsCjk(char ch) => ch >= '\u4e00' && ch <= '\u9fff';
}
