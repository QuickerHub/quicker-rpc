using System.Collections.Generic;

namespace QuickerRpc.AgentModel.Guides;

public sealed class GetActionAuthoringDocResult
{
    public bool Success { get; set; }
    public string? ErrorMessage { get; set; }
    public string? Topic { get; set; }
    public string? Title { get; set; }
    public string? Markdown { get; set; }
    public List<string>? AvailableTopics { get; set; }
}

public sealed class ActionAuthoringDocSearchItem
{
    public string Topic { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public string Excerpt { get; set; } = string.Empty;
}

public sealed class SearchActionAuthoringDocsResult
{
    public bool Success { get; set; }
    public string? ErrorMessage { get; set; }
    public string? Keyword { get; set; }
    public int MatchCount { get; set; }
    public List<ActionAuthoringDocSearchItem> Items { get; set; } = new List<ActionAuthoringDocSearchItem>();
    public List<string>? AvailableTopics { get; set; }
}
