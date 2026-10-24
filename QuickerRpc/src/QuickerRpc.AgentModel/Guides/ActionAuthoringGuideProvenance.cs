using System;
using System.Linq;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json.Nodes;

namespace QuickerRpc.AgentModel.Guides;

/// <summary>Fingerprints the actual embedded guide bundle, without consulting a host or source checkout.</summary>
internal static class ActionAuthoringGuideProvenance
{
    private static readonly Assembly Bundle = typeof(ActionAuthoringGuideService).Assembly;
    // Embedded resources cannot change within this loaded assembly. This cache is not native knowledge.
    private static readonly Lazy<string?> IndexRevision = new Lazy<string?>(ReadIndexRevision);

    internal static JsonObject Describe(string markdown, JsonNode? schema) => new JsonObject
    {
        ["schemaVersion"] = 1,
        ["source"] = new JsonObject
        {
            ["provider"] = "qkrpc.guide",
            ["kind"] = IndexRevision.Value is null ? "unknown" : "bundled-fallback",
            ["assemblyName"] = Observe(() => Bundle.GetName().Name),
            ["bundleVersion"] = Observe(() => Bundle.GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion)
                ?? Observe(() => Bundle.GetName().Version?.ToString()),
        },
        ["indexRevision"] = IndexRevision.Value,
        ["contentRevision"] = Revision(new JsonObject
        {
            ["markdown"] = markdown,
            ["schema"] = schema?.DeepClone(),
        }),
    };

    private static string? ReadIndexRevision()
    {
        try
        {
            var names = Bundle.GetManifestResourceNames()
                .Where(name => name.StartsWith(ActionAuthoringGuideService.ResourcePrefix, StringComparison.Ordinal)
                    || name.StartsWith("QuickerRpc.AgentModel.Schemas.", StringComparison.Ordinal))
                .OrderBy(name => name, StringComparer.Ordinal).ToArray();
            if (names.Length == 0) return null;
            var entries = new JsonArray();
            using var sha = SHA256.Create();
            foreach (var name in names)
            {
                using var stream = Bundle.GetManifestResourceStream(name);
                if (stream is null) return null;
                entries.Add(new JsonObject { ["resource"] = name, ["revision"] = HexRevision(sha.ComputeHash(stream)) });
            }
            return Revision(entries);
        }
        catch (Exception)
        {
            // Missing index observations remain unknown, rather than borrowing a checkout or old bundle.
            return null;
        }
    }

    private static string Revision(JsonNode value)
    {
        using var sha = SHA256.Create();
        return HexRevision(sha.ComputeHash(Encoding.UTF8.GetBytes(value.ToJsonString())));
    }

    private static string HexRevision(byte[] hash) => "sha256:" + BitConverter.ToString(hash).Replace("-", "").ToLowerInvariant();

    private static string? Observe(Func<string?> read)
    {
        try { var value = read(); return string.IsNullOrWhiteSpace(value) ? null : value; }
        catch (Exception) { return null; }
    }
}
