using System;
using System.Collections;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Reflection;
using Quicker.Common;
using Quicker.Domain.Actions.X;
using Quicker.Domain.Actions.X.SubPrograms;
using Quicker.Domain.Messages;
using Quicker.Utilities._3rd;
using QuickerRpc.AgentModel.Catalog;
using QuickerRpc.Plugin.Services;

namespace QuickerRpc.Plugin.Reflection;

/// <summary>Already-loaded native members audited against the 1.45.5 source and PE.</summary>
internal sealed class V1ResourceCatalogNativeBinding : IV1ResourceCatalogNativeBinding
{
    // Product source 73597b433950693b504f5e908bdf512deea37927. A version string alone is insufficient.
    internal static readonly Guid SupportedModuleId = new("1379c179-2a75-4249-8c0d-320e8ed054fc");
    private readonly FieldInfo _dataService, _loaded, _exiting, _syncRoot, _hub, _globalPrograms, _userInfo, _userId;
    private readonly MethodInfo _actions;

    private V1ResourceCatalogNativeBinding(Module module)
    {
        _dataService = Field(module, 0x04005295, "Quicker.Domain.AppState", isStatic: true);
        _loaded = Field(module, 0x040052C4, "Quicker.Domain.AppState", isStatic: true);
        _exiting = Field(module, 0x040052BC, "Quicker.Domain.AppState", isStatic: true);
        _syncRoot = Field(module, 0x0400569E, "Quicker.Domain.Services.DataService", isStatic: false);
        _hub = Field(module, 0x04005683, "Quicker.Domain.Services.DataService", isStatic: false);
        _globalPrograms = Field(module, 0x04005688, "Quicker.Domain.Services.DataService", isStatic: false);
        _userInfo = Field(module, 0x040057BC, "wZ0iZW6y00U0vHtpRLLK.Bqunpl6y1SQWpibm8ko1", isStatic: true);
        _userId = Field(module, 0x0400566F, "fqlZhF6420Qruyto8XQt.YlAoO6640MqV9t3N6lgP", isStatic: false);
        if (_loaded.FieldType != typeof(bool) || _exiting.FieldType != typeof(bool)
            || _syncRoot.FieldType != typeof(object) || !_syncRoot.IsInitOnly
            || _userId.FieldType != typeof(string) || _userInfo.FieldType != _userId.DeclaringType
            || _dataService.FieldType.FullName != "Quicker.Domain.Services.DataService"
            || _hub.FieldType.FullName != "Quicker.Utilities._3rd.ITinyMessengerHub")
            throw new InvalidOperationException("The native catalog member contract changed.");
        _actions = _dataService.FieldType.GetMethod("GetAllActionItems", BindingFlags.Instance | BindingFlags.Public,
            null, Type.EmptyTypes, null) ?? throw new MissingMethodException("Native catalog enumeration is unavailable.");
        if (!typeof(IEnumerable).IsAssignableFrom(_actions.ReturnType))
            throw new InvalidOperationException("The native catalog return contract changed.");
    }

    internal static bool IsKnownModule(Guid moduleId) => moduleId == SupportedModuleId;

    public static IV1ResourceCatalogNativeBinding? TryCreate()
    {
        if (!string.Equals(Assembly.GetEntryAssembly()?.GetName().Name, "Quicker", StringComparison.Ordinal)) return null;
        var assembly = AppDomain.CurrentDomain.GetAssemblies().FirstOrDefault(value =>
            string.Equals(value.GetName().Name, "Quicker", StringComparison.Ordinal));
        if (assembly is null || !IsKnownModule(assembly.ManifestModule.ModuleVersionId)) return null;
        try { return new V1ResourceCatalogNativeBinding(assembly.ManifestModule); }
        catch (Exception) { return null; }
    }

    public bool TryGetSession(out IV1ResourceCatalogNativeSession? session, out string? code, out string? error)
    {
        session = null; code = null; error = null;
        if (_loaded.GetValue(null) is not true || _exiting.GetValue(null) is not false)
        {
            code = "ACCOUNT_CONTEXT_UNAVAILABLE"; error = "The native account is loading or exiting."; return false;
        }
        var service = _dataService.GetValue(null);
        if (service is null || service.GetType() != _dataService.FieldType)
        {
            code = "ACCOUNT_CONTEXT_UNAVAILABLE"; error = "The native data service is unavailable."; return false;
        }
        var syncRoot = _syncRoot.GetValue(service);
        if (syncRoot is null || _hub.GetValue(service) is not ITinyMessengerHub hub)
        {
            code = "ACCOUNT_CONTEXT_UNAVAILABLE"; error = "The native synchronization boundary is unavailable."; return false;
        }
        session = new NativeSession(this, service, syncRoot, hub);
        return true;
    }

    private static FieldInfo Field(Module module, int token, string declaringType, bool isStatic)
    {
        var field = module.ResolveField(token);
        if (field is null || field.DeclaringType?.FullName != declaringType || field.IsStatic != isStatic)
            throw new InvalidOperationException("The native catalog field contract changed.");
        return field;
    }

    private sealed class NativeSession : IV1ResourceCatalogNativeSession
    {
        private readonly V1ResourceCatalogNativeBinding _binding;
        private readonly object _service;
        private readonly ITinyMessengerHub _hub;
        public NativeSession(V1ResourceCatalogNativeBinding binding, object service, object syncRoot, ITinyMessengerHub hub)
        { _binding = binding; _service = service; SyncRoot = syncRoot; _hub = hub; }
        public object SyncRoot { get; }
        public bool IsLoaded => _binding._loaded.GetValue(null) is true;
        public bool IsExiting => _binding._exiting.GetValue(null) is not false;
        public bool IsCurrentContext => ReferenceEquals(_binding._dataService.GetValue(null), _service)
            && ReferenceEquals(_binding._syncRoot.GetValue(_service), SyncRoot);
        public string? ReadAccountId()
        {
            var info = _binding._userInfo.GetValue(null);
            return info is null ? null : _binding._userId.GetValue(info) as string;
        }
        public IDisposable SubscribeSync(Action changed) => _hub.Subscribe<SyncStateMessage>(_ => changed(), useStrongReferences: true);

        public IEnumerable<ResourceCatalogEntry> ReadEntries(string kind)
        {
            if (kind == "action")
            {
                if (_binding._actions.Invoke(_service, null) is not IEnumerable actions)
                    throw new InvalidOperationException("The native action catalog did not return a collection.");
                foreach (var value in actions)
                {
                    if (value is not ActionItem action) throw new InvalidOperationException("The native action catalog contains an invalid record.");
                    yield return new ResourceCatalogEntry(action.Id ?? string.Empty, action.Title ?? string.Empty,
                        action.Description ?? string.Empty, action.Icon ?? string.Empty, Version(action.LastEditTimeUtc),
                        action.ActionType.ToString());
                }
            }
            else if (kind == "global_subprogram")
            {
                if (_binding._globalPrograms.GetValue(_service) is not IEnumerable programs)
                    throw new InvalidOperationException("The native global subprogram catalog did not return a collection.");
                foreach (var value in programs)
                {
                    if (value is not SubProgram program) throw new InvalidOperationException("The native global subprogram catalog contains an invalid record.");
                    yield return new ResourceCatalogEntry(program.Id ?? string.Empty, program.Name ?? string.Empty,
                        program.Description ?? string.Empty, program.Icon ?? string.Empty, Version(program.LastEditTimeUtc ?? program.CreateTimeUtc),
                        callIdentifier: SubProgramHelper.GetGlobalSubProgramIdentifier(program));
                }
            }
            else throw new ArgumentException("Unknown resource kind.", nameof(kind));
        }
        private static string Version(DateTime? value)
        {
            if (!value.HasValue) return "0";
            var utc = value.Value.Kind switch
            {
                DateTimeKind.Utc => value.Value,
                DateTimeKind.Local => value.Value.ToUniversalTime(),
                _ => DateTime.SpecifyKind(value.Value, DateTimeKind.Utc),
            };
            return new DateTimeOffset(utc, TimeSpan.Zero).ToUnixTimeMilliseconds().ToString(CultureInfo.InvariantCulture);
        }
    }
}
