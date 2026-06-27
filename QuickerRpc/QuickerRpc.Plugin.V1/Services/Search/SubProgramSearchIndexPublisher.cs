using System;
using System.Collections.Generic;
using System.Threading;
using Quicker.Domain.Actions.X;
using QuickerRpc.AgentModel.Search;

namespace QuickerRpc.Plugin.Services.Search;

/// <summary>Builds global subprogram documents for <see cref="AgentSearchHub"/>.</summary>
internal static class SubProgramSearchIndexPublisher
{
    public static List<SearchDocument> BuildDocuments(
        IEnumerable<SubProgram> subPrograms,
        CancellationToken cancellationToken)
    {
        if (subPrograms is null)
        {
            throw new ArgumentNullException(nameof(subPrograms));
        }

        var documents = new List<SearchDocument>();
        foreach (var subProgram in subPrograms)
        {
            cancellationToken.ThrowIfCancellationRequested();
            if (subProgram is null || string.IsNullOrWhiteSpace(subProgram.Id))
            {
                continue;
            }

            documents.Add(MapEntry(subProgram).ToDocument());
        }

        return documents;
    }

    public static void Publish(AgentSearchHub hub, IReadOnlyList<SearchDocument> documents)
    {
        if (hub is null)
        {
            throw new ArgumentNullException(nameof(hub));
        }

        hub.Publish(
            SearchRegion.SubProgram,
            documents,
            SearchRegionMode.LinearSubstring,
            linearScorer: SubProgramSearchScorer.ScoreDocument);
    }

    private static SubProgramSearchEntry MapEntry(SubProgram subProgram) =>
        new()
        {
            Id = subProgram.Id!.Trim(),
            Name = subProgram.Name ?? string.Empty,
            Description = NullIfEmpty(subProgram.Description),
            CallIdentifier = DataServiceSubProgramAccessor.GetCallIdentifier(subProgram),
            SharedId = NullIfEmpty(subProgram.SharedId),
            Icon = NullIfEmpty(subProgram.Icon),
        };

    private static string? NullIfEmpty(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}
