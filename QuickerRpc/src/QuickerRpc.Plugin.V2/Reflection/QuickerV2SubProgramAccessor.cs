using System.Collections;
using System.Reflection;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using Newtonsoft.Json.Serialization;

namespace QuickerRpc.Plugin.V2.Reflection;

internal sealed class QuickerV2SubProgramAccessor
{
    private static readonly object CacheLock = new();
    private static QuickerV2SubProgramAccessor? _cached;

    private static readonly JsonSerializerSettings BodyJson = new()
    {
        ContractResolver = new CamelCasePropertyNamesContractResolver(),
        NullValueHandling = NullValueHandling.Ignore,
        MissingMemberHandling = MissingMemberHandling.Ignore,
    };

    private readonly object _dataService;
    private readonly MethodInfo _lookupById;
    private readonly MethodInfo? _snapshotAll;
    private readonly MethodInfo _addOrUpdate;
    private readonly Type _subProgramType;
    private readonly Type _helperType;
    private readonly Type _stepListType;
    private readonly Type _variableListType;

    private QuickerV2SubProgramAccessor(
        object dataService,
        MethodInfo lookupById,
        MethodInfo? snapshotAll,
        MethodInfo addOrUpdate,
        Type subProgramType,
        Type helperType,
        Type stepListType,
        Type variableListType)
    {
        _dataService = dataService;
        _lookupById = lookupById;
        _snapshotAll = snapshotAll;
        _addOrUpdate = addOrUpdate;
        _subProgramType = subProgramType;
        _helperType = helperType;
        _stepListType = stepListType;
        _variableListType = variableListType;
    }

    public static QuickerV2SubProgramAccessor? Current
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

    public bool TryGetByIdOrName(string idOrName, out object? subProgram, out string? error)
    {
        subProgram = null;
        error = null;
        var key = idOrName.Trim();
        if (key.Length == 0)
        {
            error = "subProgram id or name is required.";
            return false;
        }

        try
        {
            subProgram = _lookupById.Invoke(_dataService, [key]);
            if (subProgram is not null)
            {
                return true;
            }

            foreach (var candidate in EnumerateAll())
            {
                if (MatchesKey(candidate, key))
                {
                    subProgram = candidate;
                    return true;
                }
            }

            error = $"Global subprogram not found: {key}";
            return false;
        }
        catch (Exception ex)
        {
            error = ex.InnerException?.Message ?? ex.Message;
            return false;
        }
    }

    public string GetId(object subProgram) => QuickerV2Reflection.ReadString(subProgram, "Id") ?? string.Empty;

    public string GetCallIdentifier(object subProgram)
    {
        var result = QuickerV2Reflection.InvokeStatic(_helperType, "GetGlobalSubProgramIdentifier", subProgram);
        return result?.ToString() ?? string.Empty;
    }

    public long GetEditVersionMs(object subProgram)
    {
        var lastEdit = QuickerV2Reflection.ReadMember(subProgram, "LastEditTimeUtc");
        if (lastEdit is DateTime dt)
        {
            return new DateTimeOffset(dt.ToUniversalTime()).ToUnixTimeMilliseconds();
        }

        var created = QuickerV2Reflection.ReadMember(subProgram, "CreateTimeUtc");
        return created is DateTime createDt
            ? new DateTimeOffset(createDt.ToUniversalTime()).ToUnixTimeMilliseconds()
            : 0;
    }

    public JArray StepsToJArray(object subProgram)
    {
        var steps = QuickerV2Reflection.ReadMember(subProgram, "Steps");
        return ToJArray(steps);
    }

    public JArray VariablesToJArray(object subProgram)
    {
        var variables = QuickerV2Reflection.ReadMember(subProgram, "Variables");
        return ToJArray(variables);
    }

    public bool TryApplyBody(object subProgram, JArray steps, JArray variables, out string? error)
    {
        error = null;
        try
        {
            var stepList = DeserializeList(steps, _stepListType);
            var variableList = DeserializeList(variables, _variableListType);
            QuickerV2Reflection.WriteMember(subProgram, "Steps", stepList);
            QuickerV2Reflection.WriteMember(subProgram, "Variables", variableList);
            QuickerV2Reflection.WriteMember(subProgram, "LastEditTimeUtc", DateTime.UtcNow);
            return true;
        }
        catch (Exception ex)
        {
            error = ex.InnerException?.Message ?? ex.Message;
            return false;
        }
    }

    public IEnumerable<object> EnumerateAll()
    {
        if (_snapshotAll is null)
        {
            yield break;
        }

        IEnumerable? rows;
        try
        {
            rows = _snapshotAll.Invoke(_dataService, null) as IEnumerable;
        }
        catch
        {
            yield break;
        }

        if (rows is null)
        {
            yield break;
        }

        foreach (var row in rows)
        {
            if (row is not null)
            {
                yield return row;
            }
        }
    }

    public bool IsValidName(string name)
    {
        var result = QuickerV2Reflection.InvokeStatic(_helperType, "IsValidSubProgramName", name);
        return result is bool b && b;
    }

    private bool MatchesKey(object subProgram, string key)
    {
        var id = GetId(subProgram);
        if (id.Length > 0 && string.Equals(id, key, StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        var name = QuickerV2Reflection.ReadString(subProgram, "Name") ?? string.Empty;
        if (name.Length > 0 && string.Equals(name, key, StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        var callId = GetCallIdentifier(subProgram);
        return callId.Length > 0 && string.Equals(callId, key, StringComparison.OrdinalIgnoreCase);
    }

    public bool TrySave(object subProgram, out string? error)
    {
        error = null;
        try
        {
            _addOrUpdate.Invoke(_dataService, [subProgram]);
            return true;
        }
        catch (Exception ex)
        {
            error = ex.InnerException?.Message ?? ex.Message;
            return false;
        }
    }

    private static JArray ToJArray(object? value)
    {
        if (value is null)
        {
            return new JArray();
        }

        if (value is ICollection collection && collection.Count == 0)
        {
            return new JArray();
        }

        return JArray.Parse(JsonConvert.SerializeObject(value, BodyJson));
    }

    private object DeserializeList(JArray array, Type listType)
    {
        if (array.Count == 0)
        {
            return Activator.CreateInstance(listType)!;
        }

        var elementType = listType.GetGenericArguments()[0];
        var deserialized = JsonConvert.DeserializeObject(
            array.ToString(Formatting.None),
            typeof(List<>).MakeGenericType(elementType),
            BodyJson);
        var list = Activator.CreateInstance(listType)!;
        var add = listType.GetMethod("Add");
        if (deserialized is IEnumerable items && add is not null)
        {
            foreach (var item in items)
            {
                add.Invoke(list, [item]);
            }
        }

        return list;
    }

    private static QuickerV2SubProgramAccessor? TryCreate()
    {
        if (!QuickerV2Runtime.IsRunningInQuicker)
        {
            return null;
        }

        var serviceType = QuickerV2Runtime.ResolveType(QuickerV2TypeNames.GlobalSubProgramDataService);
        var subProgramType = QuickerV2Runtime.ResolveType(QuickerV2TypeNames.SubProgram);
        var helperType = QuickerV2Runtime.ResolveType(QuickerV2TypeNames.SubProgramHelper);
        var stepType = QuickerV2Runtime.ResolveType(QuickerV2TypeNames.StorageActionStep);
        var variableType = QuickerV2Runtime.ResolveType(QuickerV2TypeNames.StorageActionVariable);
        if (serviceType is null || subProgramType is null || helperType is null || stepType is null || variableType is null)
        {
            return null;
        }

        var service = QuickerV2Runtime.TryGetService(serviceType);
        if (service is null)
        {
            return null;
        }

        var lookup = serviceType.GetMethod(
            "LookupById",
            BindingFlags.Public | BindingFlags.Instance,
            binder: null,
            types: [typeof(string)],
            modifiers: null);
        var addOrUpdate = serviceType.GetMethod(
            "AddOrUpdate",
            BindingFlags.Public | BindingFlags.Instance,
            binder: null,
            types: [subProgramType],
            modifiers: null);
        var snapshotAll = serviceType.GetMethod(
            "SnapshotAll",
            BindingFlags.Public | BindingFlags.Instance,
            binder: null,
            types: Type.EmptyTypes,
            modifiers: null);
        if (lookup is null || addOrUpdate is null)
        {
            return null;
        }

        var stepListType = typeof(List<>).MakeGenericType(stepType);
        var variableListType = typeof(List<>).MakeGenericType(variableType);
        return new QuickerV2SubProgramAccessor(
            service,
            lookup,
            snapshotAll,
            addOrUpdate,
            subProgramType,
            helperType,
            stepListType,
            variableListType);
    }
}
