using System.Globalization;
using QuickerRpc.Contracts.Rpc;
using System.Security.Cryptography;
using System.Text;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using QuickerRpc.AgentModel.XAction.Source;

namespace QuickerRpc.Console;

/// <summary>The portable YAML edit surface and its private native checkpoint.</summary>
internal static class ActionSourceWorkspace
{
    internal const string SourceFile = "program.source.yaml";
    internal const string IdentityFile = "quicker.source.json";
    internal const string BaselineFile = ".qkrpc/baseline.json";
    internal const string BundleSchema = "quicker.source-bundle.v1";
    private static readonly UTF8Encoding Utf8 = new(false, true);

    internal sealed record Prepared(string Directory, string ActionId, long EditVersion, JObject Body, JObject Caw, QuickerRpcHostBinding? HostBinding);

    internal static object Open(
        string directory, string actionId, long editVersion, string? title, string? readSource,
        JObject nativeBody, int minLines = 4, bool noAutoFiles = false, IEnumerable<string>? warnings = null, QuickerRpcHostBinding? hostBinding = null)
    {
        var dir = ResolveDirectory(directory);
        RequireLocalPath(dir);
        if (Directory.Exists(dir) && Directory.EnumerateFileSystemEntries(dir).Any())
            throw new InvalidOperationException("Open requires an empty directory. Choose a new directory to preserve local edits.");

        Directory.CreateDirectory(dir);
        var lockPath = Path.Combine(dir, ".qkrpc-open.lock");
        using var claim = new FileStream(lockPath, FileMode.CreateNew, FileAccess.Write, FileShare.None, 1, FileOptions.DeleteOnClose);
        if (Directory.EnumerateFileSystemEntries(dir).Any(p => !string.Equals(p, lockPath, StringComparison.OrdinalIgnoreCase)))
            throw new InvalidOperationException("The source directory is no longer empty. Choose a new directory.");

        var caw = V1ProgramSourceCodec.FromNative(nativeBody);
        // Check the adapter before producing an editable copy of a real action.
        ProgramSourceCodec.RequireLosslessRoundtrip(caw);
        var roundtrip = V1ProgramSourceCodec.ToNative(ProgramSourceCodec.Decode(ProgramSourceCodec.Encode(caw)), nativeBody);
        RequireNativeRoundtrip(nativeBody, roundtrip);
        var baselineCaw = (JObject)caw.DeepClone();
        var resources = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        if (!noAutoFiles) Externalize(caw, Math.Max(0, minLines), resources);
        var yaml = ProgramSourceCodec.Encode(caw);
        Directory.CreateDirectory(dir);
        foreach (var resource in resources)
        {
            var path = Path.Combine(dir, resource.Key.Replace('/', Path.DirectorySeparatorChar));
            Directory.CreateDirectory(Path.GetDirectoryName(path)!);
            File.WriteAllText(path, resource.Value, Utf8);
        }
        File.WriteAllText(Path.Combine(dir, SourceFile), yaml, Utf8);
        var identity = new JObject
        {
            ["schema"] = BundleSchema, ["kind"] = "action", ["actionId"] = actionId,
            ["title"] = title, ["editVersion"] = editVersion.ToString(CultureInfo.InvariantCulture),
            ["hostBinding"] = hostBinding is null ? null : JObject.FromObject(hostBinding),
            ["readSource"] = readSource ?? "catalog", ["exportedUtc"] = DateTime.UtcNow.ToString("O"),
        };
        WriteJson(Path.Combine(dir, IdentityFile), identity);
        WriteBaseline(dir, actionId, editVersion, nativeBody, baselineCaw, hostBinding);
        return new
        {
            ok = true, actionId, editVersion, title, hostBinding, readSource = readSource ?? "catalog",
            projectDirectoryAbsolute = dir, sourcePath = Path.Combine(dir, SourceFile),
            warnings = warnings?.ToArray() ?? Array.Empty<string>(),
            writtenFiles = new[] { SourceFile, IdentityFile, BaselineFile }.Concat(resources.Keys).ToArray(),
            next = "Edit program.source.yaml and files/, then action save --dir <directory> --dry-run; action save --dir <directory>.",
        };
    }

    internal static Prepared Prepare(string directory)
    {
        var dir = ResolveDirectory(directory);
        var identity = ReadJson(dir, IdentityFile);
        if (identity.Value<string>("schema") != BundleSchema || identity.Value<string>("kind") != "action")
            throw new InvalidOperationException("Not a qkrpc V1 action source bundle.");
        var actionId = identity.Value<string>("actionId");
        if (!Guid.TryParse(actionId, out _)) throw new InvalidOperationException("Bundle actionId must be a GUID.");
        var checkpoint = ReadJson(dir, BaselineFile);
        if (!string.Equals(actionId, checkpoint.Value<string>("actionId"), StringComparison.OrdinalIgnoreCase)
            || !long.TryParse(checkpoint.Value<string>("editVersion"), NumberStyles.Integer, CultureInfo.InvariantCulture, out var version)
            || checkpoint.Value<string>("editVersion") != identity.Value<string>("editVersion"))
            throw new InvalidOperationException("Source identity/checkpoint mismatch. Reopen the action into a new directory.");
        if (checkpoint["body"] is not JObject baseline || checkpoint.Value<string>("bodyHash") != Hash(baseline))
            throw new InvalidOperationException("The native checkpoint is missing or modified. Reopen the action into a new directory.");
        if (checkpoint["caw"] is not JObject baselineCaw || checkpoint.Value<string>("cawHash") != Hash(baselineCaw))
            throw new InvalidOperationException("The source identity map is missing or modified. Reopen the action into a new directory.");
        var caw = ProgramSourceCodec.Decode(ReadText(dir, SourceFile));
        ProgramSourceCodec.RequireLosslessRoundtrip(caw);
        Materialize(caw, dir);
        caw = V1ProgramSourceCodec.NormalizeForSave(caw, baselineCaw);
        var native = V1ProgramSourceCodec.ToNative(caw, baseline, baselineCaw);
        var originalEnvelope = ReadOnlyEnvelope(baseline);
        var updatedEnvelope = ReadOnlyEnvelope(native);
        if (!JToken.DeepEquals(originalEnvelope, updatedEnvelope))
            throw new InvalidOperationException("This workflow edits steps, variables and embedded subprograms only. Root identity and metadata are read-only.");
        if (!JToken.DeepEquals(identity["hostBinding"], checkpoint["hostBinding"]))
            throw new InvalidOperationException("Source host binding/checkpoint mismatch. Reopen into a new directory.");
        var binding = identity["hostBinding"] is JObject bindingJson ? bindingJson.ToObject<QuickerRpcHostBinding>() : null;
        return new Prepared(dir, actionId!, version, native, caw, binding);
    }

    internal static void Checkpoint(Prepared prepared, long editVersion)
    {
        var identity = ReadJson(prepared.Directory, IdentityFile);
        identity["editVersion"] = editVersion.ToString(CultureInfo.InvariantCulture);
        WriteBaseline(prepared.Directory, prepared.ActionId, editVersion, prepared.Body, prepared.Caw, prepared.HostBinding);
        WriteJson(Path.Combine(prepared.Directory, IdentityFile), identity);
    }

    private static void WriteBaseline(string dir, string id, long version, JObject body, JObject caw, QuickerRpcHostBinding? binding) =>
        WriteJson(Path.Combine(dir, BaselineFile.Replace('/', Path.DirectorySeparatorChar)), new JObject
        {
            ["schema"] = "qkrpc.native-baseline.v1", ["actionId"] = id,
            ["hostBinding"] = binding is null ? null : JObject.FromObject(binding),
            ["editVersion"] = version.ToString(CultureInfo.InvariantCulture),
            ["bodyHash"] = Hash(body), ["body"] = body.DeepClone(),
            ["cawHash"] = Hash(caw), ["caw"] = caw.DeepClone(),
        });

    private static string Hash(JObject body) => Convert.ToHexString(SHA256.HashData(Utf8.GetBytes(body.ToString(Formatting.None))));

    internal static JArray ProgramArray(JObject body, string name) =>
        body.GetValue(name, StringComparison.OrdinalIgnoreCase) as JArray ?? new JArray();

    private static JObject ReadOnlyEnvelope(JObject body) => new(body.Properties()
        .Where(p => !new[] { "steps", "variables", "subPrograms" }.Contains(p.Name, StringComparer.OrdinalIgnoreCase))
        .Select(p => new JProperty(p.Name.ToLowerInvariant(), p.Value.DeepClone())));

    private static void RequireNativeRoundtrip(JObject expected, JObject actual)
    {
        // Object property order is immaterial; values and array order must survive unchanged.
        if (!JToken.DeepEquals(expected, actual))
            throw new InvalidOperationException("Native V1 → YAML → native roundtrip changed the action. Export was blocked to preserve its data.");
    }

    private static void Externalize(JObject program, int minLines, IDictionary<string, string> resources)
    {
        if (minLines <= 0) return;
        VisitProgram(program, (inputs, variable) =>
        {
            foreach (var property in inputs.Properties().ToArray())
            {
                if ((variable && property.Name != "default") || property.Name.EndsWith(".var", StringComparison.Ordinal) || property.Name.EndsWith(".file", StringComparison.Ordinal)
                    || property.Value.Type != JTokenType.String) continue;
                var value = property.Value.Value<string>()!;
                if (value.Count(c => c == '\n') < minLines) continue;
                var path = $"files/source-{resources.Count + 1}.txt";
                resources.Add(path, value);
                property.Replace(new JProperty(property.Name + ".file", path));
            }
        });
    }

    private static void Materialize(JObject program, string dir)
    {
        VisitProgram(program, (inputs, variable) =>
        {
            foreach (var property in inputs.Properties().Where(p => p.Name.EndsWith(".file", StringComparison.Ordinal)).ToArray())
            {
                var key = property.Name[..^5];
                if (inputs.Property(key) is not null || inputs.Property(key + ".var") is not null)
                    throw new InvalidOperationException($"Conflicting file binding: {property.Name}.");
                if (property.Value.Type != JTokenType.String) throw new InvalidOperationException("File references must be strings.");
                var relative = property.Value.Value<string>()!;
                if (!relative.Replace('\\', '/').StartsWith("files/", StringComparison.Ordinal))
                    throw new InvalidOperationException("File references must be below files/.");
                property.Replace(new JProperty(key, ReadText(dir, relative)));
            }
        });
    }

    private static void VisitProgram(JObject program, Action<JObject, bool> visit)
    {
        if (program["variables"] is JArray variables)
            foreach (var variable in variables.OfType<JObject>()) visit(variable, true);
        if (program["steps"] is JArray steps) VisitSteps(steps, visit);
        if (program["subPrograms"] is JArray subPrograms)
            foreach (var sub in subPrograms.OfType<JObject>()) VisitProgram(sub, visit);
    }

    private static void VisitSteps(JArray steps, Action<JObject, bool> visit)
    {
        foreach (var step in steps.OfType<JObject>())
        {
            if (step["inputs"] is JObject inputs) visit(inputs, false);
            if (step["ifSteps"] is JArray thenSteps) VisitSteps(thenSteps, visit);
            if (step["elseSteps"] is JArray elseSteps) VisitSteps(elseSteps, visit);
        }
    }

    private static string ResolveDirectory(string directory) => !string.IsNullOrWhiteSpace(directory)
        ? Path.GetFullPath(directory) : throw new ArgumentException("dir is required.");

    private static JObject ReadJson(string dir, string relative)
    {
        using var reader = new JsonTextReader(new StringReader(ReadText(dir, relative))) { DateParseHandling = DateParseHandling.None };
        return JObject.Load(reader);
    }

    private static string ReadText(string directory, string relative)
    {
        var normalized = relative.Replace('\\', '/');
        if (Path.IsPathRooted(relative) || normalized.Split('/').Any(p => p is "" or "." or ".." || p.Contains(':')))
            throw new InvalidOperationException($"Invalid source path: {relative}.");
        var dir = Path.GetFullPath(directory);
        var path = Path.GetFullPath(Path.Combine(dir, normalized.Replace('/', Path.DirectorySeparatorChar)));
        if (!path.StartsWith(dir.TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("Source path escapes the bundle.");
        RequireLocalPath(path);
        return File.ReadAllText(path, Utf8);
    }

    private static void RequireLocalPath(string path)
    {
        for (var current = path; !string.IsNullOrEmpty(current); current = Path.GetDirectoryName(current))
        {
            if (!File.Exists(current) && !Directory.Exists(current)) continue;
            var attributes = File.GetAttributes(current);
            const FileAttributes disallowed = FileAttributes.ReparsePoint | FileAttributes.Offline | (FileAttributes)0x40000 | (FileAttributes)0x400000;
            if ((attributes & disallowed) != 0)
                throw new InvalidOperationException($"Source paths cannot use links or cloud placeholders: {current}.");
        }
    }

    private static void WriteJson(string path, JObject value)
    {
        RequireLocalPath(path);
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        var temporary = path + "." + Guid.NewGuid().ToString("N") + ".tmp";
        File.WriteAllText(temporary, value.ToString(Formatting.Indented) + "\n", Utf8);
        File.Move(temporary, path, overwrite: true);
    }
}
