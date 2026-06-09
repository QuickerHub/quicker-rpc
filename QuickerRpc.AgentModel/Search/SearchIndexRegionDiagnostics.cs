namespace QuickerRpc.AgentModel.Search;

public sealed class SearchIndexRegionDiagnostics
{
    public SearchRegion Region { get; set; }

    public AgentSearchIndexStatus Status { get; set; }

    public long Generation { get; set; }

    public long? BuildStartedUtcMs { get; set; }

    public long? BuildCompletedUtcMs { get; set; }

    public long? LastBuildDurationMs { get; set; }

    public int? DocumentCount { get; set; }
}
