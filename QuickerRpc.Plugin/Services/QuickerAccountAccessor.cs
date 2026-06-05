using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using Quicker.Common.Vm.Account;
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

    public static QuickerRpcAccountInfo TryGetAccountInfo()
    {
        if (!QuickerHost.IsRunningInQuicker())
        {
            return NotLoggedIn("Not running inside Quicker.");
        }

        try
        {
            var userInfo = TryResolveUserInfo();
            if (userInfo is null)
            {
                return NotLoggedIn("UserInfo unavailable.");
            }

            var userId = userInfo.UserId?.Trim();
            if (string.IsNullOrEmpty(userId))
            {
                return NotLoggedIn("Quicker account is not logged in.");
            }

            return new QuickerRpcAccountInfo
            {
                Ok = true,
                LoggedIn = true,
                UserId = userId,
            };
        }
        catch (Exception ex)
        {
            return NotLoggedIn(ex.Message);
        }
    }

    private static UserInfo? TryResolveUserInfo()
    {
        var assembly = typeof(AppState).Assembly;
        var runtimeType = QuickerAssemblyReflection.TryGetTypeByFullName(assembly, RuntimeDataStoreTypeName);
        if (runtimeType is not null)
        {
            var store = TryGetRuntimeDataStore(runtimeType);
            var fromStore = ReadUserInfo(store, runtimeType);
            if (fromStore is not null)
            {
                return fromStore;
            }
        }

        return FindUserInfoOnObject(AppState.DataService, maxDepth: 4);
    }

    private static object? TryGetRuntimeDataStore(Type runtimeType)
    {
        var storeField = runtimeType
            .GetFields(QuickerAssemblyReflection.StaticFlags)
            .FirstOrDefault(field => field.IsStatic && field.FieldType == runtimeType);
        if (storeField?.GetValue(null) is { } storeFromField)
        {
            return storeFromField;
        }

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

        return null;
    }

    private static UserInfo? ReadUserInfo(object? store, Type runtimeType)
    {
        if (store is null)
        {
            return null;
        }

        var userInfoProperty = runtimeType.GetProperty(
            "UserInfo",
            QuickerAssemblyReflection.InstanceFlags);
        return userInfoProperty?.GetValue(store) as UserInfo;
    }

    private static UserInfo? FindUserInfoOnObject(object? root, int maxDepth)
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

                if (value is UserInfo userInfo)
                {
                    return userInfo;
                }

                if (value is not null && ShouldTraverse(value.GetType()) && depth < maxDepth)
                {
                    queue.Enqueue((value, depth + 1));
                }
            }
        }

        return null;
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
