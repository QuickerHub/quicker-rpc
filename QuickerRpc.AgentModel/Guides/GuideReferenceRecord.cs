using System.Collections.Generic;

namespace QuickerRpc.AgentModel.Guides;

public sealed class GuideReferenceRecord
{
    public string Topic { get; set; } = string.Empty;

    public string Id { get; set; } = string.Empty;

    public string Title { get; set; } = string.Empty;

    public string Path { get; set; } = string.Empty;

    public string Markdown { get; set; } = string.Empty;

    public List<string>? SearchAliases { get; set; }

    public string DocumentId => $"{Topic}/ref/{Id}";
}
