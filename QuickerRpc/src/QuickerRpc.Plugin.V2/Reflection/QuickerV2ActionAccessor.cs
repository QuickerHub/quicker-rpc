using System.Collections;
using System.Reflection;

namespace QuickerRpc.Plugin.V2.Reflection;

internal sealed class QuickerV2ActionAccessor
{
    private static readonly object CacheLock = new();
    private static QuickerV2ActionAccessor? _cached;

    private readonly object _lookup;
    private readonly MethodInfo _getWithLocation;
    private readonly MethodInfo? _getAllWithLocation;
    private readonly object _store;
    private readonly MethodInfo _addOrUpdateAction;
    private readonly object? _editingState;
    private readonly MethodInfo? _isActionEditing;
    private readonly Type _extensionsType;
    private readonly Type _actionItem2Type;

    private QuickerV2ActionAccessor(
        object lookup,
        MethodInfo getWithLocation,
        MethodInfo? getAllWithLocation,
        object store,
        MethodInfo addOrUpdateAction,
        object? editingState,
        MethodInfo? isActionEditing,
        Type extensionsType,
        Type actionItem2Type)
    {
        _lookup = lookup;
        _getWithLocation = getWithLocation;
        _getAllWithLocation = getAllWithLocation;
        _store = store;
        _addOrUpdateAction = addOrUpdateAction;
        _editingState = editingState;
        _isActionEditing = isActionEditing;
        _extensionsType = extensionsType;
        _actionItem2Type = actionItem2Type;
    }

    /// <summary>Successful instances are cached; null results are retried on each call.</summary>
    public static QuickerV2ActionAccessor? Current
    {
        get
        {
            if (_cached is not null)
            {
                return _cached;
            }

            var created = TryCreate();
            if (created is null)
            {
                return null;
            }

            lock (CacheLock)
            {
                _cached ??= created;
                return _cached;
            }
        }
    }

    public bool IsAvailable => true;

    public bool TryGetById(string actionId, out object? action, out string? error)
    {
        action = null;
        error = null;
        var id = actionId.Trim();
        if (id.Length == 0)
        {
            error = "actionId is required.";
            return false;
        }

        try
        {
            var raw = _getWithLocation.Invoke(_lookup, [id, false]);
            action = QuickerV2Reflection.ReadTupleField(raw, "Item1", "action");
            if (action is null)
            {
                raw = _getWithLocation.Invoke(_lookup, [id, true]);
                action = QuickerV2Reflection.ReadTupleField(raw, "Item1", "action");
            }

            if (action is null)
            {
                error = $"Action not found: {actionId}";
                return false;
            }

            return true;
        }
        catch (Exception ex)
        {
            error = ex.InnerException?.Message ?? ex.Message;
            return false;
        }
    }

    public string GetActionId(object action)
    {
        var id = QuickerV2Reflection.ReadMember(action, "Id");
        return id?.ToString() ?? string.Empty;
    }

    public bool IsXAction(object action)
    {
        var result = QuickerV2Reflection.InvokeStatic(_extensionsType, "IsXActionOperation", action);
        return result is bool b && b;
    }

    public string? GetPayloadJson(object action, out string? hydrateError)
    {
        hydrateError = null;
        try
        {
            var json = QuickerV2Reflection.InvokeStatic(_extensionsType, "GetXActionPayloadJson", action) as string;
            if (string.IsNullOrWhiteSpace(json))
            {
                hydrateError = "Action has no XAction payload.";
                return null;
            }

            return json;
        }
        catch (Exception ex)
        {
            hydrateError = ex.InnerException?.Message ?? ex.Message;
            return null;
        }
    }

    public long GetEditVersionMs(object action)
    {
        var fromExtension = QuickerV2Reflection.InvokeStatic(_extensionsType, "get_LastEditTimeUtc", action);
        if (fromExtension is DateTime dt)
        {
            return new DateTimeOffset(dt.ToUniversalTime()).ToUnixTimeMilliseconds();
        }

        var metadata = QuickerV2Reflection.ReadMember(action, "Metadata");
        if (metadata is not null)
        {
            return QuickerV2Reflection.ReadInt64(metadata, "LastEditTimeUtc");
        }

        return 0;
    }

    public (string Title, string Description, string Icon, string ContextMenuData) GetPresentation(object action) =>
        (
            QuickerV2Reflection.InvokeStatic(_extensionsType, "get_Title", action)?.ToString() ?? string.Empty,
            QuickerV2Reflection.InvokeStatic(_extensionsType, "get_Description", action)?.ToString() ?? string.Empty,
            QuickerV2Reflection.InvokeStatic(_extensionsType, "get_Icon", action)?.ToString() ?? string.Empty,
            QuickerV2Reflection.InvokeStatic(_extensionsType, "get_ContextMenuData", action)?.ToString() ?? string.Empty);

    public bool IsActionEditing(string actionId)
    {
        if (_editingState is null || _isActionEditing is null)
        {
            return false;
        }

        try
        {
            var result = _isActionEditing.Invoke(_editingState, [actionId.Trim()]);
            return result is bool b && b;
        }
        catch
        {
            return false;
        }
    }

    public bool TrySaveAction(object action, out string? error)
    {
        error = null;
        var actionId = GetActionId(action);
        if (IsActionEditing(actionId))
        {
            error = "Action is open in the designer. Close the editor before headless save.";
            return false;
        }

        try
        {
            _addOrUpdateAction.Invoke(_store, [action]);
            return true;
        }
        catch (Exception ex)
        {
            error = ex.InnerException?.Message ?? ex.Message;
            return false;
        }
    }

    public object? CloneAction(object action) =>
        QuickerV2Reflection.InvokeStatic(_extensionsType, "Clone", action, false);

    public IReadOnlyList<(object Action, object? Location)> EnumerateAllWithLocation()
    {
        if (_getAllWithLocation is null)
        {
            return Array.Empty<(object, object?)>();
        }

        try
        {
            if (_getAllWithLocation.Invoke(_lookup, null) is not IEnumerable rows)
            {
                return Array.Empty<(object, object?)>();
            }

            var list = new List<(object, object?)>();
            foreach (var row in rows)
            {
                if (row is null)
                {
                    continue;
                }

                var action = QuickerV2Reflection.ReadMember(row, "Action");
                if (action is null)
                {
                    continue;
                }

                var location = QuickerV2Reflection.ReadMember(row, "Location");
                list.Add((action, location));
            }

            return list;
        }
        catch
        {
            return Array.Empty<(object, object?)>();
        }
    }

    public string? GetTemplateId(object action) =>
        QuickerV2Reflection.InvokeStatic(_extensionsType, "get_TemplateId", action)?.ToString();

    public string? GetSharedActionId(object action) =>
        QuickerV2Reflection.InvokeStatic(_extensionsType, "get_SharedActionId", action)?.ToString();

    public bool IsFromSharedAction(object action)
    {
        var result = QuickerV2Reflection.InvokeStatic(_extensionsType, "IsFromSharedAction", action);
        return result is bool b && b;
    }

    public void SetOperationPayload(object action, string payloadJson) =>
        QuickerV2Reflection.WriteMember(action, "OperationPayload", payloadJson);

    public void TouchLastEditUtc(object action, DateTime utcNow)
    {
        var metadata = QuickerV2Reflection.ReadMember(action, "Metadata");
        if (metadata is null)
        {
            return;
        }

        QuickerV2Reflection.WriteMember(metadata, "LastEditTimeUtc", utcNow);
    }

    public Type ActionItem2Type => _actionItem2Type;

    private static QuickerV2ActionAccessor? TryCreate()
    {
        if (!QuickerV2Runtime.IsRunningInQuicker)
        {
            return null;
        }

        var lookupType = QuickerV2Runtime.ResolveType(QuickerV2TypeNames.ActionRuntimeLookupService);
        var storeType = QuickerV2Runtime.ResolveType(QuickerV2TypeNames.ActionItem2Store);
        var extensionsType = QuickerV2Runtime.ResolveType(QuickerV2TypeNames.ActionItem2Extensions);
        var actionItem2Type = QuickerV2Runtime.ResolveType(QuickerV2TypeNames.ActionItem2);
        if (lookupType is null || storeType is null || extensionsType is null || actionItem2Type is null)
        {
            return null;
        }

        var lookup = QuickerV2Runtime.TryGetService(lookupType);
        var store = QuickerV2Runtime.TryGetService(storeType);
        if (lookup is null || store is null)
        {
            return null;
        }

        var getWithLocation = lookupType.GetMethods(BindingFlags.Public | BindingFlags.Instance)
            .FirstOrDefault(m =>
                string.Equals(m.Name, "GetActionWithLocationByIdOrNameOrSourceId", StringComparison.Ordinal)
                && m.GetParameters().Length == 2
                && m.GetParameters()[0].ParameterType == typeof(string));
        var addOrUpdate = storeType.GetMethod(
            "AddOrUpdateAction",
            BindingFlags.Public | BindingFlags.Instance,
            binder: null,
            types: [actionItem2Type],
            modifiers: null);
        var getAllWithLocation = lookupType.GetMethod(
            "GetAllActionsWithLocation",
            BindingFlags.Public | BindingFlags.Instance,
            binder: null,
            types: Type.EmptyTypes,
            modifiers: null);
        if (getWithLocation is null || addOrUpdate is null)
        {
            return null;
        }

        var editingType = QuickerV2Runtime.ResolveType(QuickerV2TypeNames.ActionEditingStateService);
        var editing = editingType is null ? null : QuickerV2Runtime.TryGetService(editingType);
        var isEditing = editingType?.GetMethod(
            "IsActionEditing",
            BindingFlags.Public | BindingFlags.Instance,
            binder: null,
            types: [typeof(string)],
            modifiers: null);

        return new QuickerV2ActionAccessor(
            lookup,
            getWithLocation,
            getAllWithLocation,
            store,
            addOrUpdate,
            editing,
            isEditing,
            extensionsType,
            actionItem2Type);
    }
}
