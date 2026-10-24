using System;
using System.Collections;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Threading;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using QuickerRpc.AgentModel.Catalog;
using QuickerRpc.Contracts.Rpc;

namespace QuickerRpc.Console.Test;

[TestClass]
public sealed class ResourceCatalogPageTests
{
    private static ResourceCatalogCaptureIdentity Identity(string instance = "instance-a", string session = "session-a",
        string owner = "owner-a", string account = "account-a", long revision = 1) =>
        new(instance, session, owner, account, revision);

    private static ResourceCatalogEntry Entry(string id, string? title = null, string description = "stored description",
        string icon = "fa:Light_Folder:#80112233", string version = "9223372036854775807",
        string? actionType = "XAction", string? callIdentifier = null) =>
        new(id, title ?? id, description, icon, version, actionType, callIdentifier);

    private static ResourceCatalogPageResult Build(IReadOnlyList<ResourceCatalogEntry> rows,
        ResourceCatalogPageQuery? query = null, ResourceCatalogCaptureIdentity? identity = null,
        string kind = QuickerRpcResourceCatalogKinds.Action, CancellationToken cancellationToken = default) =>
        ResourceCatalogPage.Build(kind, identity ?? Identity(), rows, query ?? new(), cancellationToken);

    [TestMethod]
    public void Complete_paging_covers_more_than_one_thousand_resources_once_with_full_totals()
    {
        var rows = Enumerable.Range(0, 1253).Reverse()
            .Select(i => Entry($"id-{i:D4}", $"Group {i % 11:D2} / resource {i:D4}")).ToArray();
        var first = Build(rows, new(take: 137));
        Assert.IsTrue(first.Success, first.ErrorMessage);
        Assert.AreEqual(rows.Length, first.TotalCount);
        Assert.IsTrue(first.HasMore);
        Assert.IsNotNull(first.SnapshotId);
        var collected = new List<ResourceCatalogEntry>();
        var page = first;
        while (true)
        {
            Assert.IsTrue(page.Success, page.ErrorMessage);
            Assert.AreEqual(1253, page.TotalCount);
            Assert.AreEqual(first.SnapshotId, page.SnapshotId);
            collected.AddRange(page.Items);
            if (!page.HasMore) break;
            page = Build(rows, new(skip: collected.Count, take: 137, expectedSnapshotId: first.SnapshotId));
        }
        Assert.AreEqual(1253, collected.Count);
        Assert.AreEqual(1253, collected.Select(row => row.Id).Distinct(StringComparer.Ordinal).Count());
        CollectionAssert.AreEquivalent(rows.Select(row => row.Id).ToArray(), collected.Select(row => row.Id).ToArray());
        for (var i = 1; i < collected.Count; i++)
            Assert.IsTrue(StringComparer.OrdinalIgnoreCase.Compare(collected[i - 1].Title, collected[i].Title) <= 0);
    }

    [TestMethod]
    public void Source_order_and_window_size_do_not_change_snapshot_and_equal_titles_use_ordinal_ids()
    {
        var rows = new[] { Entry("id-b", "Same"), Entry("id-c", "zebra"), Entry("id-a", "SAME") };
        var first = Build(rows, new(take: 1));
        var reordered = Build(rows.Reverse().ToArray(), new(take: 500));
        Assert.IsTrue(first.Success);
        Assert.AreEqual(first.SnapshotId, reordered.SnapshotId);
        CollectionAssert.AreEqual(new[] { "id-a", "id-b", "id-c" }, reordered.Items.Select(row => row.Id).ToArray());
        var rest = Build(rows, new(skip: 1, take: 2, expectedSnapshotId: first.SnapshotId));
        Assert.IsTrue(rest.Success, rest.ErrorMessage);
        CollectionAssert.AreEqual(new[] { "id-b", "id-c" }, rest.Items.Select(row => row.Id).ToArray());
        Assert.IsFalse(rest.HasMore);
    }

    [TestMethod]
    public void Identical_duplicate_ids_are_one_resource_but_conflicting_summaries_are_not_arbitrarily_selected()
    {
        var original = Entry("shared-id", "Shared");
        var single = Build(new[] { original });
        var repeated = Build(new[] { original, Entry("shared-id", "Shared") });
        Assert.IsTrue(repeated.Success);
        Assert.AreEqual(1, repeated.TotalCount);
        Assert.AreEqual(single.SnapshotId, repeated.SnapshotId);
        var conflict = Build(new[] { original, Entry("shared-id", "Shared", description: "different stored value") });
        Assert.IsFalse(conflict.Success);
        Assert.AreEqual("CATALOG_AMBIGUOUS", conflict.ErrorCode);
        Assert.IsNull(conflict.SnapshotId);
        Assert.AreEqual(0, conflict.Items.Count);
    }

    [TestMethod]
    public void Every_projected_field_is_part_of_snapshot_even_outside_the_filtered_page()
    {
        var hit = Entry("match", "Folder");
        var hidden = Entry("other", "Unmatched", version: "9");
        var query = new ResourceCatalogPageQuery(query: "folder", take: 1);
        var first = Build(new[] { hit, hidden }, query);
        Assert.IsTrue(first.Success);
        Assert.AreEqual(1, first.TotalCount);
        var changedRows = new[]
        {
            Entry("changed-id", hidden.Title, hidden.Description, hidden.Icon, hidden.EditVersion, hidden.ActionType, hidden.CallIdentifier),
            Entry(hidden.Id, "Changed title", hidden.Description, hidden.Icon, hidden.EditVersion, hidden.ActionType, hidden.CallIdentifier),
            Entry(hidden.Id, hidden.Title, "changed description", hidden.Icon, hidden.EditVersion, hidden.ActionType, hidden.CallIdentifier),
            Entry(hidden.Id, hidden.Title, hidden.Description, "fa:Light_Flask", hidden.EditVersion, hidden.ActionType, hidden.CallIdentifier),
            Entry(hidden.Id, hidden.Title, hidden.Description, hidden.Icon, "8", hidden.ActionType, hidden.CallIdentifier),
            Entry(hidden.Id, hidden.Title, hidden.Description, hidden.Icon, hidden.EditVersion, "LinkAction", hidden.CallIdentifier),
            Entry(hidden.Id, hidden.Title, hidden.Description, hidden.Icon, hidden.EditVersion, hidden.ActionType, "Global:changed"),
        };
        foreach (var changed in changedRows)
        {
            var response = Build(new[] { hit, changed }, new(query: "folder", take: 1, expectedSnapshotId: first.SnapshotId));
            Assert.IsFalse(response.Success);
            Assert.AreEqual("CATALOG_CHANGED", response.ErrorCode);
            Assert.AreEqual(0, response.Items.Count);
            Assert.IsNull(response.SnapshotId);
        }
    }

    [TestMethod]
    public void Host_session_lifecycle_account_and_observation_revision_cannot_reuse_a_snapshot()
    {
        var rows = new[] { Entry("id-a") };
        var first = Build(rows);
        foreach (var identity in new[] { Identity(instance: "other"), Identity(session: "other"), Identity(owner: "other"),
            Identity(account: "other"), Identity(revision: 2) })
        {
            var response = Build(rows, new(expectedSnapshotId: first.SnapshotId), identity);
            Assert.IsFalse(response.Success);
            Assert.AreEqual("CATALOG_CHANGED", response.ErrorCode);
        }
        // The account may return to the same id; an observed Sync still invalidates the old page sequence.
        var afterAba = Build(rows, new(expectedSnapshotId: first.SnapshotId), Identity(revision: 3));
        Assert.AreEqual("CATALOG_CHANGED", afterAba.ErrorCode);
        var otherKind = Build(rows, new(expectedSnapshotId: first.SnapshotId), kind: QuickerRpcResourceCatalogKinds.GlobalSubProgram);
        Assert.AreEqual("CATALOG_CHANGED", otherKind.ErrorCode);
    }

    [TestMethod]
    public void Query_searches_raw_summary_fields_and_binds_the_complete_filter_to_the_snapshot()
    {
        var rows = new[] { Entry("1", "Folder"), Entry("2", "文件夹", description: "Folder resource"),
            Entry("3", "Other", callIdentifier: "Global:Folder"), Entry("4", "Unrelated") };
        var first = Build(rows, new(query: " folder ", take: 2));
        Assert.IsTrue(first.Success);
        Assert.AreEqual("folder", first.Query);
        Assert.AreEqual(3, first.TotalCount);
        Assert.IsTrue(first.HasMore);
        var rest = Build(rows, new(query: "folder", skip: 2, take: 2, expectedSnapshotId: first.SnapshotId));
        Assert.IsTrue(rest.Success);
        Assert.AreEqual(1, rest.Items.Count);
        Assert.IsFalse(rest.HasMore);
        Assert.AreEqual(1, Build(rows, new(query: "文件夹")).TotalCount);
        Assert.AreEqual("CATALOG_CHANGED", Build(rows, new(query: "unrelated", expectedSnapshotId: first.SnapshotId)).ErrorCode);
    }

    [TestMethod]
    public void True_empty_and_outside_windows_keep_complete_counts_without_int32_overflow()
    {
        var empty = Build(Array.Empty<ResourceCatalogEntry>(), new(skip: -9, take: 0));
        Assert.IsTrue(empty.Success);
        Assert.AreEqual(0, empty.Skip);
        Assert.AreEqual(500, empty.Take);
        Assert.AreEqual(0, empty.TotalCount);
        Assert.AreEqual(0, empty.Items.Count);
        Assert.IsFalse(empty.HasMore);
        Assert.IsNotNull(empty.SnapshotId);
        var rows = new[] { Entry("1"), Entry("2") };
        var first = Build(rows);
        var outside = Build(rows, new(skip: int.MaxValue, take: int.MaxValue, expectedSnapshotId: first.SnapshotId));
        Assert.IsTrue(outside.Success);
        Assert.AreEqual(500, outside.Take);
        Assert.AreEqual(2, outside.TotalCount);
        Assert.AreEqual(0, outside.Items.Count);
        Assert.IsFalse(outside.HasMore);
    }

    [TestMethod]
    public void Invalid_requests_and_missing_later_page_snapshot_do_not_read_the_supplied_catalog()
    {
        var unreadable = new UnreadableCatalog();
        var later = Build(unreadable, new(skip: 1));
        Assert.IsFalse(later.Success);
        Assert.AreEqual("SNAPSHOT_REQUIRED", later.ErrorCode);
        foreach (var bad in new[] { Build(unreadable, new(scope: "draft")), Build(unreadable, kind: "unknown") })
        {
            Assert.IsFalse(bad.Success);
            Assert.AreEqual("INVALID_RESOURCE_CATALOG_REQUEST", bad.ErrorCode);
        }
        Assert.IsFalse(ResourceCatalogPage.TryNormalizeQuery("action", new(skip: 7), out _, out var code, out _));
        Assert.AreEqual("SNAPSHOT_REQUIRED", code);
    }

    [TestMethod]
    public void Missing_identity_and_malformed_entries_never_become_a_successful_partial_or_empty_page()
    {
        var badContext = Build(new UnreadableCatalog(), identity: Identity(account: ""));
        Assert.IsFalse(badContext.Success);
        Assert.AreEqual("CATALOG_CONTEXT_UNAVAILABLE", badContext.ErrorCode);
        foreach (var invalid in new ResourceCatalogEntry[] { Entry(""), Entry("missing-version", version: " \t"), null! })
        {
            var result = Build(new[] { Entry("a", "first"), invalid }, new(take: 1));
            Assert.IsFalse(result.Success);
            Assert.AreEqual("CATALOG_INVALID", result.ErrorCode);
            Assert.AreEqual(0, result.Items.Count);
            Assert.IsNull(result.SnapshotId);
        }
    }

    [TestMethod]
    public void Cancellation_before_and_during_copy_preserves_the_original_token_and_returns_no_page()
    {
        using var before = new CancellationTokenSource();
        before.Cancel();
        var pre = Assert.ThrowsException<OperationCanceledException>(() => Build(new UnreadableCatalog(), cancellationToken: before.Token));
        Assert.AreEqual(before.Token, pre.CancellationToken);
        using var during = new CancellationTokenSource();
        ResourceCatalogPageResult? delivered = null;
        var source = new CancelDuringCopyCatalog(new[] { Entry("a"), Entry("b"), Entry("c") }, during);
        var middle = Assert.ThrowsException<OperationCanceledException>(() => delivered = Build(source, cancellationToken: during.Token));
        Assert.AreEqual(during.Token, middle.CancellationToken);
        Assert.IsNull(delivered);
        Assert.AreEqual(2, source.Reads);
    }

    [TestMethod]
    public void A_returned_page_is_detached_and_cannot_be_rewritten_through_the_input_collection()
    {
        var source = new List<ResourceCatalogEntry> { Entry("original", "Original") };
        var page = Build(source);
        var snapshot = page.SnapshotId;
        source[0] = Entry("changed", "Changed");
        source.Clear();
        Assert.AreEqual("original", page.Items[0].Id);
        Assert.AreEqual("Original", page.Items[0].Title);
        Assert.AreEqual(snapshot, page.SnapshotId);
        Assert.ThrowsException<NotSupportedException>(() => ((IList<ResourceCatalogEntry>)page.Items)[0] = Entry("replacement"));
    }

    [TestMethod]
    public void Fingerprint_preserves_field_boundaries_and_nullable_fields_without_lossy_unicode_replacement()
    {
        var first = Build(new[] { Entry("id", "a", "bc", actionType: null) });
        var boundary = Build(new[] { Entry("id", "ab", "c", actionType: null) });
        var emptyOptional = Build(new[] { Entry("id", "a", "bc", actionType: "") });
        Assert.IsTrue(first.Success);
        Assert.AreNotEqual(first.SnapshotId, boundary.SnapshotId);
        Assert.AreNotEqual(first.SnapshotId, emptyOptional.SnapshotId);
        Assert.AreNotEqual(Build(new[] { Entry("id") }, identity: Identity(instance: "a", session: "bc")).SnapshotId,
            Build(new[] { Entry("id") }, identity: Identity(instance: "ab", session: "c")).SnapshotId);
        var invalid = Build(new[] { Entry("id", "\uD800") });
        Assert.IsFalse(invalid.Success);
        Assert.AreEqual("CATALOG_INVALID", invalid.ErrorCode);
        Assert.IsNull(invalid.SnapshotId);
    }

    [TestMethod]
    public void Signed_int64_version_strings_and_native_icon_literals_survive_domain_and_wire_projection()
    {
        foreach (var version in new[] { "9223372036854775807", "-9223372036854775808", "0" })
        {
            var page = Build(new[] { Entry("id", version: version) });
            Assert.IsTrue(page.Success);
            Assert.AreEqual(version, page.Items[0].EditVersion);
            var wire = new QuickerRpcResourceCatalogItem { Id = page.Items[0].Id, EditVersion = page.Items[0].EditVersion, Icon = page.Items[0].Icon };
            using var json = JsonDocument.Parse(JsonSerializer.Serialize(wire, new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase }));
            Assert.AreEqual(JsonValueKind.String, json.RootElement.GetProperty("editVersion").ValueKind);
            Assert.AreEqual(version, json.RootElement.GetProperty("editVersion").GetString());
            Assert.AreEqual("fa:Light_Folder:#80112233", json.RootElement.GetProperty("icon").GetString());
        }
    }

    private sealed class UnreadableCatalog : IReadOnlyList<ResourceCatalogEntry>
    {
        public int Count => throw new AssertFailedException("The catalog must not be read.");
        public ResourceCatalogEntry this[int index] => throw new AssertFailedException("The catalog must not be read.");
        public IEnumerator<ResourceCatalogEntry> GetEnumerator() => throw new AssertFailedException("The catalog must not be read.");
        IEnumerator IEnumerable.GetEnumerator() => GetEnumerator();
    }

    private sealed class CancelDuringCopyCatalog : IReadOnlyList<ResourceCatalogEntry>
    {
        private readonly IReadOnlyList<ResourceCatalogEntry> _source;
        private readonly CancellationTokenSource _cancel;
        public CancelDuringCopyCatalog(IReadOnlyList<ResourceCatalogEntry> source, CancellationTokenSource cancel) { _source = source; _cancel = cancel; }
        public int Reads { get; private set; }
        public int Count => _source.Count;
        public ResourceCatalogEntry this[int index] { get { Reads++; if (Reads == 2) _cancel.Cancel(); return _source[index]; } }
        public IEnumerator<ResourceCatalogEntry> GetEnumerator() => _source.GetEnumerator();
        IEnumerator IEnumerable.GetEnumerator() => GetEnumerator();
    }
}
