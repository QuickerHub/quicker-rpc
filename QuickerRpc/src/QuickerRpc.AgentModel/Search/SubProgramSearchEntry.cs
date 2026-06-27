using System;
using System.Collections.Generic;

namespace QuickerRpc.AgentModel.Search;

/// <summary>Agent-facing subprogram row for unified search indexing.</summary>
public sealed class SubProgramSearchEntry
{
    public string Id { get; set; } = string.Empty;

    public string Name { get; set; } = string.Empty;

    public string? Description { get; set; }

    public string? CallIdentifier { get; set; }

    public string? SharedId { get; set; }

    public string? Icon { get; set; }

    public SearchDocument ToDocument() =>
        new()
        {
            Id = Id,
            Region = SearchRegion.SubProgram,
            SortKey = Name,
            Fields = new Dictionary<string, string>(StringComparer.Ordinal)
            {
                [SubProgramSearchScorer.FieldId] = Id,
                [SubProgramSearchScorer.FieldName] = Name,
                [SubProgramSearchScorer.FieldCallId] = CallIdentifier ?? string.Empty,
                [SubProgramSearchScorer.FieldDescription] = Description ?? string.Empty,
            },
            Payload = this,
        };
}
