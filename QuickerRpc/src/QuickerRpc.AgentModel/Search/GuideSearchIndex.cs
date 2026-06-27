using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;

namespace QuickerRpc.AgentModel.Search;

/// <summary>Lazy guide topic index for <see cref="ActionAuthoringGuideService"/>.</summary>
public static class GuideSearchIndex
{
    private static readonly object Sync = new();
    private static AgentSearchHub? _hub;

    private static readonly Regex SearchAliasesCommentRegex = new(
        @"<!--\s*qkrpc-search-aliases:\s*(.+?)\s*-->",
        RegexOptions.IgnoreCase | RegexOptions.CultureInvariant | RegexOptions.Compiled);

    public static AgentSearchHub Hub
    {
        get
        {
            var hub = _hub;
            if (hub is not null)
            {
                return hub;
            }

            lock (Sync)
            {
                if (_hub is not null)
                {
                    return _hub;
                }

                _hub = new AgentSearchHub();
                return _hub;
            }
        }
    }

    public static void PublishTopics(
        IReadOnlyList<GuideSearchEntry> topics,
        IReadOnlyList<GuideSearchEntry>? references = null)
    {
        var documents = new List<SearchDocument>();
        foreach (var topic in topics)
        {
            documents.Add(BuildTopicDocument(topic));
            foreach (var section in GuideMarkdownSectionParser.ParseH2Sections(topic.Markdown))
            {
                documents.Add(BuildSectionDocument(topic, section));
            }
        }

        if (references is not null)
        {
            foreach (var reference in references)
            {
                documents.Add(BuildReferenceDocument(reference));
                foreach (var section in GuideMarkdownSectionParser.ParseH2Sections(reference.Markdown))
                {
                    documents.Add(BuildReferenceSectionDocument(reference, section));
                }
            }
        }

        Hub.Publish(
            SearchRegion.Guide,
            documents,
            SearchRegionMode.TokenIndex,
            SearchFieldWeights.ForGuide());
    }

    public static IReadOnlyList<SearchHit> Search(string? keyword, int limit) =>
        Hub.Search(
            new SearchRequest
            {
                Regions = new[] { SearchRegion.Guide },
                Query = keyword,
                Limit = limit,
                RequireAllLegacyTokens = true,
            });

    public static string ResolveTopicId(string documentId)
    {
        var key = ResolveDocumentKey(documentId);
        var slash = key.IndexOf("/ref/", StringComparison.Ordinal);
        return slash < 0 ? key : key.Substring(0, slash);
    }

    public static string ResolveDocumentKey(string documentId)
    {
        var hash = documentId.IndexOf('#');
        return hash < 0 ? documentId : documentId.Substring(0, hash);
    }

    public static void Reset()
    {
        lock (Sync)
        {
            _hub = null;
        }
    }

    internal static string CompactMarkdown(string markdown, int maxChars = 600)
    {
        var headings = string.Join(
            " ",
            Regex.Matches(markdown, @"^#+\s+(.+)$", RegexOptions.Multiline)
                .Cast<Match>()
                .Select(m => m.Groups[1].Value.Trim())
                .Where(line => line.Length > 0));

        var plain = Regex.Replace(markdown, @"^#+\s+", string.Empty, RegexOptions.Multiline);
        plain = Regex.Replace(plain, @"<!--[^>]*-->", string.Empty);
        plain = Regex.Replace(plain, @"\s+", " ").Trim();
        var body = plain.Length <= maxChars ? plain : plain.Substring(0, maxChars);
        return string.IsNullOrEmpty(headings) ? body : $"{headings} {body}".Trim();
    }

    internal static string? ExtractSearchAliases(string markdown)
    {
        var match = SearchAliasesCommentRegex.Match(markdown ?? string.Empty);
        return match.Success ? match.Groups[1].Value.Trim() : null;
    }

    private static SearchDocument BuildTopicDocument(GuideSearchEntry topic)
    {
        var aliases = ExtractSearchAliases(topic.Markdown);
        if (string.IsNullOrEmpty(aliases) && topic.SearchAliases?.Count > 0)
        {
            aliases = string.Join(" ", topic.SearchAliases);
        }

        var fields = new Dictionary<string, string>(StringComparer.Ordinal)
        {
            ["topic"] = topic.Topic,
            ["reference"] = topic.ReferenceId ?? string.Empty,
            ["title"] = topic.Title,
            ["body"] = BuildTopicIndexBody(topic.Markdown),
        };

        if (!string.IsNullOrEmpty(aliases))
        {
            fields["aliases"] = aliases.Replace(',', ' ').Replace('，', ' ');
        }

        return new SearchDocument
        {
            Id = topic.DocumentId,
            Region = SearchRegion.Guide,
            SortKey = topic.DocumentId,
            Fields = fields,
            Payload = topic,
            RankBias = string.IsNullOrEmpty(topic.ReferenceId) ? 6 : 4,
        };
    }

    private static SearchDocument BuildReferenceDocument(GuideSearchEntry reference)
    {
        return BuildTopicDocument(reference);
    }

    private static SearchDocument BuildReferenceSectionDocument(
        GuideSearchEntry reference,
        GuideMarkdownSectionParser.Section section)
    {
        var compactBody = CompactSectionBody(section.Body);
        return new SearchDocument
        {
            Id = $"{reference.DocumentId}#{section.Slug}",
            Region = SearchRegion.Guide,
            SortKey = reference.DocumentId,
            Fields = new Dictionary<string, string>(StringComparer.Ordinal)
            {
                ["parentTopic"] = reference.Topic,
                ["reference"] = reference.ReferenceId ?? string.Empty,
                ["title"] = reference.Title,
                ["section"] = section.Heading,
                ["body"] = compactBody,
            },
            Payload = new GuideSearchSectionPayload
            {
                Topic = reference.Topic,
                TopicTitle = reference.Title,
                SectionHeading = section.Heading,
                SectionBody = section.Body,
            },
        };
    }

    private static SearchDocument BuildSectionDocument(GuideSearchEntry topic, GuideMarkdownSectionParser.Section section)
    {
        var compactBody = CompactSectionBody(section.Body);
        return new SearchDocument
        {
            Id = $"{topic.Topic}#{section.Slug}",
            Region = SearchRegion.Guide,
            SortKey = topic.Topic,
            Fields = new Dictionary<string, string>(StringComparer.Ordinal)
            {
                ["parentTopic"] = topic.Topic,
                ["title"] = topic.Title,
                ["section"] = section.Heading,
                ["body"] = compactBody,
            },
            Payload = new GuideSearchSectionPayload
            {
                Topic = topic.Topic,
                TopicTitle = topic.Title,
                SectionHeading = section.Heading,
                SectionBody = section.Body,
            },
        };
    }

    private static string BuildTopicIndexBody(string markdown, int maxChars = 2000)
    {
        var sections = GuideMarkdownSectionParser.ParseH2Sections(markdown);
        var sectionIndex = string.Join(
            " ",
            sections.Select(s => $"{s.Heading} {CompactSectionBody(s.Body, 220)}"));

        var intro = CompactMarkdown(markdown, 500);
        var combined = string.IsNullOrEmpty(sectionIndex) ? intro : $"{intro} {sectionIndex}".Trim();
        return combined.Length <= maxChars ? combined : combined.Substring(0, maxChars);
    }

    private static string CompactSectionBody(string body, int maxChars = 1200)
    {
        var plain = Regex.Replace(body ?? string.Empty, @"^#+\s+", string.Empty, RegexOptions.Multiline);
        plain = Regex.Replace(plain, @"<!--[^>]*-->", string.Empty);
        plain = Regex.Replace(plain, @"\s+", " ").Trim();
        return plain.Length <= maxChars ? plain : plain.Substring(0, maxChars);
    }
}
