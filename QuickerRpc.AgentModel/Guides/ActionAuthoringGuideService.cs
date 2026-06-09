using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Text;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using QuickerRpc.AgentModel.Schemas;
using QuickerRpc.AgentModel.Search;

namespace QuickerRpc.AgentModel.Guides;

/// <summary>Loads embedded ActionAuthoring Markdown topics for qkrpc CLI agents. Source: repo <c>docs/action-authoring/</c>.</summary>
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
            Schema = ResolveTopicSchema(match.Topic),
        };
    }

    private static JsonNode? ResolveTopicSchema(string topic)
    {
        if (string.Equals(topic, ActionDataSchemaService.TopicId, StringComparison.OrdinalIgnoreCase))
        {
            return ActionDataSchemaService.GetSchema();
        }

        if (string.Equals(topic, FormSpecSchemaService.TopicId, StringComparison.OrdinalIgnoreCase))
        {
            return FormSpecSchemaService.GetSchema();
        }

        return null;
    }

    public SearchActionAuthoringDocsResult Search(string? keyword, int? maxResults)
    {
        var limit = maxResults is > 0 and <= 50 ? maxResults.Value : 10;
        var kw = (keyword ?? string.Empty).Trim();
        EnsureGuideIndex();

        var searchLimit = kw.Length == 0 ? limit : Math.Min(50, Math.Max(limit * 4, limit));
        var hits = GuideSearchIndex.Search(kw.Length == 0 ? null : kw, searchLimit);
        var patterns = SplitKeywordPatterns(kw);
        var items = SelectBestHitsPerTopic(hits, limit)
            .Select(hit =>
            {
                var topic = ResolveGuideTopic(hit);
                var sectionHeading = ResolveSectionHeading(hit);
                return new ActionAuthoringDocSearchItem
                {
                    Topic = topic.Topic,
                    Title = topic.Title,
                    Section = sectionHeading,
                    Excerpt = BuildExcerpt(topic.Markdown, sectionHeading, patterns, maxLength: 420),
                };
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

    private static void EnsureGuideIndex()
    {
        if (GuideSearchIndex.Hub.IsPublished(SearchRegion.Guide))
        {
            return;
        }

        var entries = Topics.Value
            .Select(t => new GuideSearchEntry
            {
                Topic = t.Topic,
                Title = t.Title,
                Markdown = t.Markdown,
            })
            .ToList();
        GuideSearchIndex.PublishTopics(entries);
    }

    private static IReadOnlyList<SearchHit> SelectBestHitsPerTopic(IReadOnlyList<SearchHit> hits, int limit)
    {
        return hits
            .GroupBy(h => GuideSearchIndex.ResolveTopicId(h.DocumentId), StringComparer.OrdinalIgnoreCase)
            .Select(g => g.OrderByDescending(h => h.Score).First())
            .OrderByDescending(h => h.Score)
            .ThenBy(h => GuideSearchIndex.ResolveTopicId(h.DocumentId), StringComparer.OrdinalIgnoreCase)
            .Take(limit)
            .ToList();
    }

    private static GuideTopic ResolveGuideTopic(SearchHit hit)
    {
        if (hit.Payload is GuideSearchSectionPayload section)
        {
            return Topics.Value.First(t =>
                string.Equals(t.Topic, section.Topic, StringComparison.OrdinalIgnoreCase));
        }

        if (hit.Payload is GuideSearchEntry entry)
        {
            return new GuideTopic(entry.Topic, entry.Title, entry.Markdown);
        }

        var topicId = GuideSearchIndex.ResolveTopicId(hit.DocumentId);
        return Topics.Value.First(t => string.Equals(t.Topic, topicId, StringComparison.OrdinalIgnoreCase));
    }

    private static string? ResolveSectionHeading(SearchHit hit) =>
        hit.Payload is GuideSearchSectionPayload section ? section.SectionHeading : null;

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

    private static string BuildExcerpt(
        string markdown,
        string? sectionHeading,
        string[] patterns,
        int maxLength)
    {
        var sectionBody = !string.IsNullOrWhiteSpace(sectionHeading)
            ? GuideMarkdownSectionParser.TryExtractSectionBody(markdown, sectionHeading)
            : null;

        var source = sectionBody ?? markdown;
        var plain = Regex.Replace(source, @"^#+\s*", string.Empty, RegexOptions.Multiline);
        plain = Regex.Replace(plain, @"<!--[^>]*-->", string.Empty);
        plain = Regex.Replace(plain, @"[*_`#\[\]()]", string.Empty);
        plain = Regex.Replace(plain, @"\s+", " ").Trim();

        if (!string.IsNullOrWhiteSpace(sectionHeading))
        {
            plain = $"{sectionHeading}. {plain}";
        }
        else if (patterns.Length > 0)
        {
            plain = PreferMatchingSectionExcerpt(markdown, patterns) ?? plain;
        }

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

            if (idx > 60)
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

    private static string? PreferMatchingSectionExcerpt(string markdown, string[] patterns)
    {
        if (patterns.Length == 0)
        {
            return null;
        }

        GuideMarkdownSectionParser.Section? best = null;
        var bestScore = 0;
        foreach (var section in GuideMarkdownSectionParser.ParseH2Sections(markdown))
        {
            var haystack = $"{section.Heading} {section.Body}".ToLowerInvariant();
            var score = 0;
            foreach (var pattern in patterns)
            {
                if (haystack.Contains(pattern, StringComparison.Ordinal))
                {
                    score++;
                }
            }

            if (score > bestScore)
            {
                bestScore = score;
                best = section;
            }
        }

        if (best is null || bestScore == 0)
        {
            return null;
        }

        var plain = Regex.Replace(best.Body, @"^#+\s*", string.Empty, RegexOptions.Multiline);
        plain = Regex.Replace(plain, @"[*_`#\[\]()]", string.Empty);
        plain = Regex.Replace(plain, @"\s+", " ").Trim();
        return $"{best.Heading}. {plain}";
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
