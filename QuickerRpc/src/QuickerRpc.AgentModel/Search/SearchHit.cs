namespace QuickerRpc.AgentModel.Search;

public sealed class SearchHit
{
    public SearchRegion Region { get; set; }

    public string DocumentId { get; set; } = string.Empty;

    public int Score { get; set; }

    public string SortKey { get; set; } = string.Empty;

    public object? Payload { get; set; }
}
