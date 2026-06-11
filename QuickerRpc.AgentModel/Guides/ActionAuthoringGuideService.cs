using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using QuickerRpc.AgentModel.Schemas;
using QuickerRpc.AgentModel.Search;

namespace QuickerRpc.AgentModel.Guides;

/// <summary>Loads embedded ActionAuthoring Markdown topics for qkrpc CLI agents. Source: repo <c>docs/action-authoring/</c>.</summary>
public sealed class ActionAuthoringGuideService
{
    private const string ResourcePrefix = "QuickerRpc.AgentModel.Docs.ActionAuthoring.";
    private const string ReferenceResourcePrefix = ResourcePrefix + "References.";
    private const string ReferenceManifestResource = ResourcePrefix + "references-manifest.json";

    private static readonly Lazy<IReadOnlyList<GuideTopic>> Topics = new Lazy<IReadOnlyList<GuideTopic>>(LoadTopics);
    private static readonly Lazy<IReadOnlyList<GuideReferenceRecord>> References =
        new Lazy<IReadOnlyList<GuideReferenceRecord>>(LoadReferences);

    public GetActionAuthoringDocResult GetDoc(string topic, string? reference = null)
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

        if (!string.IsNullOrWhiteSpace(reference))
        {
            return GetReferenceDoc(key, reference);
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

    private GetActionAuthoringDocResult GetReferenceDoc(string topic, string reference)
    {
        var refKey = NormalizeReferenceKey(reference);
        if (string.IsNullOrEmpty(refKey))
        {
            return new GetActionAuthoringDocResult
            {
                Success = false,
                ErrorMessage = "reference is required",
                AvailableTopics = ListTopicIds(),
            };
        }

        if (IsBlockedReferenceKey(refKey))
        {
            return new GetActionAuthoringDocResult
            {
                Success = false,
                ErrorMessage = "Invalid reference: " + reference,
                AvailableTopics = ListTopicIds(),
            };
        }

        var topicMatch = Topics.Value.FirstOrDefault(t =>
            string.Equals(t.Topic, topic, StringComparison.OrdinalIgnoreCase));
        if (topicMatch is null)
        {
            return new GetActionAuthoringDocResult
            {
                Success = false,
                ErrorMessage = "Unknown topic: " + topic,
                AvailableTopics = ListTopicIds(),
            };
        }

        var refMatch = References.Value.FirstOrDefault(r =>
            string.Equals(r.Topic, topicMatch.Topic, StringComparison.OrdinalIgnoreCase)
            && string.Equals(r.Id, refKey, StringComparison.OrdinalIgnoreCase));
        if (refMatch is null)
        {
            return new GetActionAuthoringDocResult
            {
                Success = false,
                ErrorMessage = $"Unknown reference: {refKey} (topic: {topicMatch.Topic})",
                AvailableTopics = ListTopicIds(),
                AvailableReferences = ListReferenceIds(topicMatch.Topic),
            };
        }

        return new GetActionAuthoringDocResult
        {
            Success = true,
            Topic = refMatch.Topic,
            Reference = refMatch.Id,
            Title = ExtractTitle(refMatch.Markdown) ?? refMatch.Title,
            Markdown = refMatch.Markdown,
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
        var items = SelectBestHitsPerDocument(hits, limit)
            .Select(hit =>
            {
                var (topic, reference, title, markdown) = ResolveGuideHit(hit);
                var sectionHeading = ResolveSectionHeading(hit);
                return new ActionAuthoringDocSearchItem
                {
                    Topic = topic,
                    Reference = reference,
                    Title = title,
                    Section = sectionHeading,
                    Excerpt = BuildExcerpt(markdown, sectionHeading, patterns, maxLength: 420),
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

        var referenceEntries = References.Value
            .Select(r => new GuideSearchEntry
            {
                Topic = r.Topic,
                ReferenceId = r.Id,
                Title = r.Title,
                Markdown = r.Markdown,
                SearchAliases = r.SearchAliases,
            })
            .ToList();

        GuideSearchIndex.PublishTopics(entries, referenceEntries);
    }

    private static IReadOnlyList<SearchHit> SelectBestHitsPerDocument(IReadOnlyList<SearchHit> hits, int limit)
    {
        return hits
            .GroupBy(h => GuideSearchIndex.ResolveDocumentKey(h.DocumentId), StringComparer.OrdinalIgnoreCase)
            .Select(g => g.OrderByDescending(h => h.Score).First())
            .OrderByDescending(h => h.Score)
            .ThenBy(h => GuideSearchIndex.ResolveDocumentKey(h.DocumentId), StringComparer.OrdinalIgnoreCase)
            .Take(limit)
            .ToList();
    }

    private static (string Topic, string? Reference, string Title, string Markdown) ResolveGuideHit(SearchHit hit)
    {
        if (hit.Payload is GuideSearchSectionPayload section)
        {
            var topicDoc = Topics.Value.First(t =>
                string.Equals(t.Topic, section.Topic, StringComparison.OrdinalIgnoreCase));
            return (topicDoc.Topic, null, topicDoc.Title, topicDoc.Markdown);
        }

        if (hit.Payload is GuideReferenceRecord reference)
        {
            return (reference.Topic, reference.Id, reference.Title, reference.Markdown);
        }

        if (hit.Payload is GuideSearchEntry entry)
        {
            if (!string.IsNullOrEmpty(entry.ReferenceId))
            {
                var refDoc = References.Value.First(r =>
                    string.Equals(r.Topic, entry.Topic, StringComparison.OrdinalIgnoreCase)
                    && string.Equals(r.Id, entry.ReferenceId, StringComparison.OrdinalIgnoreCase));
                return (refDoc.Topic, refDoc.Id, refDoc.Title, refDoc.Markdown);
            }

            return (entry.Topic, null, entry.Title, entry.Markdown);
        }

        var documentKey = GuideSearchIndex.ResolveDocumentKey(hit.DocumentId);
        var slash = documentKey.IndexOf("/ref/", StringComparison.Ordinal);
        if (slash >= 0)
        {
            var topicId = documentKey.Substring(0, slash);
            var refId = documentKey.Substring(slash + "/ref/".Length);
            var refDoc = References.Value.First(r =>
                string.Equals(r.Topic, topicId, StringComparison.OrdinalIgnoreCase)
                && string.Equals(r.Id, refId, StringComparison.OrdinalIgnoreCase));
            return (refDoc.Topic, refDoc.Id, refDoc.Title, refDoc.Markdown);
        }

        var topic = Topics.Value.First(t => string.Equals(t.Topic, documentKey, StringComparison.OrdinalIgnoreCase));
        return (topic.Topic, null, topic.Title, topic.Markdown);
    }

    private static string? ResolveSectionHeading(SearchHit hit) =>
        hit.Payload is GuideSearchSectionPayload section ? section.SectionHeading : null;

    private static List<string> ListTopicIds() =>
        Topics.Value.Select(t => t.Topic).OrderBy(t => t, StringComparer.OrdinalIgnoreCase).ToList();

    private static List<string> ListReferenceIds(string topic) =>
        References.Value
            .Where(r => string.Equals(r.Topic, topic, StringComparison.OrdinalIgnoreCase))
            .Select(r => r.Id)
            .OrderBy(id => id, StringComparer.OrdinalIgnoreCase)
            .ToList();

    private static string NormalizeTopic(string? topic) =>
        (topic ?? string.Empty).Trim().TrimEnd('/').ToLowerInvariant();

    private static string NormalizeReferenceKey(string reference)
    {
        var key = (reference ?? string.Empty)
            .Trim()
            .Replace('\\', '/')
            .TrimStart('/');
        if (key.StartsWith("references/", StringComparison.OrdinalIgnoreCase))
        {
            key = key.Substring("references/".Length);
        }

        if (key.EndsWith(".md", StringComparison.OrdinalIgnoreCase))
        {
            key = key.Substring(0, key.Length - 3);
        }

        return key.ToLowerInvariant();
    }

    private static bool IsBlockedReferenceKey(string refKey) =>
        refKey.Contains("..", StringComparison.Ordinal)
        || refKey.StartsWith("/", StringComparison.Ordinal)
        || (refKey.Length >= 2 && refKey[1] == ':');

    private static IReadOnlyList<GuideTopic> LoadTopics()
    {
        var assembly = typeof(ActionAuthoringGuideService).Assembly;
        var names = assembly
            .GetManifestResourceNames()
            .Where(n => n.StartsWith(ResourcePrefix, StringComparison.Ordinal)
                && n.EndsWith(".md", StringComparison.OrdinalIgnoreCase)
                && !n.StartsWith(ReferenceResourcePrefix, StringComparison.Ordinal))
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

    private static IReadOnlyList<GuideReferenceRecord> LoadReferences()
    {
        var assembly = typeof(ActionAuthoringGuideService).Assembly;
        using var manifestStream = assembly.GetManifestResourceStream(ReferenceManifestResource);
        if (manifestStream is null)
        {
            return Array.Empty<GuideReferenceRecord>();
        }

        using var manifestReader = new StreamReader(manifestStream, Encoding.UTF8);
        var manifestJson = manifestReader.ReadToEnd();
        GuideReferenceManifest? manifest;
        try
        {
            manifest = JsonSerializer.Deserialize<GuideReferenceManifest>(
                manifestJson,
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
        }
        catch
        {
            return Array.Empty<GuideReferenceRecord>();
        }

        if (manifest?.References is null || manifest.References.Count == 0)
        {
            return Array.Empty<GuideReferenceRecord>();
        }

        var list = new List<GuideReferenceRecord>(manifest.References.Count);
        foreach (var item in manifest.References)
        {
            if (string.IsNullOrWhiteSpace(item.Topic)
                || string.IsNullOrWhiteSpace(item.Id)
                || string.IsNullOrWhiteSpace(item.Path))
            {
                continue;
            }

            var resourceName = ReferenceResourcePrefix + PathToResourceSuffix(item.Path);
            using var stream = assembly.GetManifestResourceStream(resourceName);
            if (stream is null)
            {
                continue;
            }

            using var reader = new StreamReader(stream, Encoding.UTF8);
            var markdown = reader.ReadToEnd();
            list.Add(new GuideReferenceRecord
            {
                Topic = item.Topic,
                Id = item.Id,
                Title = string.IsNullOrWhiteSpace(item.Title) ? item.Id : item.Title,
                Path = item.Path,
                Markdown = markdown,
                SearchAliases = item.SearchAliases,
            });
        }

        return list;
    }

    private static string PathToResourceSuffix(string relPath) =>
        relPath.Replace('/', '.').Replace('\\', '.');

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

    private sealed class GuideReferenceManifest
    {
        public List<GuideReferenceManifestItem>? References { get; set; }
    }

    private sealed class GuideReferenceManifestItem
    {
        public string Topic { get; set; } = string.Empty;

        public string Id { get; set; } = string.Empty;

        public string Title { get; set; } = string.Empty;

        public string Path { get; set; } = string.Empty;

        public List<string>? SearchAliases { get; set; }
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
