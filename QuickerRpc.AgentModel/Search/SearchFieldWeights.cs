using System;
using System.Collections.Generic;

namespace QuickerRpc.AgentModel.Search;

/// <summary>Per-region field boost used when building token indexes.</summary>
public sealed class SearchFieldWeights
{
    private readonly IReadOnlyDictionary<string, int> _weights;

    public SearchFieldWeights(IReadOnlyDictionary<string, int> weights)
    {
        _weights = weights ?? throw new ArgumentNullException(nameof(weights));
    }

    public int GetWeight(string fieldName)
    {
        if (_weights.TryGetValue(fieldName, out var weight))
        {
            return weight;
        }

        return 1;
    }

    public static SearchFieldWeights ForGuide() =>
        new(        new Dictionary<string, int>(StringComparer.Ordinal)
        {
            ["topic"] = 8,
            ["reference"] = 6,
            ["parentTopic"] = 3,
            ["title"] = 4,
            ["section"] = 6,
            ["aliases"] = 5,
            ["body"] = 1,
        });
}
