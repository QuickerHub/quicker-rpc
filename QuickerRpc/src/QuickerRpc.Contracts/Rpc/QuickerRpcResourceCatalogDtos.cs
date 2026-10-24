using System.Collections.Generic;

namespace QuickerRpc.Contracts.Rpc;

public static class QuickerRpcResourceCatalogKinds
{
    public const string Action = "action";
    public const string GlobalSubProgram = "global_subprogram";
    public const string RuntimeScope = "runtimeCatalog";
}

/// <summary>A window over a captured runtime catalog, excluding drafts and unloaded database rows.</summary>
public sealed class QuickerRpcResourceCatalogPageRequest
{
    public string Scope { get; set; } = QuickerRpcResourceCatalogKinds.RuntimeScope;
    public string? Query { get; set; }
    public int Skip { get; set; }
    public int Take { get; set; } = 500;
    public string? ExpectedSnapshotId { get; set; }
}

/// <summary>Raw stored summary fields only; EditVersion is an exact Int64 decimal string.</summary>
public sealed class QuickerRpcResourceCatalogItem
{
    public string Id { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string Icon { get; set; } = string.Empty;
    public string EditVersion { get; set; } = string.Empty;
    public string? ActionType { get; set; }
    public string? CallIdentifier { get; set; }
}

public sealed class QuickerRpcResourceCatalogPageResult
{
    public bool Success { get; set; }
    public string? ErrorCode { get; set; }
    public string? ErrorMessage { get; set; }
    public string Kind { get; set; } = string.Empty;
    public string Scope { get; set; } = QuickerRpcResourceCatalogKinds.RuntimeScope;
    public string Query { get; set; } = string.Empty;
    public int Skip { get; set; }
    public int Take { get; set; }
    public int TotalCount { get; set; }
    public bool HasMore { get; set; }
    public string? SnapshotId { get; set; }
    public IList<QuickerRpcResourceCatalogItem> Items { get; set; } = new List<QuickerRpcResourceCatalogItem>();
}
