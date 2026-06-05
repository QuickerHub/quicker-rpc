using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using Quicker.Domain;
using QuickerRpc.Contracts.Rpc;
using QuickerRpc.Plugin.Reflection;

namespace QuickerRpc.Plugin.Services;

/// <summary>
/// Reads the logged-in Quicker account from <c>RuntimeDataStore.UserInfo</c> (Release-safe via type scan).
/// </summary>
internal static class QuickerAccountAccessor
{
    private const string RuntimeDataStoreTypeName = "Quicker.Domain.Services.Data.RuntimeDataStore";

    private const string AccountUserInfoTypeName = "Quicker.Common.Vm.Account.UserInfo";

    public static QuickerRpcAccountInfo TryGetAccountInfo()
    {
        if (!QuickerHost.IsRunningInQuicker())
        {
            return NotLoggedIn("Not running inside Quicker.");
        }

        try
        {
            var sysInfo = QuickerDispatcherInvoke.OnUiThreadIfNeeded(QuickerSysInfoAccessor.TryRead);
            if (!string.IsNullOrWhiteSpace(sysInfo?.UnionId))
            {
                return BuildLoggedIn(
                    sysInfo!.UnionId!.Trim(),
                    userName: null,
                    nickName: null);
            }

            var resolved = QuickerDispatcherInvoke.OnUiThreadIfNeeded(TryResolveUserInfoSafe);
            if (resolved?.Info is { } storeInfo)
            {
                var userId = storeInfo.UserId?.Trim();
                if (!string.IsNullOrEmpty(userId))
                {
                    return BuildLoggedIn(
                        userId,
                        TrimOrNull(storeInfo.UserName),
                        TrimOrNull(storeInfo.NickName));
                }
            }

            return NotLoggedIn("Quicker account is not logged in.");
        }
        catch (Exception ex)
        {
            return NotLoggedIn(ex.Message);
        }
    }

    private static QuickerRpcAccountInfo BuildLoggedIn(
        string userId,
        string? userName,
        string? nickName) =>
        new()
        {
            Ok = true,
            LoggedIn = true,
            UserId = userId,
            UserName = userName,
            NickName = nickName,
        };

    private sealed class ResolvedUserInfo
    {
        public string? UserId { get; set; }

        public string? UserName { get; set; }

        public string? NickName { get; set; }
    }

    private sealed class UserInfoResolution
    {
        public bool FoundStore { get; set; }

        public ResolvedUserInfo? Info { get; set; }
    }

    private static UserInfoResolution? TryResolveUserInfoSafe()
    {
        try
        {
            return TryResolveUserInfo();
        }
        catch
        {
            return null;
        }
    }

    private static UserInfoResolution? TryResolveUserInfo()
    {
        var assembly = ResolveQuickerAssembly();
        var runtimeType = QuickerAssemblyReflection.TryGetTypeByFullName(assembly, RuntimeDataStoreTypeName);
        if (runtimeType is not null)
        {
            var fromNamedStore = TryReadStoreUserInfo(runtimeType);
            if (fromNamedStore is not null)
            {
                return fromNamedStore;
            }
        }

        var fromScan = TryResolveFromAssemblyScan(assembly);
        if (fromScan is not null)
        {
            return fromScan;
        }

        foreach (var root in EnumerateAccountSearchRoots())
        {
            var fromGraph = FindUserInfoOnObject(root, maxDepth: 8);
            if (fromGraph is not null)
            {
                return new UserInfoResolution
                {
                    FoundStore = true,
                    Info = fromGraph,
                };
            }
        }

        return runtimeType is not null
            ? new UserInfoResolution { FoundStore = false, Info = null }
            : null;
    }

    private static UserInfoResolution? TryReadStoreUserInfo(Type runtimeType)
    {
        var store = TryGetRuntimeDataStore(runtimeType);
        if (store is null)
        {
            return null;
        }

        return new UserInfoResolution
        {
            FoundStore = true,
            Info = ReadUserInfo(store, runtimeType),
        };
    }

    private static UserInfoResolution? TryResolveFromAssemblyScan(Assembly assembly)
    {
        foreach (var type in QuickerAssemblyReflection.EnumerateTypes(assembly))
        {
            if (type is null || !type.IsClass || type.IsAbstract)
            {
                continue;
            }

            if (type.GetProperty("UserInfo", QuickerAssemblyReflection.InstanceFlags) is null)
            {
                continue;
            }

            var fromStore = TryReadStoreUserInfo(type);
            if (fromStore is not null)
            {
                return fromStore;
            }
        }

        return null;
    }

    private static IEnumerable<object> EnumerateAccountSearchRoots()
    {
        if (AppState.DataService is { } dataService)
        {
            yield return dataService;
        }

        foreach (var propertyName in new[] { "AppServer", "PushClient", "UserPreference" })
        {
            object? value;
            try
            {
                value = typeof(AppState)
                    .GetProperty(propertyName, QuickerAssemblyReflection.StaticFlags)
                    ?.GetValue(null);
            }
            catch
            {
                continue;
            }

            if (value is not null)
            {
                yield return value;
            }
        }
    }

    private static Assembly ResolveQuickerAssembly()
    {
        if (QuickerAssemblyReflection.TryResolveQuickerEntryAssembly(out var quicker))
        {
            return quicker;
        }

        return typeof(AppState).Assembly;
    }

    private static object? TryGetRuntimeDataStore(Type runtimeType)
    {
        foreach (var storeMethod in runtimeType
                     .GetMethods(QuickerAssemblyReflection.StaticFlags)
                     .Where(method =>
                         method.IsStatic
                         && method.ReturnType == runtimeType
                         && method.GetParameters().Length == 0))
        {
            try
            {
                if (storeMethod.Invoke(null, null) is { } storeFromMethod)
                {
                    return storeFromMethod;
                }
            }
            catch
            {
                // Try the next candidate accessor.
            }
        }

        foreach (var storeField in runtimeType
                     .GetFields(QuickerAssemblyReflection.StaticFlags)
                     .Where(field => field.IsStatic && field.FieldType == runtimeType))
        {
            try
            {
                if (storeField.GetValue(null) is { } storeFromField)
                {
                    return storeFromField;
                }
            }
            catch
            {
                // Try the next candidate accessor.
            }
        }

        return null;
    }

    private static ResolvedUserInfo? ReadUserInfo(object store, Type runtimeType)
    {
        var userInfoProperty = runtimeType.GetProperty(
            "UserInfo",
            QuickerAssemblyReflection.InstanceFlags);
        if (userInfoProperty is null)
        {
            return null;
        }

        object? value;
        try
        {
            value = userInfoProperty.GetValue(store);
        }
        catch
        {
            return null;
        }

        return ParseUserInfoObject(value);
    }

    private static ResolvedUserInfo? FindUserInfoOnObject(object? root, int maxDepth)
    {
        if (root is null || maxDepth < 0)
        {
            return null;
        }

        var visited = new HashSet<object>(ObjectReferenceComparer.Instance);
        var queue = new Queue<(object Target, int Depth)>();
        queue.Enqueue((root, 0));

        while (queue.Count > 0)
        {
            var (target, depth) = queue.Dequeue();
            if (!visited.Add(target) || depth > maxDepth)
            {
                continue;
            }

            var targetType = target.GetType();
            foreach (var property in targetType.GetProperties(
                         QuickerAssemblyReflection.InstanceFlags))
            {
                if (property.GetIndexParameters().Length > 0)
                {
                    continue;
                }

                object? value;
                try
                {
                    value = property.GetValue(target);
                }
                catch
                {
                    continue;
                }

                if (value is null)
                {
                    continue;
                }

                if (LooksLikeUserInfo(value))
                {
                    return ParseUserInfoObject(value);
                }

                if (ShouldTraverse(value.GetType()) && depth < maxDepth)
                {
                    queue.Enqueue((value, depth + 1));
                }
            }
        }

        return null;
    }

    private static bool LooksLikeUserInfo(object value)
    {
        var type = value.GetType();
        if (string.Equals(type.FullName, AccountUserInfoTypeName, StringComparison.Ordinal))
        {
            return true;
        }

        var userId = type.GetProperty("UserId", QuickerAssemblyReflection.InstanceFlags);
        var userName = type.GetProperty("UserName", QuickerAssemblyReflection.InstanceFlags);
        return userId?.PropertyType == typeof(string)
               && userName?.PropertyType == typeof(string);
    }

    private static ResolvedUserInfo? ParseUserInfoObject(object? value)
    {
        if (value is null)
        {
            return null;
        }

        var type = value.GetType();
        return new ResolvedUserInfo
        {
            UserId = ReadStringProperty(value, type, "UserId"),
            UserName = ReadStringProperty(value, type, "UserName"),
            NickName = ReadStringProperty(value, type, "NickName"),
        };
    }

    private static string? ReadStringProperty(object target, Type type, string propertyName)
    {
        var property = type.GetProperty(propertyName, QuickerAssemblyReflection.InstanceFlags);
        if (property?.PropertyType != typeof(string))
        {
            return null;
        }

        try
        {
            return property.GetValue(target) as string;
        }
        catch
        {
            return null;
        }
    }

    private static bool ShouldTraverse(Type type)
    {
        if (type.IsPrimitive || type.IsEnum || type == typeof(string))
        {
            return false;
        }

        var ns = type.Namespace ?? string.Empty;
        return ns.StartsWith("Quicker.", StringComparison.Ordinal);
    }

    private static string? TrimOrNull(string? value)
    {
        var trimmed = value?.Trim();
        return string.IsNullOrEmpty(trimmed) ? null : trimmed;
    }

    private static QuickerRpcAccountInfo NotLoggedIn(string? message = null) =>
        new()
        {
            Ok = true,
            LoggedIn = false,
            Message = message,
        };

    private sealed class ObjectReferenceComparer : IEqualityComparer<object>
    {
        public static readonly ObjectReferenceComparer Instance = new();

        public new bool Equals(object? x, object? y) => ReferenceEquals(x, y);

        public int GetHashCode(object obj) => System.Runtime.CompilerServices.RuntimeHelpers.GetHashCode(obj);
    }
}
