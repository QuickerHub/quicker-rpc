namespace QuickerRpc.AgentModel.Search;

public enum SearchRegionMode
{
    /// <summary>Token inverted index (guide, settings keywords).</summary>
    TokenIndex = 0,

    /// <summary>Linear scan with tiered substring scoring (subprograms).</summary>
    LinearSubstring = 1,
}
