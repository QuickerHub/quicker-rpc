using System;
using System.Collections.Generic;
using System.IO;
using System.Security.Cryptography;
using System.Text;
using System.Threading;

namespace QuickerRpc.AgentModel.Catalog;

public sealed class ResourceCatalogEntry
{
    public ResourceCatalogEntry(string id, string title, string description, string icon, string editVersion,
        string? actionType = null, string? callIdentifier = null)
    {
        Id = id ?? string.Empty;
        Title = title ?? string.Empty;
        Description = description ?? string.Empty;
        Icon = icon ?? string.Empty;
        EditVersion = editVersion ?? string.Empty;
        ActionType = actionType;
        CallIdentifier = callIdentifier;
    }

    public string Id { get; }
    public string Title { get; }
    public string Description { get; }
    public string Icon { get; }
    public string EditVersion { get; }
    public string? ActionType { get; }
    public string? CallIdentifier { get; }
}

/// <summary>CaptureRevision is an adapter observation counter, not an inferred native account epoch.</summary>
public sealed class ResourceCatalogCaptureIdentity
{
    public ResourceCatalogCaptureIdentity(string hostInstanceId, string hostSessionId, string lifecycleOwnerId,
        string accountScope, long captureRevision)
    {
        HostInstanceId = hostInstanceId ?? string.Empty;
        HostSessionId = hostSessionId ?? string.Empty;
        LifecycleOwnerId = lifecycleOwnerId ?? string.Empty;
        AccountScope = accountScope ?? string.Empty;
        CaptureRevision = captureRevision;
    }

    public string HostInstanceId { get; }
    public string HostSessionId { get; }
    public string LifecycleOwnerId { get; }
    public string AccountScope { get; }
    public long CaptureRevision { get; }
}

public sealed class ResourceCatalogPageQuery
{
    public ResourceCatalogPageQuery(string scope = "runtimeCatalog", string? query = null, int skip = 0,
        int take = 500, string? expectedSnapshotId = null)
    {
        Scope = scope ?? string.Empty;
        Query = query ?? string.Empty;
        Skip = skip;
        Take = take;
        ExpectedSnapshotId = expectedSnapshotId;
    }

    public string Scope { get; }
    public string Query { get; }
    public int Skip { get; }
    public int Take { get; }
    public string? ExpectedSnapshotId { get; }
}

public sealed class ResourceCatalogPageResult
{
    internal ResourceCatalogPageResult(bool success, string kind, ResourceCatalogPageQuery query,
        int totalCount = 0, bool hasMore = false, string? snapshotId = null,
        IReadOnlyList<ResourceCatalogEntry>? items = null, string? errorCode = null, string? errorMessage = null)
    {
        Success = success;
        Kind = kind;
        Scope = query.Scope;
        Query = query.Query;
        Skip = query.Skip;
        Take = query.Take;
        TotalCount = totalCount;
        HasMore = hasMore;
        SnapshotId = snapshotId;
        Items = items ?? Array.Empty<ResourceCatalogEntry>();
        ErrorCode = errorCode;
        ErrorMessage = errorMessage;
    }

    public bool Success { get; }
    public string? ErrorCode { get; }
    public string? ErrorMessage { get; }
    public string Kind { get; }
    public string Scope { get; }
    public string Query { get; }
    public int Skip { get; }
    public int Take { get; }
    public int TotalCount { get; }
    public bool HasMore { get; }
    public string? SnapshotId { get; }
    public IReadOnlyList<ResourceCatalogEntry> Items { get; }
}

/// <summary>Pages a detached complete summary view without retaining a process-wide catalog.</summary>
public static class ResourceCatalogPage
{
    public static bool TryNormalizeQuery(string kind, ResourceCatalogPageQuery query,
        out ResourceCatalogPageQuery normalized, out string? errorCode, out string? error)
    {
        normalized = query ?? new ResourceCatalogPageQuery();
        errorCode = null;
        error = null;
        if (query is null || (kind != "action" && kind != "global_subprogram")
            || !string.Equals(query.Scope.Trim(), "runtimeCatalog", StringComparison.Ordinal))
        {
            errorCode = "INVALID_RESOURCE_CATALOG_REQUEST";
            error = "A supported resource kind and runtimeCatalog scope are required.";
            return false;
        }

        var expected = string.IsNullOrWhiteSpace(query.ExpectedSnapshotId) ? null : query.ExpectedSnapshotId!.Trim();
        normalized = new ResourceCatalogPageQuery("runtimeCatalog", query.Query.Trim(), Math.Max(0, query.Skip),
            query.Take <= 0 ? 500 : Math.Min(query.Take, 500), expected);
        if (normalized.Skip > 0 && expected is null)
        {
            errorCode = "SNAPSHOT_REQUIRED";
            error = "Read the first page and supply its snapshotId before requesting a later window.";
            return false;
        }
        return true;
    }

    public static ResourceCatalogPageResult Build(string kind, ResourceCatalogCaptureIdentity identity,
        IReadOnlyList<ResourceCatalogEntry> catalog, ResourceCatalogPageQuery query,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        if (!TryNormalizeQuery(kind, query, out var normalized, out var code, out var error))
            return Failure(kind, normalized, code!, error!);
        if (identity is null || catalog is null || string.IsNullOrWhiteSpace(identity.HostInstanceId)
            || string.IsNullOrWhiteSpace(identity.HostSessionId) || string.IsNullOrWhiteSpace(identity.LifecycleOwnerId)
            || string.IsNullOrWhiteSpace(identity.AccountScope) || identity.CaptureRevision < 0)
            return Failure(kind, normalized, "CATALOG_CONTEXT_UNAVAILABLE", "A complete owned capture identity is required.");

        var byId = new Dictionary<string, ResourceCatalogEntry>(StringComparer.Ordinal);
        var count = catalog.Count;
        for (var index = 0; index < count; index++)
        {
            cancellationToken.ThrowIfCancellationRequested();
            var entry = catalog[index];
            if (entry is null || string.IsNullOrWhiteSpace(entry.Id) || string.IsNullOrWhiteSpace(entry.EditVersion))
                return Failure(kind, normalized, "CATALOG_INVALID", "A catalog entry has no resource identity or stored edit version.");
            if (byId.TryGetValue(entry.Id, out var previous))
            {
                if (!EqualFields(previous, entry))
                    return Failure(kind, normalized, "CATALOG_AMBIGUOUS", "The same resource id has conflicting stored summaries.");
                continue;
            }
            // Keep a detached domain projection even if the supplied collection is later replaced.
            byId.Add(entry.Id, new ResourceCatalogEntry(entry.Id, entry.Title, entry.Description, entry.Icon,
                entry.EditVersion, entry.ActionType, entry.CallIdentifier));
        }

        var complete = new List<ResourceCatalogEntry>(byId.Values);
        cancellationToken.ThrowIfCancellationRequested();
        complete.Sort(CompareEntries);
        cancellationToken.ThrowIfCancellationRequested();
        string snapshot;
        try
        {
            snapshot = Fingerprint(kind, identity, normalized, complete, cancellationToken);
        }
        catch (EncoderFallbackException)
        {
            return Failure(kind, normalized, "CATALOG_INVALID", "A catalog summary contains invalid Unicode.");
        }
        cancellationToken.ThrowIfCancellationRequested();
        if (normalized.ExpectedSnapshotId is not null
            && !string.Equals(normalized.ExpectedSnapshotId, snapshot, StringComparison.Ordinal))
            return Failure(kind, normalized, "CATALOG_CHANGED", "The catalog capture changed. Read a new first page before continuing.");

        var filtered = new List<ResourceCatalogEntry>();
        foreach (var entry in complete)
        {
            cancellationToken.ThrowIfCancellationRequested();
            if (Matches(entry, normalized.Query)) filtered.Add(entry);
        }
        var pageCount = Math.Min(normalized.Take, Math.Max(0, filtered.Count - normalized.Skip));
        var page = new ResourceCatalogEntry[pageCount];
        for (var index = 0; index < pageCount; index++)
        {
            cancellationToken.ThrowIfCancellationRequested();
            page[index] = filtered[normalized.Skip + index];
        }
        cancellationToken.ThrowIfCancellationRequested();
        return new ResourceCatalogPageResult(true, kind, normalized, filtered.Count,
            (long)normalized.Skip + pageCount < filtered.Count, snapshot, Array.AsReadOnly(page));
    }

    private static ResourceCatalogPageResult Failure(string kind, ResourceCatalogPageQuery query,
        string code, string message) => new(false, kind ?? string.Empty, query, errorCode: code, errorMessage: message);

    private static bool EqualFields(ResourceCatalogEntry a, ResourceCatalogEntry b) =>
        a.Id == b.Id && a.Title == b.Title && a.Description == b.Description && a.Icon == b.Icon
        && a.EditVersion == b.EditVersion && a.ActionType == b.ActionType && a.CallIdentifier == b.CallIdentifier;

    private static int CompareEntries(ResourceCatalogEntry a, ResourceCatalogEntry b)
    {
        var comparison = StringComparer.OrdinalIgnoreCase.Compare(a.Title, b.Title);
        if (comparison != 0) return comparison;
        comparison = StringComparer.Ordinal.Compare(a.Id, b.Id);
        if (comparison != 0) return comparison;
        comparison = StringComparer.Ordinal.Compare(a.Title, b.Title);
        if (comparison != 0) return comparison;
        comparison = StringComparer.Ordinal.Compare(a.Description, b.Description);
        if (comparison != 0) return comparison;
        comparison = StringComparer.Ordinal.Compare(a.Icon, b.Icon);
        if (comparison != 0) return comparison;
        comparison = StringComparer.Ordinal.Compare(a.EditVersion, b.EditVersion);
        if (comparison != 0) return comparison;
        comparison = StringComparer.Ordinal.Compare(a.ActionType, b.ActionType);
        return comparison != 0 ? comparison : StringComparer.Ordinal.Compare(a.CallIdentifier, b.CallIdentifier);
    }

    private static bool Matches(ResourceCatalogEntry entry, string query) => query.Length == 0
        || Contains(entry.Id, query) || Contains(entry.Title, query) || Contains(entry.Description, query)
        || Contains(entry.ActionType, query) || Contains(entry.CallIdentifier, query);

    private static bool Contains(string? value, string query) =>
        value?.IndexOf(query, StringComparison.OrdinalIgnoreCase) >= 0;

    private static string Fingerprint(string kind, ResourceCatalogCaptureIdentity identity, ResourceCatalogPageQuery query,
        IReadOnlyList<ResourceCatalogEntry> entries, CancellationToken cancellationToken)
    {
        using var sha = SHA256.Create();
        using var stream = new CryptoStream(Stream.Null, sha, CryptoStreamMode.Write);
        using var writer = new BinaryWriter(stream, new UTF8Encoding(false, true), leaveOpen: true);
        writer.Write("qkrpc.resource-catalog.v1");
        writer.Write(kind);
        writer.Write(query.Scope);
        writer.Write(query.Query);
        writer.Write(identity.HostInstanceId);
        writer.Write(identity.HostSessionId);
        writer.Write(identity.LifecycleOwnerId);
        writer.Write(identity.AccountScope);
        writer.Write(identity.CaptureRevision);
        writer.Write(entries.Count);
        foreach (var entry in entries)
        {
            cancellationToken.ThrowIfCancellationRequested();
            writer.Write(entry.Id);
            writer.Write(entry.Title);
            writer.Write(entry.Description);
            writer.Write(entry.Icon);
            writer.Write(entry.EditVersion);
            WriteOptional(writer, entry.ActionType);
            WriteOptional(writer, entry.CallIdentifier);
        }
        cancellationToken.ThrowIfCancellationRequested();
        writer.Flush();
        stream.FlushFinalBlock();
        // BinaryWriter length-prefixes every string and preserves null versus empty optional fields.
        var hash = sha.Hash!;
        cancellationToken.ThrowIfCancellationRequested();
        return BitConverter.ToString(hash).Replace("-", string.Empty).ToLowerInvariant();
    }

    private static void WriteOptional(BinaryWriter writer, string? value)
    {
        writer.Write(value is not null);
        if (value is not null) writer.Write(value);
    }
}
