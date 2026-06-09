namespace QuickerRpc.AgentModel.Search;

/// <summary>Payload for a guide ## section row in the search index.</summary>
public sealed class GuideSearchSectionPayload
{
    public string Topic { get; init; } = string.Empty;

    public string TopicTitle { get; init; } = string.Empty;

    public string SectionHeading { get; init; } = string.Empty;

    public string SectionBody { get; init; } = string.Empty;
}
