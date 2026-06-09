using System;
using System.Collections.Generic;
using System.Linq;

namespace QuickerRpc.AgentModel.Search;

public delegate int SearchLinearScorer(SearchDocument document, string keyword);

internal sealed class SearchRegionSnapshot
{
    private SearchRegionSnapshot(
        SearchRegion region,
        SearchRegionMode mode,
        IReadOnlyList<SearchDocument> documents,
        InvertedSearchIndex? tokenIndex,
        SearchFieldWeights? fieldWeights,
        SearchLinearScorer? linearScorer)
    {
        Region = region;
        Mode = mode;
        Documents = documents;
        TokenIndex = tokenIndex;
        FieldWeights = fieldWeights;
        LinearScorer = linearScorer;
    }

    public SearchRegion Region { get; }

    public SearchRegionMode Mode { get; }

    public IReadOnlyList<SearchDocument> Documents { get; }

    public InvertedSearchIndex? TokenIndex { get; }

    public SearchFieldWeights? FieldWeights { get; }

    public SearchLinearScorer? LinearScorer { get; }

    public static SearchRegionSnapshot Build(
        SearchRegion region,
        IReadOnlyList<SearchDocument> documents,
        SearchRegionMode mode,
        SearchFieldWeights? fieldWeights = null,
        SearchLinearScorer? linearScorer = null)
    {
        if (documents is null)
        {
            throw new ArgumentNullException(nameof(documents));
        }

        InvertedSearchIndex? index = null;
        if (mode == SearchRegionMode.TokenIndex)
        {
            var weights = fieldWeights ?? new SearchFieldWeights(
                new Dictionary<string, int>(StringComparer.Ordinal) { ["body"] = 1 });
            index = new InvertedSearchIndex();
            foreach (var doc in documents)
            {
                index.AddDocument(doc, weights);
            }
        }

        return new SearchRegionSnapshot(region, mode, documents, index, fieldWeights, linearScorer);
    }

    public IReadOnlyList<SearchHit> Search(SearchRequest request)
    {
        var normalized = SearchTokenizer.NormalizeQuery(request.Query);
        if (normalized.Length == 0)
        {
            return SearchEmptyQuery(request);
        }

        return Mode switch
        {
            SearchRegionMode.TokenIndex => SearchTokenIndex(normalized, request),
            SearchRegionMode.LinearSubstring => SearchLinear(normalized, request),
            _ => Array.Empty<SearchHit>(),
        };
    }

    private IReadOnlyList<SearchHit> SearchEmptyQuery(SearchRequest request)
    {
        IEnumerable<SearchDocument> query = Documents;
        if (request.DocumentFilter is not null)
        {
            query = query.Where(request.DocumentFilter);
        }

        var ordered = query
            .OrderBy(d => d.SortKey, StringComparer.OrdinalIgnoreCase)
            .Select(ToHit);

        return request.LimitResults
            ? ordered.Take(ClampLimit(request.Limit)).ToList()
            : ordered.ToList();
    }

    private IReadOnlyList<SearchHit> SearchLinear(string keyword, SearchRequest request)
    {
        var hits = new List<SearchHit>();
        var scorer = LinearScorer ?? SubProgramSearchScorer.ScoreDocument;
        foreach (var doc in Documents)
        {
            if (request.DocumentFilter is not null && !request.DocumentFilter(doc))
            {
                continue;
            }

            var score = scorer(doc, keyword) + doc.RankBias;
            if (score <= 0)
            {
                continue;
            }

            hits.Add(new SearchHit
            {
                Region = Region,
                DocumentId = doc.Id,
                Score = score,
                SortKey = doc.SortKey,
                Payload = doc.Payload,
            });
        }

        var ordered = hits
            .OrderByDescending(h => h.Score)
            .ThenBy(h => h.SortKey, StringComparer.OrdinalIgnoreCase);

        return request.LimitResults
            ? ordered.Take(ClampLimit(request.Limit)).ToList()
            : ordered.ToList();
    }

    private IReadOnlyList<SearchHit> SearchTokenIndex(string keyword, SearchRequest request)
    {
        if (TokenIndex is null)
        {
            return Array.Empty<SearchHit>();
        }

        var parsed = SearchQuery.Parse(keyword);
        if (parsed.IsEmpty)
        {
            return Array.Empty<SearchHit>();
        }

        if (parsed.IsAdvanced)
        {
            return SearchAdvancedBranches(parsed, request);
        }

        if (request.RequireAllLegacyTokens)
        {
            return SearchLegacyAnd(parsed.LegacyPatterns, request);
        }

        return SearchLegacyOr(parsed.LegacyPatterns, request);
    }

    private IReadOnlyList<SearchHit> SearchLegacyAnd(string[] patterns, SearchRequest request)
    {
        if (patterns.Length == 0 || TokenIndex is null)
        {
            return Array.Empty<SearchHit>();
        }

        HashSet<string>? candidateIds = null;
        var perDocScore = new Dictionary<string, int>(StringComparer.Ordinal);

        foreach (var pattern in patterns)
        {
            var tokens = SearchTokenizer.Tokenize(pattern);
            if (tokens.Count == 0)
            {
                continue;
            }

            var tokenScores = TokenIndex.SearchTokens(tokens);
            var patternIds = new HashSet<string>(StringComparer.Ordinal);
            foreach (var pair in tokenScores)
            {
                patternIds.Add(pair.Key);
                if (!perDocScore.TryGetValue(pair.Key, out var total))
                {
                    total = 0;
                }

                perDocScore[pair.Key] = total + pair.Value;
            }

            candidateIds = candidateIds is null
                ? patternIds
                : new HashSet<string>(candidateIds.Intersect(patternIds), StringComparer.Ordinal);

            if (candidateIds.Count == 0)
            {
                return Array.Empty<SearchHit>();
            }
        }

        if (candidateIds is null || candidateIds.Count == 0)
        {
            return Array.Empty<SearchHit>();
        }

        return BuildTokenHits(candidateIds, perDocScore, request);
    }

    private IReadOnlyList<SearchHit> SearchLegacyOr(string[] patterns, SearchRequest request)
    {
        if (TokenIndex is null)
        {
            return Array.Empty<SearchHit>();
        }

        var perDocScore = new Dictionary<string, int>(StringComparer.Ordinal);
        foreach (var pattern in patterns)
        {
            foreach (var pair in TokenIndex.SearchTokens(SearchTokenizer.Tokenize(pattern)))
            {
                if (!perDocScore.TryGetValue(pair.Key, out var total))
                {
                    total = 0;
                }

                perDocScore[pair.Key] = total + pair.Value;
            }
        }

        return BuildTokenHits(perDocScore.Keys, perDocScore, request);
    }

    private IReadOnlyList<SearchHit> SearchAdvancedBranches(SearchQuery parsed, SearchRequest request)
    {
        if (TokenIndex is null)
        {
            return Array.Empty<SearchHit>();
        }

        var bestPerDoc = new Dictionary<string, int>(StringComparer.Ordinal);
        foreach (var branch in parsed.Branches)
        {
            var branchTokens = branch
                .SelectMany(t => SearchTokenizer.Tokenize(t))
                .Distinct(StringComparer.Ordinal)
                .ToList();
            if (branchTokens.Count == 0)
            {
                continue;
            }

            var tokenScores = TokenIndex.SearchTokens(branchTokens);
            foreach (var pair in tokenScores)
            {
                if (!bestPerDoc.TryGetValue(pair.Key, out var best) || pair.Value > best)
                {
                    bestPerDoc[pair.Key] = pair.Value;
                }
            }
        }

        return BuildTokenHits(bestPerDoc.Keys, bestPerDoc, request);
    }

    private IReadOnlyList<SearchHit> BuildTokenHits(
        IEnumerable<string> documentIds,
        IReadOnlyDictionary<string, int> scores,
        SearchRequest request)
    {
        var hits = new List<SearchHit>();
        foreach (var id in documentIds)
        {
            if (!TokenIndex!.TryGetDocument(id, out var doc) || doc is null)
            {
                continue;
            }

            if (request.DocumentFilter is not null && !request.DocumentFilter(doc))
            {
                continue;
            }

            if (!scores.TryGetValue(id, out var score) || score <= 0)
            {
                continue;
            }

            hits.Add(new SearchHit
            {
                Region = Region,
                DocumentId = id,
                Score = score + doc.RankBias,
                SortKey = doc.SortKey,
                Payload = doc.Payload,
            });
        }

        var ordered = hits
            .OrderByDescending(h => h.Score)
            .ThenBy(h => h.SortKey, StringComparer.OrdinalIgnoreCase);

        return request.LimitResults
            ? ordered.Take(ClampLimit(request.Limit)).ToList()
            : ordered.ToList();
    }

    private SearchHit ToHit(SearchDocument doc) =>
        new()
        {
            Region = Region,
            DocumentId = doc.Id,
            Score = 0,
            SortKey = doc.SortKey,
            Payload = doc.Payload,
        };

    private static int ClampLimit(int limit) => limit < 1 ? 1 : limit;
}
