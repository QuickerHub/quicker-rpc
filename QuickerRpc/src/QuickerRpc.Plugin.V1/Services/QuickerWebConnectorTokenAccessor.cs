using System;
using System.Linq;
using System.Net.Http;
using System.Reflection;
using System.Threading.Tasks;
using Quicker.Common.Vm;
using Quicker.Domain;
using QuickerRpc.Plugin.Reflection;

namespace QuickerRpc.Plugin.Services;

/// <summary>
/// Reads Bearer token from obfuscated <c>WebConnector</c> static state (Release-safe via type scan).
/// </summary>
internal static class QuickerWebConnectorTokenAccessor
{
    public static string? TryReadBearerToken()
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

            var connectorType = TryFindWebConnectorType(assembly);
            if (connectorType is null)
            {
                return null;
            }

            var namedField = connectorType.GetField(
                "_token",
                BindingFlags.Static | BindingFlags.NonPublic);
            if (namedField?.FieldType == typeof(string))
            {
                var namedToken = namedField.GetValue(null) as string;
                if (LooksLikeBearerToken(namedToken))
                {
                    return namedToken!.Trim();
                }
            }

            foreach (var field in connectorType.GetFields(BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic))
            {
                if (field.FieldType != typeof(string))
                {
                    continue;
                }

                var token = field.GetValue(null) as string;
                if (LooksLikeBearerToken(token))
                {
                    return token!.Trim();
                }
            }

            return null;
        }
        catch
        {
            return null;
        }
    }

    private static Type? TryFindWebConnectorType(Assembly assembly)
    {
        if (!SharedActionHostReflection.TryResolveShareApiTypes(out var vmType, out _, out var taskType))
        {
            return null;
        }

        return SharedActionHostReflection.TryFindWebConnectorType(assembly, vmType, taskType);
    }

    private static bool LooksLikeBearerToken(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return false;
        }

        var trimmed = value.Trim();
        if (trimmed.Contains("://", StringComparison.Ordinal)
            || trimmed.StartsWith("http", StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        if (trimmed.StartsWith("eyJ", StringComparison.Ordinal))
        {
            return true;
        }

        return trimmed.Length >= 32 && trimmed.IndexOf('.') >= 0;
    }
}
