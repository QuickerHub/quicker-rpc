using System.Collections.Generic;

namespace QuickerRpc.Contracts.Rpc;

/// <summary>Native storage identity, independent of the transport destination. Force never changes Kind or DraftId.</summary>
public sealed class QuickerRpcActionStorageIdentity
{
    public string Kind { get; set; } = "catalog";
    public string? DraftId { get; set; }
    public long Version { get; set; }
    /// <summary>Native snapshot hash, closing timestamp-collision gaps. Optional for legacy V1 bundles.</summary>
    public string? ContentHash { get; set; }
}

/// <summary>A catalog snapshot for reversible source editing, without agent compression.</summary>
public sealed class QuickerRpcGetActionProgramSourceResult
{
    public bool Success { get; set; }
    public string? ErrorCode { get; set; }
    public string? ErrorMessage { get; set; }
    public string? ActionId { get; set; }
    public long? EditVersion { get; set; }
    public QuickerRpcActionStorageIdentity? StorageIdentity { get; set; }

    /// <summary>Complete native XAction JSON, including unknown properties.</summary>
    public string? BodyJson { get; set; }

    public string? ReadSource { get; set; }
    public string? Title { get; set; }
    public string? Description { get; set; }
    public string? Icon { get; set; }
    public string? ContextMenuData { get; set; }
    public IList<string> Warnings { get; set; } = new List<string>();
}
