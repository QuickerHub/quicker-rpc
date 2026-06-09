using System;
using System.Collections.Generic;
using System.Text;
using System.Text.RegularExpressions;

namespace QuickerRpc.AgentModel.Search;

/// <summary>Splits guide markdown into ## sections for fragment indexing.</summary>
public static class GuideMarkdownSectionParser
{
    private static readonly Regex H2Regex = new(
        @"^##\s+(.+)$",
        RegexOptions.Multiline | RegexOptions.CultureInvariant);

    public sealed class Section
    {
        public string Heading { get; init; } = string.Empty;

        public string Slug { get; init; } = string.Empty;

        public string Body { get; init; } = string.Empty;
    }

    public static IReadOnlyList<Section> ParseH2Sections(string markdown)
    {
        if (string.IsNullOrWhiteSpace(markdown))
        {
            return Array.Empty<Section>();
        }

        var matches = H2Regex.Matches(markdown);
        if (matches.Count == 0)
        {
            return Array.Empty<Section>();
        }

        var sections = new List<Section>(matches.Count);
        for (var i = 0; i < matches.Count; i++)
        {
            var heading = matches[i].Groups[1].Value.Trim();
            var bodyStart = matches[i].Index + matches[i].Length;
            var bodyEnd = i + 1 < matches.Count ? matches[i + 1].Index : markdown.Length;
            var body = markdown.Substring(bodyStart, bodyEnd - bodyStart).Trim();
            sections.Add(new Section
            {
                Heading = heading,
                Slug = Slugify(heading),
                Body = body,
            });
        }

        return sections;
    }

    public static string? TryExtractSectionBody(string markdown, string sectionHeading)
    {
        if (string.IsNullOrWhiteSpace(markdown) || string.IsNullOrWhiteSpace(sectionHeading))
        {
            return null;
        }

        foreach (var section in ParseH2Sections(markdown))
        {
            if (string.Equals(section.Heading, sectionHeading, StringComparison.OrdinalIgnoreCase))
            {
                return section.Body;
            }
        }

        return null;
    }

    internal static string Slugify(string heading)
    {
        var lower = heading.ToLowerInvariant();
        var slug = Regex.Replace(lower, @"[^a-z0-9\u4e00-\u9fff]+", "-").Trim('-');
        if (slug.Length > 80)
        {
            slug = slug.Substring(0, 80).TrimEnd('-');
        }

        return string.IsNullOrEmpty(slug) ? "section" : slug;
    }
}
