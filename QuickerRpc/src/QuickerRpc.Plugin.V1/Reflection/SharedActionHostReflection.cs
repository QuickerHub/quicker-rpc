using System;
using System.Linq;
using System.Net.Http;
using System.Reflection;
using System.Threading.Tasks;
using Quicker.Common.Vm;
using Quicker.Domain;
using QuickerRpc.Plugin.Services;

namespace QuickerRpc.Plugin.Reflection;

/// <summary>
/// Resolves <see cref="SharedActionVm"/> / WebConnector share APIs from the Quicker host.
/// Probe strategy matches legacy <see cref="WebConnectorAccessor"/>: locate the static
/// <see cref="HttpClient"/> holder type first, then resolve methods on that type only.
/// </summary>
internal static class SharedActionHostReflection
{
    internal const string SharedActionVmFullName = "Quicker.Common.Vm.SharedActionVm";
    internal const string SharedActionDtoFullName = "Quicker.Common.Vm.SharedActionDto";
    internal const string ApiResultFullName = "Quicker.Common.Vm.ApiResult`1";

    private static readonly string[] ConnectorTypeNameCandidates =
    [
        "Quicker.Domain.Services.WebConnector",
        "Quicker.View.Share.WebConnector",
    ];

    private sealed class ResolvedWebConnectorMethods
    {
        public MethodInfo ShareAction { get; init; } = null!;

        public MethodInfo? ShareSubProgram { get; init; }

        public Type ConnectorType => ShareAction.DeclaringType!;
    }

    private static readonly Lazy<ResolvedWebConnectorMethods?> CachedWebConnectorMethods =
        new(ResolveWebConnectorMethodsOnce, System.Threading.LazyThreadSafetyMode.ExecutionAndPublication);

    public static Type ResolveSharedActionVmType() =>
        TryResolveFromQuickerCommon(SharedActionVmFullName) ?? typeof(SharedActionVm);

    public static Type ResolveSharedActionDtoType() =>
        TryResolveFromQuickerCommon(SharedActionDtoFullName) ?? typeof(SharedActionDto);

    public static Type? TryResolveFromQuickerCommon(string fullName)
    {
        var common = TryGetQuickerCommonAssembly();
        if (common is not null)
        {
            var fromCommon = common.GetType(fullName, throwOnError: false);
            if (fromCommon is not null)
            {
                return fromCommon;
            }
        }

        return TryResolveLoadedType(fullName);
    }

    public static Assembly? TryGetQuickerCommonAssembly()
    {
        foreach (var assembly in AppDomain.CurrentDomain.GetAssemblies())
        {
            if (string.Equals(assembly.GetName().Name, "Quicker.Common", StringComparison.OrdinalIgnoreCase))
            {
                return assembly;
            }
        }

        try
        {
            return Assembly.Load("Quicker.Common");
        }
        catch
        {
            return null;
        }
    }

    public static Type? TryResolveLoadedType(string fullName)
    {
        foreach (var assembly in AppDomain.CurrentDomain.GetAssemblies())
        {
            try
            {
                var type = assembly.GetType(fullName, throwOnError: false);
                if (type is not null)
                {
                    return type;
                }
            }
            catch
            {
                // Ignore broken dynamic / reflection-only loads.
            }
        }

        return null;
    }

    public static Type ResolveApiResultType(Type dtoType)
    {
        var openGeneric = TryResolveFromQuickerCommon(ApiResultFullName) ?? typeof(ApiResult<>);
        return openGeneric.MakeGenericType(dtoType);
    }

    public static Type ResolveShareTaskType(Type dtoType) =>
        typeof(Task<>).MakeGenericType(ResolveApiResultType(dtoType));

    public static bool TryResolveShareApiTypes(out Type vmType, out Type dtoType, out Type taskType)
    {
        vmType = ResolveSharedActionVmType();
        dtoType = ResolveSharedActionDtoType();
        taskType = ResolveShareTaskType(dtoType);
        return vmType is not null && dtoType is not null;
    }

    public static bool TryResolveWebConnectorMethods(
        Assembly assembly,
        out MethodInfo? shareAction,
        out MethodInfo? shareSubProgram)
    {
        var cached = CachedWebConnectorMethods.Value;
        if (cached is not null)
        {
            shareAction = cached.ShareAction;
            shareSubProgram = cached.ShareSubProgram;
            return true;
        }

        return TryProbeWebConnectorMethods(assembly, out shareAction, out shareSubProgram);
    }

    /// <summary>
    /// Offline-friendly probe used by plugin runtime (cached) and Plugin.Test scans.
    /// </summary>
    internal static bool TryProbeWebConnectorMethods(
        Assembly assembly,
        out MethodInfo? shareAction,
        out MethodInfo? shareSubProgram)
    {
        shareAction = null;
        shareSubProgram = null;

        if (!TryResolveShareApiTypes(out var vmType, out _, out var taskType))
        {
            return false;
        }

        foreach (var typeName in ConnectorTypeNameCandidates)
        {
            var namedType = QuickerAssemblyReflection.TryGetTypeByFullName(assembly, typeName)
                ?? assembly.GetType(typeName, throwOnError: false);
            if (namedType is null)
            {
                continue;
            }

            if (TryResolveMethodsOnConnectorType(namedType, vmType, taskType, out shareAction, out shareSubProgram))
            {
                return true;
            }
        }

        var bySimpleName = QuickerAssemblyReflection.TryFindNamedType(assembly, "WebConnector");
        if (bySimpleName is not null
            && TryResolveMethodsOnConnectorType(bySimpleName, vmType, taskType, out shareAction, out shareSubProgram))
        {
            return true;
        }

        foreach (var type in QuickerAssemblyReflection.EnumerateTypes(assembly))
        {
            try
            {
                if (!HasStaticHttpClientField(type))
                {
                    continue;
                }

                if (TryResolveMethodsOnConnectorType(type, vmType, taskType, out shareAction, out shareSubProgram))
                {
                    return true;
                }
            }
            catch
            {
                // Skip types that cannot be fully reflected in offline probe hosts.
            }
        }

        return false;
    }

    internal static bool TryGetResolvedWebConnectorMethods(
        out MethodInfo? shareAction,
        out MethodInfo? shareSubProgram)
    {
        var cached = CachedWebConnectorMethods.Value;
        if (cached is null)
        {
            shareAction = null;
            shareSubProgram = null;
            return false;
        }

        shareAction = cached.ShareAction;
        shareSubProgram = cached.ShareSubProgram;
        return true;
    }

    public static Type? TryFindWebConnectorType(Assembly assembly, Type vmType, Type taskType)
    {
        _ = assembly;
        _ = vmType;
        _ = taskType;
        return CachedWebConnectorMethods.Value?.ConnectorType;
    }

    public static MethodInfo? TryFindShareActionMethod(Assembly assembly, Type vmType, Type taskType)
    {
        _ = assembly;
        _ = vmType;
        _ = taskType;
        return CachedWebConnectorMethods.Value?.ShareAction;
    }

    public static MethodInfo? TryFindShareSubProgramMethod(Type? connectorType, Type vmType, Type taskType)
    {
        var cached = CachedWebConnectorMethods.Value;
        if (cached?.ShareSubProgram is not null
            && (connectorType is null || connectorType == cached.ConnectorType))
        {
            return cached.ShareSubProgram;
        }

        if (connectorType is null)
        {
            return null;
        }

        return FindShareSubProgramMethodOnType(connectorType, vmType, taskType);
    }

    private static ResolvedWebConnectorMethods? ResolveWebConnectorMethodsOnce()
    {
        if (!QuickerHost.IsRunningInQuicker())
        {
            return null;
        }

        try
        {
            var assembly = QuickerAssemblyReflection.TryResolveQuickerEntryAssembly(out var quicker)
                ? quicker
                : typeof(AppState).Assembly;

            if (!TryProbeWebConnectorMethods(assembly, out var shareAction, out var shareSubProgram)
                || shareAction is null)
            {
                return null;
            }

            return new ResolvedWebConnectorMethods
            {
                ShareAction = shareAction,
                ShareSubProgram = shareSubProgram,
            };
        }
        catch
        {
            return null;
        }
    }

    private static bool TryResolveMethodsOnConnectorType(
        Type connectorType,
        Type vmType,
        Type taskType,
        out MethodInfo? shareAction,
        out MethodInfo? shareSubProgram)
    {
        shareAction = FindShareActionMethodOnType(connectorType, vmType, taskType);
        shareSubProgram = shareAction is null
            ? null
            : FindShareSubProgramMethodOnType(connectorType, vmType, taskType);
        return shareAction is not null;
    }

    private static bool HasStaticHttpClientField(Type type)
    {
        foreach (var field in type.GetFields(BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic))
        {
            if (IsHttpClientField(field))
            {
                return true;
            }
        }

        return false;
    }

    private static bool IsHttpClientField(FieldInfo field)
    {
        try
        {
            return field.FieldType == typeof(HttpClient);
        }
        catch
        {
            return false;
        }
    }

    private static MethodInfo? FindShareActionMethodOnType(Type type, Type vmType, Type taskType)
    {
        MethodInfo? named = null;
        MethodInfo? fallback = null;
        foreach (var method in type.GetMethods(BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic))
        {
            if (method.GetParameters().Length != 1
                || method.GetParameters()[0].ParameterType != vmType
                || method.ReturnType != taskType)
            {
                continue;
            }

            if (string.Equals(method.Name, "ShareActionAsync", StringComparison.Ordinal))
            {
                named = method;
                break;
            }

            fallback ??= method;
        }

        return named ?? fallback;
    }

    private static MethodInfo? FindShareSubProgramMethodOnType(Type type, Type vmType, Type taskType)
    {
        MethodInfo? named = null;
        MethodInfo? fallback = null;
        foreach (var method in type.GetMethods(BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic))
        {
            if (method.GetParameters().Length != 2
                || method.GetParameters()[0].ParameterType != vmType
                || method.GetParameters()[1].ParameterType != typeof(bool)
                || method.ReturnType != taskType)
            {
                continue;
            }

            if (string.Equals(method.Name, "ShareSubProgramAsync", StringComparison.Ordinal))
            {
                named = method;
                break;
            }

            fallback ??= method;
        }

        return named ?? fallback;
    }

    public static object ConvertToHostVm(SharedActionVm vm)
    {
        var hostVmType = ResolveSharedActionVmType();
        if (hostVmType.IsInstanceOfType(vm))
        {
            return vm;
        }

        var hostVm = Activator.CreateInstance(hostVmType)
            ?? throw new InvalidOperationException("Failed to create SharedActionVm on host.");
        CopyCompatibleProperties(vm, hostVm, typeof(SharedActionVm), hostVmType);
        return hostVm;
    }

    public static SharedActionDto? ReadSharedActionDto(object? data)
    {
        if (data is SharedActionDto typed)
        {
            return typed;
        }

        if (data is null)
        {
            return null;
        }

        var hostDtoType = ResolveSharedActionDtoType();
        if (!hostDtoType.IsInstanceOfType(data))
        {
            return null;
        }

        var result = new SharedActionDto();
        CopyCompatibleProperties(data, result, hostDtoType, typeof(SharedActionDto));
        return result;
    }

    private static void CopyCompatibleProperties(object source, object target, Type sourceType, Type targetType)
    {
        foreach (var targetProperty in targetType.GetProperties(BindingFlags.Public | BindingFlags.Instance))
        {
            if (!targetProperty.CanWrite)
            {
                continue;
            }

            var sourceProperty = sourceType.GetProperty(
                targetProperty.Name,
                BindingFlags.Public | BindingFlags.Instance);
            if (sourceProperty?.CanRead != true)
            {
                continue;
            }

            var value = sourceProperty.GetValue(source);
            if (value is null || targetProperty.PropertyType.IsInstanceOfType(value))
            {
                targetProperty.SetValue(target, value);
            }
        }
    }
}
