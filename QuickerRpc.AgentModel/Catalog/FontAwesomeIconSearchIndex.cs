using System;
using System.Collections.Generic;
using System.Linq;
using QuickerRpc.AgentModel.Search;

namespace QuickerRpc.AgentModel.Catalog;

/// <summary>
/// Lazy inverted index for Font Awesome icons (token OR scoring). Punctuation such as <c>|</c> and
/// <c>*</c> are treated as separators by <see cref="SearchTokenizer"/>, not query operators.
/// </summary>
public static class FontAwesomeIconSearchIndex
{
    private static readonly object Sync = new();
    private static AgentSearchHub? _hub;
    private static IReadOnlyList<FontAwesomeIconEntry>? _catalog;

    public static void EnsurePublished(IReadOnlyList<FontAwesomeIconEntry> catalog)
    {
        if (catalog is null)
        {
            throw new ArgumentNullException(nameof(catalog));
        }

        lock (Sync)
        {
            if (_hub is not null && ReferenceEquals(_catalog, catalog))
            {
                return;
            }

            var documents = catalog.Select(ToDocument).ToList();
            _hub = new AgentSearchHub();
            _hub.Publish(
                SearchRegion.FaIcon,
                documents,
                SearchRegionMode.TokenIndex,
                SearchFieldWeights.ForFaIcon());
            _catalog = catalog;
        }
    }

    public static IReadOnlyList<SearchHit> Search(string? query, int limit)
    {
        AgentSearchHub hub;
        lock (Sync)
        {
            hub = _hub ?? throw new InvalidOperationException(
                "FontAwesome icon index is not published. Call EnsurePublished first.");
        }

        return hub.Search(
            new SearchRequest
            {
                Regions = new[] { SearchRegion.FaIcon },
                Query = query,
                Limit = limit,
                RequireAllLegacyTokens = false,
                LimitResults = false,
            });
    }

    public static void Reset()
    {
        lock (Sync)
        {
            _hub = null;
            _catalog = null;
        }
    }

    private static SearchDocument ToDocument(FontAwesomeIconEntry entry) =>
        new()
        {
            Id = entry.Name ?? string.Empty,
            Region = SearchRegion.FaIcon,
            SortKey = entry.Name ?? string.Empty,
            Payload = entry,
            Fields = new Dictionary<string, string>(StringComparer.Ordinal)
            {
                ["name"] = entry.Name ?? string.Empty,
                ["icon"] = entry.Icon ?? string.Empty,
                ["glyph"] = FontAwesomeIconDedup.ToShortGlyphName(entry.Name ?? string.Empty),
                ["label"] = entry.Label ?? string.Empty,
                ["style"] = entry.Style ?? string.Empty,
            },
        };
}
