namespace QuickerRpc.AgentModel.Search;

/// <summary>Background index build lifecycle for a search region.</summary>
public enum AgentSearchIndexStatus
{
    Missing = 0,
    Building = 1,
    Ready = 2,
}
