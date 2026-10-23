using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using QuickerRpc.Contracts.Rpc;
using QuickerRpc.Plugin.Services;

namespace QuickerRpc.Plugin.V2.Reflection;

/// <summary>
/// Native storage boundary. Read raw records, validate using host DTOs, and commit through the
/// host repositories' conditional APIs. Never reserialize a typed projection into storage.
/// </summary>
internal sealed class QuickerV2SourceStorage
{
    internal const string CatalogRepository = "Quicker.AccountData.ISyncV5LocalRepository";
    internal const string DraftRepository = "Quicker.Domain.Services.ActionDrafts.IActionDraftRepository";
    internal const string UploadPolicy = "Quicker.AccountData.SyncV5UploadPolicy";
    private readonly object _catalog;
    private readonly object _drafts;
    private readonly object _policy;
    private readonly MethodInfo _getItem;
    private readonly MethodInfo _conditionalWrite;
    private readonly MethodInfo _getDraft;
    private readonly MethodInfo _getDraftByActionId;
    private readonly MethodInfo _saveDraft;
    private readonly MethodInfo _classify;
    private readonly Type _payloadType;
    private readonly QuickerV2ActionAccessor _actions;
    private readonly Action<string, string> _afterCatalogCommit;

    internal QuickerV2SourceStorage(object catalog, Type catalogContract, object drafts, Type draftContract,
        object policy, Type payloadType, QuickerV2ActionAccessor actions, Action<string, string> afterCatalogCommit)
    {
        _catalog = catalog;
        _drafts = drafts;
        _policy = policy;
        _payloadType = payloadType;
        _actions = actions;
        _afterCatalogCommit = afterCatalogCommit;
        _getItem = Require(catalogContract, "GetItem", 1);
        _conditionalWrite = Require(catalogContract, "TryUpsertLocalItemIfUnchanged", 2);
        _getDraft = Require(draftContract, "GetDraft", 1);
        _getDraftByActionId = Require(draftContract, "GetDraftByActionId", 1);
        _saveDraft = Require(draftContract, "TrySave", 5);
        _classify = Require(policy.GetType(), "ClassifyLocalItem", 1);
        if (_conditionalWrite.ReturnType != typeof(bool)) throw new NotSupportedException("Native conditional write API is unavailable.");
    }

    internal static QuickerV2SourceStorage? TryCreate()
    {
        if (!QuickerV2Runtime.IsRunningInQuicker) return null;
        try
        {
            var catalogType = QuickerV2Runtime.ResolveType(CatalogRepository);
            var draftType = QuickerV2Runtime.ResolveType(DraftRepository);
            var policyType = QuickerV2Runtime.ResolveType(UploadPolicy);
            var payloadType = QuickerV2Runtime.ResolveType(QuickerV2TypeNames.XActionDto);
            var commandType = QuickerV2Runtime.ResolveType(QuickerV2TypeNames.ActionPageCommandService);
            var messengerType = QuickerV2Runtime.ResolveType("Quicker.Domain.Messages.IAppMessenger");
            var hubType = QuickerV2Runtime.ResolveType("Quicker.Domain.Messages.HubExtension");
            var actions = QuickerV2ActionAccessor.Current;
            if (catalogType is null || draftType is null || policyType is null || payloadType is null || commandType is null
                || messengerType is null || hubType is null || actions is null) return null;
            var catalog = QuickerV2Runtime.TryGetService(catalogType);
            var drafts = QuickerV2Runtime.TryGetService(draftType);
            var policy = QuickerV2Runtime.TryGetService(policyType);
            var commands = QuickerV2Runtime.TryGetService(commandType);
            var messenger = QuickerV2Runtime.TryGetService(messengerType);
            var notify = hubType.GetMethod("NotifyActionUpdated", BindingFlags.Static | BindingFlags.Public,
                null, [messengerType, typeof(Guid)], null);
            var publish = commandType.GetMethod("PublishActions", BindingFlags.Instance | BindingFlags.NonPublic,
                null, [typeof(Guid)], null);
            if (catalog is null || drafts is null || policy is null || commands is null || publish is null || messenger is null || notify is null) return null;
            return new(catalog, catalogType, drafts, draftType, policy, payloadType, actions,
                CreateCatalogRefresh(actions, commands, publish, messenger, notify, QuickerV2CloudSyncTrigger.TryTriggerAfterPersist));
        }
        catch (Exception) { return null; }
    }

    internal static Action<string, string> CreateCatalogRefresh(QuickerV2ActionAccessor actions, object commands,
        MethodInfo publish, object messenger, MethodInfo notify, Action triggerSync) => (id, json) =>
    {
        // Same native notification sequence as ActionPageCommandService, after durable CAS.
        // A failing subscriber must not prevent the other refresh/sync attempts.
        var failures = new List<Exception>();
        Attempt(() => actions.RefreshActionIndex(JsonConvert.DeserializeObject(json, actions.ActionItem2Type, JsonSettings)
            ?? throw new JsonException("Saved action could not be hydrated for runtime refresh.")));
        Attempt(() => publish.Invoke(commands, [Guid.Parse(id)]));
        Attempt(() => notify.Invoke(null, [messenger, Guid.Parse(id)]));
        Attempt(triggerSync);
        if (failures.Count > 0) throw new AggregateException(failures);
        void Attempt(Action action) { try { action(); } catch (Exception ex) { failures.Add(ex); } }
    };

    internal bool TryGetEditingState(string id, out bool editing, out string? error) =>
        _actions.TryGetActionEditingState(id, out editing, out error);

    internal Snapshot Read(string id)
    {
        var draft = _getDraftByActionId.Invoke(_drafts, [id]); // Strict: failures never fall through to catalog.
        if (draft is not null) return ReadDraft(id, draft);
        var item = _getItem.Invoke(_catalog, [id]);
        if (item is null || QuickerV2Reflection.ReadMember(item, "IsDeleted") is not false
            || QuickerV2Reflection.ReadString(item, "ItemType") != "Action")
            throw new SourceStorageException("ACTION_NOT_FOUND", "Native catalog action not found: " + id);
        var document = NativeActionProgramSourceBody.Parse(QuickerV2Reflection.ReadString(item, "ItemDataJson") ?? string.Empty);
        var version = EditVersion(document);
        return CreateSnapshot(id, document, new() { Kind = "catalog", Version = version }, item);
    }

    private static Snapshot ReadDraft(string id, object draft)
    {
        if (!SameId(id, QuickerV2Reflection.ReadString(draft, "ActionId")))
            throw new SourceStorageException("STORAGE_IDENTITY_MISMATCH", "Native draft action identity changed. Reopen the action.");
        var draftId = QuickerV2Reflection.ReadString(draft, "DraftId");
        if (string.IsNullOrWhiteSpace(draftId)) throw new JsonException("Native draft has no draftId.");
        var document = NativeActionProgramSourceBody.Parse(QuickerV2Reflection.ReadString(draft, "ActionJson") ?? string.Empty);
        return CreateSnapshot(id, document, new() { Kind = "draft", DraftId = draftId, Version = QuickerV2Reflection.ReadInt64(draft, "CurrentVersion") }, draft);
    }

    private static Snapshot CreateSnapshot(string id, JObject document, QuickerRpcActionStorageIdentity identity, object record)
    {
        if (!SameId(id, Field(document, "id")?.Value<string>()))
            throw new SourceStorageException("STORAGE_IDENTITY_MISMATCH", "Native action record does not match the requested action.");
        if (Field(document, "operationType")?.Value<string>() != "xaction" || Field(document, "operationPayload") is not JObject payload)
            throw new SourceStorageException("NOT_XACTION", "The stored action is not a native XAction.");
        if (Field(document, "useSource")?.Value<bool>() == true)
            throw new SourceStorageException("SOURCE_INHERITED_BODY_UNAVAILABLE", "Open the inherited action in Quicker and save a local body before source editing.");
        var body = (JObject)payload.DeepClone();
        foreach (var key in new[] { "steps", "variables", "subPrograms" })
        {
            var array = Field(body, key);
            if (array is null || array.Type == JTokenType.Null) Set(body, key, new JArray());
            else if (array is not JArray) throw new JsonException(key + " must be an array.");
        }
        identity.ContentHash = DocumentHash(document);
        return new(id, identity, document, body, record);
    }

    internal void Validate(JObject body)
    {
        // Validate against the REAL native DTO, but keep the raw JSON for persistence.
        _ = JsonConvert.DeserializeObject(body.ToString(Formatting.None), _payloadType, JsonSettings)
            ?? throw new JsonException("Native XAction payload is null.");
    }

    internal CommitResult Commit(Snapshot before, JObject body, CancellationToken token, Action commitStarting)
    {
        var document = (JObject)before.Document.DeepClone();
        Set(document, "operationPayload", body.DeepClone());
        var metadata = Field(document, "metadata") as JObject ?? new JObject();
        var now = DateTime.UtcNow;
        var nextVersion = Math.Max(new DateTimeOffset(now).ToUnixTimeMilliseconds(), EditVersion(before.Document) + 1);
        Set(metadata, "lastEditTimeUtc", new JValue(DateTimeOffset.FromUnixTimeMilliseconds(nextVersion).UtcDateTime.ToString("O")));
        Set(document, "metadata", metadata);
        var json = document.ToString(Formatting.None);
        token.ThrowIfCancellationRequested();
        // A draft can have appeared, disappeared, or been replaced since the initial read.
        var latest = Read(before.ActionId);
        if (!SameIdentity(before.Identity, latest.Identity))
            throw new SourceStorageException("STORAGE_IDENTITY_MISMATCH", "Action storage identity changed. Reopen the action.");
        if (before.Identity.Version != latest.Identity.Version)
            return new(false, false, latest.Identity, "VERSION_CONFLICT", "Action changed before native commit.");
        if (before.Identity.ContentHash != latest.Identity.ContentHash)
            return new(false, false, latest.Identity, "VERSION_CONFLICT", "Native snapshot changed before commit.");
        // A no-op must not consume the native draft's bounded version history.
        if (JToken.DeepEquals(before.Body, body)) return new(true, true, before.Identity);
        token.ThrowIfCancellationRequested();

        if (before.Identity.Kind == "draft")
        {
            var exact = _getDraft.Invoke(_drafts, [before.Identity.DraftId]);
            if (exact is null || !SameIdentity(before.Identity, ReadDraft(before.ActionId, exact).Identity))
                throw new SourceStorageException("STORAGE_IDENTITY_MISMATCH", "Draft was replaced. Reopen the action.");
            var presentation = Field(document, "presentation") as JObject;
            token.ThrowIfCancellationRequested();
            RequireClosedDesigner(before.ActionId);
            commitStarting();
            var result = _saveDraft.Invoke(_drafts, [before.Identity.DraftId, checked((int)before.Identity.Version), json,
                presentation is null ? null : Field(presentation, "title")?.Value<string>(), "保存程序内容 (qkrpc source)"])
                ?? throw new InvalidOperationException("Native draft repository omitted its result.");
            var status = QuickerV2Reflection.ReadString(result, "Status");
            var savedDraft = QuickerV2Reflection.ReadMember(result, "Draft");
            var identity = savedDraft is null ? before.Identity : ReadDraft(before.ActionId, savedDraft).Identity;
            return status switch
            {
                "Updated" or "NoChange" => new(true, true, identity),
                "Conflict" => new(false, false, identity, "VERSION_CONFLICT", "Draft changed during native commit."),
                _ => new(false, false, identity, "STORAGE_IDENTITY_MISMATCH", "Draft is no longer available. Reopen the action."),
            };
        }

        // Clone the repository row (not the typed action), preserving unknown action and row metadata.
        var replacement = typeof(object).GetMethod("MemberwiseClone", BindingFlags.Instance | BindingFlags.NonPublic)!.Invoke(before.Record, null)!;
        QuickerV2Reflection.WriteMember(replacement, "ItemDataJson", json);
        QuickerV2Reflection.WriteMember(replacement, "ChangeToken", Guid.NewGuid().ToString("D"));
        QuickerV2Reflection.WriteMember(replacement, "LocalModifiedTimeUtc", now);
        var syncState = replacement.GetType().GetProperty("SyncState") ?? throw new MissingMemberException("SyncState");
        syncState.SetValue(replacement, Enum.Parse(syncState.PropertyType, "Pending"));
        QuickerV2Reflection.WriteMember(replacement, "SyncErrorCode", null);
        QuickerV2Reflection.WriteMember(replacement, "SyncErrorMessage", null);
        _classify.Invoke(_policy, [replacement]);
        token.ThrowIfCancellationRequested();
        RequireClosedDesigner(before.ActionId);
        commitStarting();
        if (_conditionalWrite.Invoke(_catalog, [before.Record, replacement]) is not true)
            return new(false, false, Read(before.ActionId).Identity, "VERSION_CONFLICT", "Catalog changed during native commit.");
        var committed = new QuickerRpcActionStorageIdentity { Kind = "catalog", Version = nextVersion, ContentHash = DocumentHash(document) };
        try { _afterCatalogCommit(before.ActionId, json); }
        catch (Exception ex) { return new(false, true, committed, "SOURCE_POST_COMMIT_FAILED", "Native storage committed; runtime refresh failed: " + Message(ex)); }
        return new(true, true, committed);
    }

    private void RequireClosedDesigner(string id)
    {
        if (!TryGetEditingState(id, out var editing, out var error))
            throw new SourceStorageException("DESIGNER_STATE_UNAVAILABLE", error!);
        if (editing) throw new SourceStorageException("DESIGNER_OPEN", "Action Designer opened before native commit. Close it and re-read.");
    }

    internal static bool SameIdentity(QuickerRpcActionStorageIdentity a, QuickerRpcActionStorageIdentity b) =>
        a.Kind == b.Kind && a.DraftId == b.DraftId;
    private static bool SameId(string? a, string? b) => Guid.TryParse(a, out var left) && Guid.TryParse(b, out var right) && left == right;
    private static string DocumentHash(JObject document) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(document.ToString(Formatting.None))));
    internal static JToken? Field(JObject value, string name)
    {
        var matches = value.Properties().Where(p => string.Equals(p.Name, name, StringComparison.OrdinalIgnoreCase)).ToArray();
        if (matches.Length > 1) throw new JsonException("Ambiguous native field: " + name);
        return matches.FirstOrDefault()?.Value;
    }
    internal static void Set(JObject value, string name, JToken token)
    {
        _ = Field(value, name);
        var property = value.Properties().FirstOrDefault(p => string.Equals(p.Name, name, StringComparison.OrdinalIgnoreCase));
        value[property?.Name ?? name] = token;
    }
    private static long EditVersion(JObject document)
    {
        var metadata = Field(document, "metadata") as JObject;
        var value = metadata is null ? null : Field(metadata, "lastEditTimeUtc")?.Value<string>();
        return value is null ? 0 : DateTimeOffset.Parse(value, System.Globalization.CultureInfo.InvariantCulture,
            System.Globalization.DateTimeStyles.AssumeUniversal).ToUnixTimeMilliseconds();
    }
    private static MethodInfo Require(Type type, string name, int count) => type.GetMethods()
        .SingleOrDefault(m => m.Name == name && m.GetParameters().Length == count)
        ?? throw new NotSupportedException("Native source storage API unavailable: " + type.FullName + "." + name);
    private static JsonSerializerSettings JsonSettings => new() { DateParseHandling = DateParseHandling.None, MaxDepth = 256 };
    internal static string Message(Exception ex) => ex is TargetInvocationException { InnerException: { } inner } ? Message(inner) : ex.Message;
    internal sealed record Snapshot(string ActionId, QuickerRpcActionStorageIdentity Identity, JObject Document, JObject Body, object Record);
    internal sealed record CommitResult(bool Success, bool Persisted, QuickerRpcActionStorageIdentity Identity, string? ErrorCode = null, string? Error = null);
}

internal sealed class SourceStorageException(string code, string message) : Exception(message)
{
    internal string Code { get; } = code;
}
