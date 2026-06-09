using System.Collections.Generic;

namespace QuickerRpc.AgentModel.Search;

public sealed class GuideSearchEntry
{
    public string Topic { get; set; } = string.Empty;

    public string Title { get; set; } = string.Empty;

    public string Markdown { get; set; } = string.Empty;

    public SearchDocument ToDocument(string? compactBody = null) =>
        new()
        {
            Id = Topic,
            Region = SearchRegion.Guide,
            SortKey = Topic,
            Fields = new Dictionary<string, string>
            {
                ["topic"] = Topic,
                ["title"] = Title,
                ["body"] = compactBody ?? Markdown,
            },
            Payload = this,
        };
}
