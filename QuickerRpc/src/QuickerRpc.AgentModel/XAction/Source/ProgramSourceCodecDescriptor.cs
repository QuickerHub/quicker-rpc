using System;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json.Nodes;

namespace QuickerRpc.AgentModel.XAction.Source;

/// <summary>Describes the loaded local codec without discovering or authorizing a native host.</summary>
public static class ProgramSourceCodecDescriptor
{
    /// <summary>
    /// Returns a detached descriptor. Its revision hashes this descriptor's compact UTF-8 JSON,
    /// excluding descriptorRevision; it is not a source-code or native-definition fingerprint.
    /// </summary>
    public static JsonObject Describe()
    {
        var codec = typeof(ProgramSourceCodec);
        var assembly = codec.Assembly;
        var assemblyName = Observe(() => assembly.GetName().Name);
        var assemblyVersion = Observe(() => assembly.GetName().Version?.ToString());
        var informationalVersion = Observe(() => assembly.GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion);
        var moduleVersionId = Observe(() =>
        {
            var id = codec.Module.ModuleVersionId;
            return id == Guid.Empty ? null : id.ToString("D");
        });
        var formats = new JsonArray();
        foreach (var format in ProgramSourceSchemas.SupportedFormats) formats.Add(format);
        var descriptor = new JsonObject
        {
            ["schemaVersion"] = 1,
            ["source"] = new JsonObject
            {
                ["provider"] = "qkrpc.program-source-codec",
                ["kind"] = "local-codec",
                ["assemblyName"] = assemblyName,
                ["assemblyVersion"] = assemblyVersion,
                ["informationalVersion"] = informationalVersion,
                ["moduleVersionId"] = moduleVersionId,
                ["identityStatus"] = assemblyName is not null && assemblyVersion is not null
                    && informationalVersion is not null && moduleVersionId is not null ? "known" : "unknown",
            },
            ["formats"] = new JsonObject
            {
                ["inputs"] = formats,
                ["output"] = ProgramSourceSchemas.SourceV1,
                ["omittedInput"] = "legacy-compatible",
            },
            ["nativeSource"] = new JsonObject
            {
                ["status"] = "unknown",
                ["read"] = null,
                ["write"] = null,
            },
        };
        using var hash = SHA256.Create();
        var bytes = Encoding.UTF8.GetBytes(descriptor.ToJsonString());
        descriptor["descriptorRevision"] = "sha256:" + BitConverter.ToString(hash.ComputeHash(bytes))
            .Replace("-", string.Empty).ToLowerInvariant();
        return descriptor;
    }

    private static string? Observe(Func<string?> read)
    {
        try
        {
            var value = read();
            return string.IsNullOrWhiteSpace(value) ? null : value;
        }
        catch (Exception)
        {
            return null;
        }
    }
}
