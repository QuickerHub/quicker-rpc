using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Text;
using System.Text.RegularExpressions;

namespace QuickerRpc.AgentModel.Guides;

/// <summary>Loads embedded ActionAuthoring Markdown topics for qkrpc CLI agents.</summary>
public sealed class ActionAuthoringGuideService
{
    private const string ResourcePrefix = "QuickerRpc.AgentModel.Docs.ActionAuthoring.";

    private static readonly Lazy<IReadOnlyList<GuideTopic>> Topics = new Lazy<IReadOnlyList<GuideTopic>>(LoadTopics);

    public GetActionAuthoringDocResult GetDoc(string topic)
    {
        var key = NormalizeTopic(topic);
        if (string.IsNullOrEmpty(key))
        {
            return new GetActionAuthoringDocResult
            {
                Success = false,
                ErrorMessage = "topic is required",
                AvailableTopics = ListTopicIds(),
            };
        }

        var match = Topics.Value.FirstOrDefault(t => string.Equals(t.Topic, key, StringComparison.OrdinalIgnoreCase));
        if (match is null)
        {
            return new GetActionAuthoringDocResult
            {
                Success = false,
                ErrorMessage = "Unknown topic: " + key,
                AvailableTopics = ListTopicIds(),
            };
        }

        return new GetActionAuthoringDocResult
        {
            Success = true,
            Topic = match.Topic,
            Title = match.Title,
            Markdown = match.Markdown,
        };
    }

    public SearchActionAuthoringDocsResult Search(string? keyword, int? maxResults)
    {
        var limit = maxResults is > 0 and <= 50 ? maxResults.Value : 10;
        var kw = (keyword ?? string.Empty).Trim();
        var patterns = SplitKeywordPatterns(kw);

        IEnumerable<GuideTopic> candidates = Topics.Value;
        if (patterns.Length > 0)
        {
            candidates = candidates.Where(t => RowMatches(t, patterns));
        }

        var ordered = candidates
            .Select(t => new { Topic = t, Score = patterns.Length == 0 ? 0 : ComputeSortScore(t, patterns) })
            .OrderByDescending(x => x.Score)
            .ThenBy(x => x.Topic.Topic, StringComparer.OrdinalIgnoreCase)
            .Take(limit)
            .ToList();

        var items = ordered
            .Select(x => new ActionAuthoringDocSearchItem
            {
                Topic = x.Topic.Topic,
                Title = x.Topic.Title,
                Excerpt = BuildExcerpt(x.Topic.Markdown, patterns, maxLength: 280),
            })
            .ToList();

        return new SearchActionAuthoringDocsResult
        {
            Success = true,
            Keyword = kw.Length == 0 ? null : kw,
            MatchCount = items.Count,
            Items = items,
            AvailableTopics = ListTopicIds(),
        };
    }

    private static List<string> ListTopicIds() =>
        Topics.Value.Select(t => t.Topic).OrderBy(t => t, StringComparer.OrdinalIgnoreCase).ToList();

    private static string NormalizeTopic(string? topic) =>
        (topic ?? string.Empty).Trim().TrimEnd('/').ToLowerInvariant();

    private static IReadOnlyList<GuideTopic> LoadTopics()
    {
        var assembly = typeof(ActionAuthoringGuideService).Assembly;
        var names = assembly
            .GetManifestResourceNames()
            .Where(n => n.StartsWith(ResourcePrefix, StringComparison.Ordinal) && n.EndsWith(".md", StringComparison.OrdinalIgnoreCase))
            .OrderBy(n => n, StringComparer.Ordinal)
            .ToList();

        var list = new List<GuideTopic>(names.Count);
        foreach (var resourceName in names)
        {
            using var stream = assembly.GetManifestResourceStream(resourceName);
            if (stream is null)
            {
                continue;
            }

            using var reader = new StreamReader(stream, Encoding.UTF8);
            var markdown = reader.ReadToEnd();
            var fileName = resourceName.Substring(ResourcePrefix.Length);
            var topic = Path.GetFileNameWithoutExtension(fileName);
            var title = ExtractTitle(markdown) ?? topic;
            list.Add(new GuideTopic(topic, title, markdown));
        }

        return list;
    }

    private static string? ExtractTitle(string markdown)
    {
        foreach (var line in markdown.Split('\n'))
        {
            var trimmed = line.Trim();
            if (trimmed.StartsWith("# ", StringComparison.Ordinal))
            {
                return trimmed.Substring(2).Trim();
            }
        }

        return null;
    }

    private static string[] SplitKeywordPatterns(string keyword)
    {
        if (string.IsNullOrWhiteSpace(keyword))
        {
            return Array.Empty<string>();
        }

        return keyword
            .Split(new[] { ' ', '\t', '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries)
            .Select(p => p.Trim())
            .Where(p => p.Length > 0)
            .Select(p => p.ToLowerInvariant())
            .ToArray();
    }

    private static bool RowMatches(GuideTopic topic, string[] patterns)
    {
        var haystack = (topic.Topic + " " + topic.Title + " " + topic.Markdown).ToLowerInvariant();
        return patterns.All(p => haystack.Contains(p));
    }

    private static int ComputeSortScore(GuideTopic topic, string[] patterns)
    {
        var score = 0;
        var topicLower = topic.Topic.ToLowerInvariant();
        var titleLower = topic.Title.ToLowerInvariant();
        foreach (var p in patterns)
        {
            if (topicLower.Contains(p))
            {
                score += 8;
            }

            if (titleLower.Contains(p))
            {
                score += 4;
            }

            if (topic.Markdown.IndexOf(p, StringComparison.OrdinalIgnoreCase) >= 0)
            {
                score += 1;
            }
        }

        return score;
    }

    private static string BuildExcerpt(string markdown, string[] patterns, int maxLength)
    {
        var plain = Regex.Replace(markdown, @"^#+\s*", string.Empty, RegexOptions.Multiline);
        plain = Regex.Replace(plain, @"[*_`#\[\]()]", string.Empty);
        plain = Regex.Replace(plain, @"\s+", " ").Trim();

        if (patterns.Length > 0)
        {
            var lower = plain.ToLowerInvariant();
            var idx = -1;
            foreach (var p in patterns)
            {
                var found = lower.IndexOf(p, StringComparison.Ordinal);
                if (found >= 0 && (idx < 0 || found < idx))
                {
                    idx = found;
                }
            }

            if (idx > 40)
            {
                plain = "…" + plain.Substring(idx);
            }
        }

        if (plain.Length <= maxLength)
        {
            return plain;
        }

        return plain.Substring(0, maxLength).TrimEnd() + "…";
    }

    private sealed class GuideTopic
    {
        public GuideTopic(string topic, string title, string markdown)
        {
            Topic = topic;
            Title = title;
            Markdown = markdown;
        }

        public string Topic { get; }

        public string Title { get; }

        public string Markdown { get; }
    }
}
