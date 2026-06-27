using System;
using System.Collections.Generic;
using System.Linq;

namespace QuickerRpc.AgentModel.Search;

/// <summary>In-memory inverted index with per-field boost.</summary>
public sealed class InvertedSearchIndex
{
    private readonly Dictionary<string, List<Posting>> _postings =
        new(StringComparer.Ordinal);

    private readonly Dictionary<string, SearchDocument> _documents =
        new(StringComparer.Ordinal);

    public int DocumentCount => _documents.Count;

    public void AddDocument(SearchDocument document, SearchFieldWeights fieldWeights)
    {
        if (string.IsNullOrWhiteSpace(document.Id))
        {
            throw new ArgumentException("SearchDocument.Id is required.", nameof(document));
        }

        _documents[document.Id] = document;
        foreach (var pair in document.Fields)
        {
            var weight = fieldWeights.GetWeight(pair.Key);
            if (weight <= 0 || string.IsNullOrWhiteSpace(pair.Value))
            {
                continue;
            }

            foreach (var token in SearchTokenizer.Tokenize(pair.Value))
            {
                AddPosting(token, document.Id, weight);
            }
        }
    }

    public IReadOnlyDictionary<string, int> SearchTokens(IReadOnlyList<string> tokens)
    {
        var scores = new Dictionary<string, int>(StringComparer.Ordinal);
        if (tokens.Count == 0)
        {
            return scores;
        }

        foreach (var token in tokens)
        {
            if (!_postings.TryGetValue(token, out var postings))
            {
                continue;
            }

            foreach (var posting in postings)
            {
                if (!scores.TryGetValue(posting.DocumentId, out var current))
                {
                    current = 0;
                }

                scores[posting.DocumentId] = current + posting.FieldWeight;
            }
        }

        return scores;
    }

    public bool TryGetDocument(string id, out SearchDocument? document) =>
        _documents.TryGetValue(id, out document);

    public IEnumerable<SearchDocument> AllDocuments() => _documents.Values;

    private void AddPosting(string token, string documentId, int fieldWeight)
    {
        if (!_postings.TryGetValue(token, out var list))
        {
            list = new List<Posting>();
            _postings[token] = list;
        }

        list.Add(new Posting(documentId, fieldWeight));
    }

    private readonly struct Posting
    {
        public Posting(string documentId, int fieldWeight)
        {
            DocumentId = documentId;
            FieldWeight = fieldWeight;
        }

        public string DocumentId { get; }

        public int FieldWeight { get; }
    }
}
