using System;
using System.Collections.Generic;
using System.Threading;
using Quicker.Common;
using QuickerRpc.AgentModel.Search;

namespace QuickerRpc.Plugin.Services.Search;

/// <summary>Builds action catalog documents for <see cref="AgentSearchHub"/>.</summary>
internal static class ActionSearchIndexPublisher
{
    internal const int BuildBatchSize = 80;

    public static IEnumerable<ActionCatalogEntry> EnumerateCatalogEntries() =>
        ActionCatalogEnumerator.Enumerate(scope: null);

    /// <summary>Append up to <paramref name="batchSize"/> documents; returns false when enumeration is complete.</summary>
    public static bool TryAppendBatch(
        IEnumerator<ActionCatalogEntry> enumerator,
        List<SearchDocument> buffer,
        int batchSize,
        CancellationToken cancellationToken)
    {
        if (enumerator is null)
        {
            throw new ArgumentNullException(nameof(enumerator));
        }

        if (buffer is null)
        {
            throw new ArgumentNullException(nameof(buffer));
        }

        var added = 0;
        while (added < batchSize && enumerator.MoveNext())
        {
            cancellationToken.ThrowIfCancellationRequested();
            var entry = enumerator.Current;
            if (string.IsNullOrWhiteSpace(entry.Action.Id))
            {
                continue;
            }

            buffer.Add(ToDocument(entry));
            added++;
        }

        return added > 0;
    }

    public static void Publish(AgentSearchHub hub, IReadOnlyList<SearchDocument> documents)
    {
        if (hub is null)
        {
            throw new ArgumentNullException(nameof(hub));
        }

        hub.Publish(
            SearchRegion.Action,
            documents,
            SearchRegionMode.LinearSubstring,
            linearScorer: ActionSearchScorer.ScoreDocument);
    }
    private static SearchDocument ToDocument(ActionCatalogEntry entry)
    {
        var action = entry.Action;
        var id = (action.Id ?? string.Empty).Trim();
        var title = action.Title ?? string.Empty;
        return new SearchDocument
        {
            Id = id,
            Region = SearchRegion.Action,
            SortKey = title,
            Fields = new Dictionary<string, string>(StringComparer.Ordinal)
            {
                [ActionSearchFields.Id] = id,
                [ActionSearchFields.Title] = title,
                [ActionSearchFields.Description] = action.Description ?? string.Empty,
                [ActionSearchFields.ProfileName] = entry.Profile?.Name ?? string.Empty,
                [ActionSearchFields.ExeFile] = entry.Profile?.ExeFile ?? string.Empty,
                [ActionSearchFields.ProfileId] = (entry.Profile?.Id ?? string.Empty).Trim(),
            },
            Payload = entry,
        };
    }
}
