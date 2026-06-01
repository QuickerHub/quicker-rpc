namespace QuickerRpc.AgentModel.XAction.Project;

/// <summary>Metadata for a local action project (<c>info.json</c>).</summary>
public sealed class ActionProjectInfo
{
    public string? Id { get; set; }

    public string? Title { get; set; }

    public string? Description { get; set; }

    public string? Icon { get; set; }

    public long? EditVersion { get; set; }

    public string? ExportedUtc { get; set; }
}
