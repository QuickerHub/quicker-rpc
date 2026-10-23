using System.Reflection;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using QuickerRpc.AgentModel.XAction.Source;
using QuickerRpc.Contracts.Rpc;
using QuickerRpc.Plugin.V2.Reflection;
using QuickerRpc.Plugin.V2.Services;

namespace QuickerRpc.Runtime.Test;

/// <summary>Real adapter and codec, fake native repositories. Never resolves host DI or user data.</summary>
[TestClass]
public sealed class V2ActionSourceTests
{
    internal const string ActionId = "1a495340-1247-4a1e-886d-2e807ec9db45";

    [TestMethod]
    public void Native_readonly_and_nested_numeric_extensions_remain_exact_when_only_note_changes()
    {
        var fixture = new Fixture();
        const string exact = "[0.123456789012345678901,9223372036854775807,1.2300e+123,1e999,-0]";
        var document = LosslessProgramJson.ParseObject(fixture.Catalog.Item.ItemDataJson!);
        document["futureNumericRoot"] = new JRaw(exact);
        document["operationPayload"]!["futureRoot"]!["numbers"] = new JRaw(exact);
        document["operationPayload"]!["Steps"]![0]!["futureNumbers"] = new JRaw(exact);
        document["operationPayload"]!["SubPrograms"]![0]!["futureNumbers"] = new JRaw(exact);
        fixture.Catalog.Item.ItemDataJson = document.ToString(Formatting.None);
        var read = fixture.Read();
        Assert.IsTrue(read.Success, read.ErrorMessage);
        StringAssert.Contains(read.BodyJson!, "0.123456789012345678901");
        var body = LosslessProgramJson.ParseObject(read.BodyJson!);
        body["Steps"]![0]!["Note"] = "only note changed";
        var result = fixture.Save(read, body);
        Assert.IsTrue(result.Success, result.ErrorMessage);
        var stored = LosslessProgramJson.ParseObject(fixture.Catalog.Item.ItemDataJson!);
        Assert.AreEqual(exact, stored["futureNumericRoot"]!.ToString(Formatting.None));
        Assert.AreEqual(exact, stored["operationPayload"]!["futureRoot"]!["numbers"]!.ToString(Formatting.None));
        Assert.AreEqual(exact, stored["operationPayload"]!["Steps"]![0]!["futureNumbers"]!.ToString(Formatting.None));
        Assert.AreEqual(exact, stored["operationPayload"]!["SubPrograms"]![0]!["futureNumbers"]!.ToString(Formatting.None));
        Assert.AreEqual(1, fixture.Catalog.Writes);
    }

    [TestMethod]
    public void Catalog_native_yaml_edit_save_reread_preserves_unknown_fields_nested_programs_and_strings()
    {
        var fixture = new Fixture();
        var read = fixture.Read();
        Assert.IsTrue(read.Success, read.ErrorMessage);
        Assert.AreEqual("catalog", read.StorageIdentity!.Kind);
        var original = Parse(read.BodyJson!);
        var wire = V1ProgramSourceCodec.FromNative(original);
        ProgramSourceCodec.RequireLosslessRoundtrip(wire);
        var yaml = ProgramSourceCodec.Encode(wire);
        wire = ProgramSourceCodec.Decode(yaml);
        wire["steps"]![0]!["inputs"]!["script"] = "changed\nreturn 2;";
        var updated = V1ProgramSourceCodec.ToNative(wire, original);
        var result = fixture.Save(read, updated);
        Assert.IsTrue(result.Success, result.ErrorMessage);
        Assert.AreEqual(true, result.Persisted);
        Assert.IsTrue(result.EditVersion > read.EditVersion);
        Assert.AreEqual(1, fixture.Catalog.Writes);
        Assert.AreEqual(1, fixture.Policy.Calls);
        Assert.AreEqual(1, fixture.Refreshes);
        var after = fixture.Read();
        Assert.IsTrue(JToken.DeepEquals(updated, Parse(after.BodyJson!)));
        Assert.AreEqual("keep-row-metadata", fixture.Catalog.Item.MetadataJson);
        var stored = Parse(fixture.Catalog.Item.ItemDataJson!);
        Assert.AreEqual("keep-action-root", stored["futureAction"]!.Value<string>());
        Assert.AreEqual("return 未来;", stored["operationPayload"]!["futureRoot"]!["code"]!.Value<string>());
        Assert.AreEqual("2030-01-01T10:20:30+09:00", stored["operationPayload"]!["Variables"]![0]!["DefaultValue"]!.Value<string>());
        Assert.AreEqual("keep-parameter", stored["operationPayload"]!["Steps"]![0]!["InputParams"]!["script"]!["future"]!.Value<string>());
        var second = Parse(after.BodyJson!);
        second["Steps"]![0]!["Note"] = "second save";
        Assert.IsTrue(fixture.Save(after, second).Success);
        Assert.AreEqual(2, fixture.Catalog.Writes);
    }

    [TestMethod]
    public void Draft_roundtrip_uses_exact_draft_version_and_never_writes_catalog()
    {
        var fixture = new Fixture();
        fixture.Drafts.Current = new Draft { ActionJson = fixture.Catalog.Item.ItemDataJson! };
        var read = fixture.Read();
        Assert.AreEqual("draft", read.ReadSource);
        Assert.AreEqual(3L, read.EditVersion);
        var result = fixture.Save(read, Changed(read));
        Assert.IsTrue(result.Success, result.ErrorMessage);
        Assert.AreEqual(4L, result.EditVersion);
        Assert.AreEqual("draft-fixture", result.StorageIdentity!.DraftId);
        Assert.AreEqual(0, fixture.Catalog.Writes);
        Assert.AreEqual(1, fixture.Drafts.Writes);
        Assert.AreEqual(0, fixture.Refreshes);
        Assert.AreEqual("keep-action-root", Parse(fixture.Drafts.Current.ActionJson)["futureAction"]!.Value<string>());
    }

    [TestMethod]
    public void Concurrent_catalog_change_with_same_edit_timestamp_is_still_blocked_by_native_change_token()
    {
        var fixture = new Fixture();
        var read = fixture.Read();
        fixture.Catalog.BeforeWrite = () => fixture.Catalog.Item.ChangeToken = "concurrent-token";
        var result = fixture.Save(read, Changed(read));
        Assert.AreEqual("VERSION_CONFLICT", result.ErrorCode);
        Assert.AreEqual(false, result.Persisted);
        Assert.AreEqual(0, fixture.Catalog.Writes);
        Assert.AreEqual(0, fixture.Refreshes);
    }

    [TestMethod]
    public void Stale_version_missing_identity_and_changed_storage_identity_are_refused_even_with_force()
    {
        var fixture = new Fixture();
        var read = fixture.Read();
        var stale = new QuickerRpcGetActionProgramSourceResult { EditVersion = 0, StorageIdentity = new() { Version = 0 } };
        Assert.AreEqual("VERSION_CONFLICT", fixture.Save(stale, Changed(read)).ErrorCode);
        Assert.AreEqual("STORAGE_IDENTITY_REQUIRED", fixture.Service.Apply(ActionId, read.BodyJson!, read.EditVersion, true, null, default).ErrorCode);
        fixture.Drafts.Current = new Draft { ActionJson = fixture.Catalog.Item.ItemDataJson! };
        Assert.AreEqual("STORAGE_IDENTITY_MISMATCH", fixture.Save(read, Changed(read), force: true).ErrorCode);
        var draftRead = fixture.Read();
        fixture.Drafts.Current.DraftId = "replacement-draft";
        Assert.AreEqual("STORAGE_IDENTITY_MISMATCH", fixture.Save(draftRead, Changed(draftRead), force: true).ErrorCode);
        Assert.AreEqual(0, fixture.Catalog.Writes + fixture.Drafts.Writes);
    }

    [TestMethod]
    public void Draft_race_returns_version_conflict_without_replaying_or_writing_catalog()
    {
        var fixture = new Fixture();
        fixture.Drafts.Current = new Draft { ActionJson = fixture.Catalog.Item.ItemDataJson! };
        var read = fixture.Read();
        fixture.Drafts.BeforeWrite = () => fixture.Drafts.Current.CurrentVersion++;
        var result = fixture.Save(read, Changed(read));
        Assert.AreEqual("VERSION_CONFLICT", result.ErrorCode);
        Assert.AreEqual(false, result.Persisted);
        Assert.AreEqual(0, fixture.Catalog.Writes + fixture.Drafts.Writes);
    }

    [TestMethod]
    public void Unchanged_draft_save_keeps_native_history_version_and_timestamp()
    {
        var fixture = new Fixture();
        fixture.Drafts.Current = new Draft { ActionJson = fixture.Catalog.Item.ItemDataJson! };
        var read = fixture.Read();
        var json = fixture.Drafts.Current.ActionJson;
        var result = fixture.Save(read, Parse(read.BodyJson!));
        Assert.IsTrue(result.Success, result.ErrorMessage);
        Assert.AreEqual(3L, result.EditVersion);
        Assert.AreEqual(json, fixture.Drafts.Current.ActionJson);
        Assert.AreEqual(0, fixture.Drafts.Writes);
    }

    [TestMethod]
    public void Snapshot_hash_detects_change_between_open_and_apply_with_same_timestamp()
    {
        var fixture = new Fixture();
        var read = fixture.Read();
        var current = Parse(fixture.Catalog.Item.ItemDataJson!);
        current["operationPayload"]!["Steps"]![0]!["Note"] = "external edit, same timestamp";
        fixture.Catalog.Item.ItemDataJson = current.ToString(Formatting.None);
        var result = fixture.Save(read, Changed(read));
        Assert.AreEqual("VERSION_CONFLICT", result.ErrorCode);
        Assert.AreEqual(0, fixture.Catalog.Writes);
    }

    [TestMethod]
    public void Native_notification_sequence_refreshes_index_publishes_and_notifies_before_sync()
    {
        foreach (var throwOnPublish in new[] { false, true })
        {
            var events = new List<string>();
            var lookup = new V2ActionEditingGuardTests.FakeLookup();
            var store = new V2ActionEditingGuardTests.FakeStore(events);
            var accessor = new QuickerV2ActionAccessor(lookup, lookup.GetType().GetMethods().Single(m => m.Name == "GetActionWithLocationByIdOrNameOrSourceId"),
                null, store, store.GetType().GetMethod("AddOrUpdateAction")!, null, null,
                typeof(V2ActionEditingGuardTests.FakeExtensions), typeof(V2ActionEditingGuardTests.FakeAction));
            var commands = new Commands(events) { ThrowOnPublish = throwOnPublish };
            var messenger = new Messenger(events);
            var refresh = QuickerV2SourceStorage.CreateCatalogRefresh(accessor, commands,
                typeof(Commands).GetMethod("PublishActions", BindingFlags.Instance | BindingFlags.NonPublic)!,
                messenger, typeof(Hub).GetMethod(nameof(Hub.NotifyActionUpdated))!, () => events.Add("sync"));
            if (throwOnPublish) Assert.ThrowsException<AggregateException>(() => refresh(ActionId, Document()));
            else refresh(ActionId, Document());
            CollectionAssert.AreEqual(new[] { "persist", "publish", "notify", "sync" }, events);
            Assert.AreEqual(1, store.Saves); // This is only the in-memory index; storage already committed.
        }
    }

    public sealed class Commands(List<string> events)
    {
        public bool ThrowOnPublish { get; set; }
        private void PublishActions(Guid id)
        { events.Add("publish"); if (ThrowOnPublish) throw new IOException("subscriber failed"); }
    }
    public sealed class Messenger(List<string> events) { public List<string> Events { get; } = events; }
    public static class Hub { public static void NotifyActionUpdated(Messenger messenger, Guid id) => messenger.Events.Add("notify"); }

    [TestMethod]
    public void Designer_open_unknown_or_opened_during_validation_never_persists_even_with_force()
    {
        foreach (var state in new[] { "open", "unknown", "late-open" })
        {
            var fixture = new Fixture(editingKnown: state != "unknown");
            var read = fixture.Read();
            fixture.Editing.Open = state == "open";
            fixture.Editing.OpenOnSecond = state == "late-open";
            fixture.Editing.Calls = 0;
            var result = fixture.Save(read, Changed(read), force: true);
            Assert.AreEqual(state == "unknown" ? "DESIGNER_STATE_UNAVAILABLE" : "DESIGNER_OPEN", result.ErrorCode);
            Assert.AreEqual(false, result.Persisted);
            Assert.AreEqual(0, fixture.Catalog.Writes + fixture.Drafts.Writes);
        }
    }

    [TestMethod]
    public void Cancellation_before_read_or_immediately_before_commit_is_propagated_without_writes()
    {
        var fixture = new Fixture();
        var read = fixture.Read();
        using var cts = new CancellationTokenSource();
        cts.Cancel();
        Assert.ThrowsException<OperationCanceledException>(() => fixture.Service.Get(ActionId, cts.Token));
        Assert.ThrowsException<OperationCanceledException>(() => fixture.Save(read, Changed(read), token: cts.Token));
        using var beforeCommit = new CancellationTokenSource();
        fixture.Policy.BeforeClassify = beforeCommit.Cancel;
        Assert.ThrowsException<OperationCanceledException>(() => fixture.Save(read, Changed(read), token: beforeCommit.Token));
        Assert.AreEqual(0, fixture.Catalog.Writes);
    }

    [TestMethod]
    public void Cancellation_after_commit_returns_persisted_result_and_warning()
    {
        using var cts = new CancellationTokenSource();
        var fixture = new Fixture { AfterRefresh = cts.Cancel };
        var read = fixture.Read();
        var result = fixture.Save(read, Changed(read), token: cts.Token);
        Assert.IsTrue(result.Success, result.ErrorMessage);
        Assert.AreEqual(true, result.Persisted);
        Assert.AreEqual(1, result.Warnings.Count);
        Assert.AreEqual(1, fixture.Catalog.Writes);
    }

    [TestMethod]
    public void Commit_followed_by_refresh_readback_or_repository_notification_failure_reports_partial_persistence()
    {
        foreach (var failure in new[] { "refresh", "readback", "repository", "draft-notification", "draft-result" })
        {
            var fixture = new Fixture();
            if (failure.StartsWith("draft", StringComparison.Ordinal)) fixture.Drafts.Current = new Draft { ActionJson = fixture.Catalog.Item.ItemDataJson! };
            var read = fixture.Read();
            if (failure == "refresh") fixture.AfterRefresh = () => throw new IOException("fixture refresh");
            if (failure == "readback") fixture.AfterRefresh = () => fixture.Catalog.ThrowOnRead = true;
            if (failure == "repository") fixture.Catalog.ThrowAfterCommit = true;
            if (failure == "draft-notification") fixture.Drafts.ThrowAfterCommit = true;
            if (failure == "draft-result") fixture.Drafts.CorruptReturnedIdentity = true;
            var result = fixture.Save(read, Changed(read));
            Assert.IsFalse(result.Success);
            Assert.AreEqual(true, result.Persisted, failure + ": " + result.ErrorMessage);
            Assert.IsNotNull(result.EditVersion);
            Assert.AreEqual(failure == "readback" ? "SOURCE_READBACK_FAILED" : "SOURCE_POST_COMMIT_FAILED", result.ErrorCode);
            Assert.AreEqual(1, fixture.Catalog.Writes + fixture.Drafts.Writes);
        }
    }

    [TestMethod]
    public void Uncertain_write_is_explicit_and_is_not_retried()
    {
        var fixture = new Fixture();
        var read = fixture.Read();
        fixture.Catalog.ThrowBeforeCommit = true;
        var result = fixture.Save(read, Changed(read));
        Assert.AreEqual("SOURCE_WRITE_RESULT_UNKNOWN", result.ErrorCode);
        Assert.IsNull(result.Persisted);
        Assert.AreEqual(1, fixture.Catalog.Attempts);
        Assert.AreEqual(0, fixture.Catalog.Writes);
    }

    [TestMethod]
    public void Invalid_native_payload_readonly_root_duplicate_fields_and_readonly_action_are_rejected()
    {
        var fixture = new Fixture();
        var read = fixture.Read();
        var bad = Changed(read);
        bad["Steps"]![0]!["DelayMs"] = "invalid-int";
        Assert.AreEqual("INVALID_PROGRAM", fixture.Save(read, bad).ErrorCode);
        bad = Changed(read); bad["SummaryExpression"] = "cannot change root";
        Assert.AreEqual("SOURCE_FIELD_READ_ONLY", fixture.Save(read, bad).ErrorCode);
        Assert.AreEqual("INVALID_PROGRAM", fixture.Service.Apply(ActionId, "{\"Steps\":[],\"Steps\":[],\"Variables\":[]}", read.EditVersion, false, read.StorageIdentity, default).ErrorCode);
        var document = Parse(fixture.Catalog.Item.ItemDataJson!); document["userLimitation"] = 2;
        fixture.Catalog.Item.ItemDataJson = document.ToString(Formatting.None);
        Assert.AreEqual("ACTION_READ_ONLY", fixture.Save(read, Changed(read), force: true).ErrorCode);
        Assert.AreEqual(0, fixture.Catalog.Writes);
    }

    [TestMethod]
    public void Draft_lookup_failure_never_falls_back_to_catalog_and_unavailable_adapter_does_not_claim_success()
    {
        var fixture = new Fixture();
        fixture.Drafts.ThrowOnRead = true;
        Assert.AreEqual("SOURCE_READ_FAILED", fixture.Read().ErrorCode);
        Assert.AreEqual(0, fixture.Catalog.Reads);
        var unavailable = new V2ActionProgramSourceService(() => null);
        Assert.IsFalse(unavailable.IsAvailable);
        Assert.AreEqual("UNSUPPORTED_HOST", unavailable.Get(ActionId, default).ErrorCode);
    }

    internal static JObject Parse(string json)
    {
        using var reader = new JsonTextReader(new StringReader(json)) { DateParseHandling = DateParseHandling.None, MaxDepth = 256 };
        return JObject.Load(reader);
    }
    private static JObject Changed(QuickerRpcGetActionProgramSourceResult read)
    { var body = Parse(read.BodyJson!); body["Steps"]![0]!["Note"] = "changed"; return body; }

    [TestMethod]
    public void Deep_native_branch_over_64_json_levels_roundtrips_through_shared_codec()
    {
        var fixture = new Fixture();
        var document = Parse(fixture.Catalog.Item.ItemDataJson!);
        var step = (JObject)document["operationPayload"]!["Steps"]![0]!;
        for (var i = 0; i < 36; i++)
        {
            var nested = new JObject { ["StepRunnerKey"] = "sys:if", ["InputParams"] = new JObject(), ["future"] = i };
            step["IfSteps"] = new JArray(nested); step = nested;
        }
        fixture.Catalog.Item.ItemDataJson = document.ToString(Formatting.None);
        var read = fixture.Read();
        Assert.IsTrue(read.Success, read.ErrorMessage);
        Assert.IsTrue(fixture.Save(read, Changed(read)).Success);
    }

    internal sealed class Fixture
    {
        internal Catalog Catalog { get; } = new();
        internal Drafts Drafts { get; } = new();
        internal Policy Policy { get; } = new();
        internal Editing Editing { get; } = new();
        internal int Refreshes { get; private set; }
        internal Action? AfterRefresh { get; set; }
        internal V2ActionProgramSourceService Service { get; }
        internal Fixture(bool editingKnown = true, Type? payloadType = null)
        {
            var lookup = new V2ActionEditingGuardTests.FakeLookup();
            var index = new V2ActionEditingGuardTests.FakeStore([]);
            var accessor = new QuickerV2ActionAccessor(lookup, lookup.GetType().GetMethods().Single(m => m.Name == "GetActionWithLocationByIdOrNameOrSourceId"),
                null, index, index.GetType().GetMethod("AddOrUpdateAction")!, editingKnown ? Editing : null,
                typeof(Editing).GetMethod("IsActionEditing"), typeof(V2ActionEditingGuardTests.FakeExtensions), typeof(V2ActionEditingGuardTests.FakeAction), () => throw new AssertFailedException("Source must use native persistence, not the old save path."));
            var storage = new QuickerV2SourceStorage(Catalog, typeof(Catalog), Drafts, typeof(Drafts), Policy, payloadType ?? typeof(NativePayload), accessor,
                (_, _) => { Refreshes++; AfterRefresh?.Invoke(); });
            Service = new(() => storage);
        }
        internal QuickerRpcGetActionProgramSourceResult Read() => Service.Get(ActionId, default);
        internal QuickerRpcApplyXActionResult Save(QuickerRpcGetActionProgramSourceResult read, JObject body, bool force = false, CancellationToken token = default) =>
            Service.Apply(ActionId, body.ToString(Formatting.None), read.EditVersion, force, read.StorageIdentity, token);
    }
    public sealed class Editing
    {
        public bool Open { get; set; }
        public bool OpenOnSecond { get; set; }
        public int Calls { get; set; }
        public bool IsActionEditing(string id) => Open || (OpenOnSecond && ++Calls >= 2);
    }
    public enum State { Pending }
    public sealed class Item
    {
        public string ItemType { get; set; } = "Action";
        public string ItemId { get; set; } = ActionId;
        public bool IsDeleted { get; set; }
        public string ChangeToken { get; set; } = "baseline-token";
        public string MetadataJson { get; set; } = "keep-row-metadata";
        public string? ItemDataJson { get; set; } = Document();
        public DateTime LocalModifiedTimeUtc { get; set; }
        public State SyncState { get; set; }
        public string? SyncErrorCode { get; set; }
        public string? SyncErrorMessage { get; set; }
    }
    public sealed class Catalog
    {
        public Item Item { get; set; } = new();
        public int Writes { get; private set; }
        public int Attempts { get; private set; }
        public int Reads { get; private set; }
        public Action? BeforeWrite { get; set; }
        public bool ThrowOnRead { get; set; }
        public bool ThrowAfterCommit { get; set; }
        public bool ThrowBeforeCommit { get; set; }
        public Item GetItem(string id)
        {
            Reads++;
            if (ThrowOnRead) throw new IOException("fixture readback");
            return JsonConvert.DeserializeObject<Item>(JsonConvert.SerializeObject(Item))!;
        }
        public bool TryUpsertLocalItemIfUnchanged(Item expected, Item replacement)
        {
            Attempts++; BeforeWrite?.Invoke();
            if (ThrowBeforeCommit) throw new IOException("fixture unavailable");
            if (Item.ChangeToken != expected.ChangeToken) return false;
            Item = replacement; Writes++;
            if (ThrowAfterCommit) throw new IOException("fixture committed notification");
            return true;
        }
    }
    public sealed class Draft
    {
        public string ActionId { get; set; } = V2ActionSourceTests.ActionId;
        public string DraftId { get; set; } = "draft-fixture";
        public long CurrentVersion { get; set; } = 3;
        public string ActionJson { get; set; } = Document();
    }
    public sealed record DraftWrite(string Status, Draft? Draft);
    public sealed class Drafts
    {
        public Draft? Current { get; set; }
        public int Writes { get; private set; }
        public bool ThrowOnRead { get; set; }
        public bool ThrowAfterCommit { get; set; }
        public bool CorruptReturnedIdentity { get; set; }
        public Action? BeforeWrite { get; set; }
        public Draft? GetDraftByActionId(string id) => ThrowOnRead ? throw new IOException("fixture strict draft lookup") : Current;
        public Draft? GetDraft(string id) => Current?.DraftId == id ? Current : null;
        public DraftWrite TrySave(string id, int version, string json, string? title, string? summary)
        {
            BeforeWrite?.Invoke();
            if (Current?.DraftId != id) return new("NotFound", null);
            if (Current.CurrentVersion != version) return new("Conflict", Current);
            Current = new() { DraftId = id, CurrentVersion = version + 1, ActionJson = json }; Writes++;
            if (ThrowAfterCommit) throw new IOException("fixture committed draft notification");
            return new("Updated", CorruptReturnedIdentity ? new Draft { ActionId = Guid.NewGuid().ToString("D"), ActionJson = json } : Current);
        }
    }
    public sealed class Policy
    {
        public int Calls { get; private set; }
        public Action? BeforeClassify { get; set; }
        public void ClassifyLocalItem(Item item) { Calls++; BeforeClassify?.Invoke(); }
    }
    public sealed class NativePayload { public List<NativeStep> Steps { get; set; } = []; }
    public sealed class NativeStep { public int DelayMs { get; set; } }
    internal static string Document() => """
        {"id":"1a495340-1247-4a1e-886d-2e807ec9db45","operationType":"xaction","useSource":false,
         "presentation":{"title":"fixture","futurePresentation":null},"metadata":{"lastEditTimeUtc":"2026-01-01T00:00:00.000Z"},
         "futureAction":"keep-action-root","operationPayload":{
           "PayloadType":"xaction","LimitSingleInstance":true,"SummaryExpression":"$$",
           "Steps":[{"StepRunnerKey":"sys:script","InputParams":{"script":{"Value":"line1\nline2\nline3\nline4\nline5","future":"keep-parameter"}},"Note":null,"futureStep":{"flag":true}}],
           "Variables":[{"Key":"dateText","Type":0,"DefaultValue":"2030-01-01T10:20:30+09:00","futureVariable":null}],
           "SubPrograms":[{"Id":"nested-fixture","Name":"nested","Variables":[],"Steps":[],"futureSub":[1,2,3],"SubPrograms":[{"Id":"nested-again","Variables":[],"Steps":[]}]}],
           "futureRoot":{"code":"return 未来;","empty":null}}}
        """;
}
