namespace QuickerRpc.AgentModel.Catalog;

/// <summary>One Font Awesome icon row for search (protobuf-neutral).</summary>
public sealed class FontAwesomeIconEntry
{
    public string Name { get; set; } = string.Empty;

    public string Style { get; set; } = string.Empty;

    public string Label { get; set; } = string.Empty;

    public int Unicode { get; set; }

    public string Icon { get; set; } = string.Empty;
}

public sealed class SearchFontAwesomeIconsResult
{
    public bool Success { get; set; }

    public string? ErrorMessage { get; set; }

    public string? Keyword { get; set; }

    public int MatchCount { get; set; }

    /// <summary>EFontAwesomeIcon member names (e.g. Solid_AddressBook). Use as fa:{name} in Quicker.</summary>
    public List<string> Names { get; set; } = new();
}
