using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using QuickerRpc.AgentModel.XAction.Source;
using QuickerRpc.Contracts.Rpc;

namespace QuickerRpc.Console;

/// <summary>The portable YAML edit surface and its private native checkpoint.</summary>
internal static partial class ActionSourceWorkspace
{
    internal const string SourceFile = "program.source.yaml";
    internal const string IdentityFile = "quicker.source.json";
    internal const string BaselineFile = ".qkrpc/baseline.json";
    internal const string BundleSchema = "quicker.source-bundle.v1";
    private static readonly UTF8Encoding Utf8 = new(false, true);

    internal sealed record Prepared(string Directory, string ActionId, long EditVersion, JObject Body, JObject Caw,
        QuickerRpcHostBinding? HostBinding = null,
        QuickerRpcActionStorageIdentity? StorageIdentity = null)
    {
        internal BundleCapture Snapshot { get; init; } = null!;
        internal string SnapshotRevision => Snapshot.Revision;
        internal string EditableBodyJson { get; init; } = string.Empty;
        internal string ConsumedBodyHash => ByteHash(Utf8.GetBytes(EditableBodyJson));
        internal string FrozenBodyJson { get; init; } = string.Empty;
        internal string FrozenCawJson { get; init; } = string.Empty;
    }

    internal static object Open(
        string directory, string actionId, long editVersion, string? title, string? readSource,
        JObject nativeBody, int minLines = 4, bool noAutoFiles = false, IEnumerable<string>? warnings = null,
        QuickerRpcHostBinding? hostBinding = null,
        QuickerRpcActionStorageIdentity? storageIdentity = null)
    {
        var dir = ResolveDirectory(directory);
        ValidateStorageIdentity(storageIdentity, editVersion);
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
        if (storageIdentity is not null) identity["storageIdentity"] = StorageJson(storageIdentity);
        WriteJson(Path.Combine(dir, IdentityFile), identity);
        WriteBaseline(dir, actionId, editVersion, nativeBody, baselineCaw, hostBinding, storageIdentity);
        return new
        {
            ok = true, actionId, editVersion, title, hostBinding, readSource = readSource ?? "catalog",
            projectDirectoryAbsolute = dir, sourcePath = Path.Combine(dir, SourceFile),
            warnings = warnings?.ToArray() ?? Array.Empty<string>(),
            writtenFiles = new[] { SourceFile, IdentityFile, BaselineFile }.Concat(resources.Keys).ToArray(),
            next = "Edit program.source.yaml and files/, then action save --dir <directory> --dry-run; action save --dir <directory>.",
        };
    }

    internal static Prepared Prepare(string directory, string? expectedSnapshot = null)
    {
        var dir = ResolveDirectory(directory);
        using var lease = ActionProjectHostBinding.ClaimValidation(dir, null);
        var capture = Capture(dir);
        RequireExpected(capture, expectedSnapshot, required: false);
        return PrepareCaptured(capture);
    }

    private static Prepared PrepareCaptured(BundleCapture capture)
    {
        var dir = capture.Directory;
        var identity = CapturedJson(capture, IdentityFile);
        if (identity.Value<string>("schema") != BundleSchema || identity.Value<string>("kind") != "action")
            throw new InvalidOperationException("Not a qkrpc action source bundle.");
        var actionId = identity.Value<string>("actionId");
        if (!Guid.TryParse(actionId, out _)) throw new InvalidOperationException("Bundle actionId must be a GUID.");
        var checkpoint = CapturedJson(capture, BaselineFile);
        if (!string.Equals(actionId, checkpoint.Value<string>("actionId"), StringComparison.OrdinalIgnoreCase)
            || !long.TryParse(checkpoint.Value<string>("editVersion"), NumberStyles.Integer, CultureInfo.InvariantCulture, out var version)
            || checkpoint.Value<string>("editVersion") != identity.Value<string>("editVersion"))
            throw new InvalidOperationException("Source identity/checkpoint mismatch. Reopen the action into a new directory.");
        if (checkpoint["body"] is not JObject baseline || checkpoint.Value<string>("bodyHash") != Hash(baseline))
            throw new InvalidOperationException("The native checkpoint is missing or modified. Reopen the action into a new directory.");
        if (checkpoint["caw"] is not JObject baselineCaw || checkpoint.Value<string>("cawHash") != Hash(baselineCaw))
            throw new InvalidOperationException("The source identity map is missing or modified. Reopen the action into a new directory.");
        if (!JToken.DeepEquals(identity["storageIdentity"] ?? JValue.CreateNull(), checkpoint["storageIdentity"] ?? JValue.CreateNull()))
            throw new InvalidOperationException("Source storage identity/checkpoint mismatch. Reopen the action.");
        var storage = identity["storageIdentity"]?.ToObject<QuickerRpcActionStorageIdentity>();
        ValidateStorageIdentity(storage, version);
        var caw = ProgramSourceCodec.Decode(CapturedText(capture, SourceFile));
        ProgramSourceCodec.RequireLosslessRoundtrip(caw);
        Materialize(caw, path => CapturedText(capture, path));
        caw = V1ProgramSourceCodec.NormalizeForSave(caw, baselineCaw);
        var native = V1ProgramSourceCodec.ToNative(caw, baseline, baselineCaw);
        var originalEnvelope = ReadOnlyEnvelope(baseline);
        var updatedEnvelope = ReadOnlyEnvelope(native);
        if (!JToken.DeepEquals(originalEnvelope, updatedEnvelope))
            throw new InvalidOperationException("This workflow edits steps, variables and embedded subprograms only. Root identity and metadata are read-only.");
        if (!JToken.DeepEquals(identity["hostBinding"], checkpoint["hostBinding"]))
            throw new InvalidOperationException("Source host binding/checkpoint mismatch. Reopen into a new directory.");
        var binding = identity["hostBinding"] is JObject bindingJson ? bindingJson.ToObject<QuickerRpcHostBinding>() : null;
        if (string.Equals(binding?.HostKind, "v1", StringComparison.OrdinalIgnoreCase))
            RequireV1VariableDefaultScalars(native);
        return new Prepared(dir, actionId!, version, native, caw, binding, storage)
        {
            Snapshot = capture, EditableBodyJson = EditableBody(native).ToString(Formatting.None),
            FrozenBodyJson = native.ToString(Formatting.None), FrozenCawJson = caw.ToString(Formatting.None),
        };
    }

    private static void RequireV1VariableDefaultScalars(JObject program, string path = "")
    {
        var variables = program.Properties().FirstOrDefault(p => string.Equals(p.Name, "variables", StringComparison.OrdinalIgnoreCase));
        if (variables?.Value is JArray items)
        {
            for (var i = 0; i < items.Count; i++)
            {
                if (items[i] is not JObject variable) continue;
                foreach (var value in variable.Properties().Where(p => string.Equals(p.Name, "DefaultValue", StringComparison.OrdinalIgnoreCase)))
                {
                    if (value.Value.Type is not (JTokenType.Object or JTokenType.Array)) continue;
                    var key = variable.GetValue("Key", StringComparison.OrdinalIgnoreCase)?.Value<string>() ?? "";
                    throw new ProgramSourceException(ProgramSourceCodes.CawInvalid,
                        $"{path}{variables.Name}[{i}].{value.Name} (variable {JsonConvert.SerializeObject(key)}) must be a scalar for V1. "
                        + "Use default.file: files/... for an external text default. Nested file bindings apply to step inputs, not variable defaults.");
                }
            }
        }
        var subPrograms = program.Properties().FirstOrDefault(p => string.Equals(p.Name, "subPrograms", StringComparison.OrdinalIgnoreCase));
        if (subPrograms?.Value is not JArray children) return;
        for (var i = 0; i < children.Count; i++)
            if (children[i] is JObject child) RequireV1VariableDefaultScalars(child, $"{path}{subPrograms.Name}[{i}].");
    }

    internal static void Checkpoint(Prepared prepared, long editVersion, QuickerRpcActionStorageIdentity? storageIdentity = null)
    {
        if (prepared.StorageIdentity is { } old)
        {
            storageIdentity ??= new() { Kind = old.Kind, DraftId = old.DraftId, Version = editVersion };
            if (old.Kind != storageIdentity.Kind || old.DraftId != storageIdentity.DraftId)
                throw new InvalidOperationException("Saved storage identity changed. Reopen the action.");
        }
        ValidateStorageIdentity(storageIdentity, editVersion);
        CheckpointCaptured(prepared, editVersion, storageIdentity);
    }

    private static void WriteBaseline(string dir, string id, long version, JObject body, JObject caw,
        QuickerRpcHostBinding? binding = null,
        QuickerRpcActionStorageIdentity? storageIdentity = null) =>
        WriteJson(Path.Combine(dir, BaselineFile.Replace('/', Path.DirectorySeparatorChar)), new JObject
        {
            ["schema"] = "qkrpc.native-baseline.v1", ["actionId"] = id,
            ["hostBinding"] = binding is null ? null : JObject.FromObject(binding),
            ["editVersion"] = version.ToString(CultureInfo.InvariantCulture),
            ["bodyHash"] = Hash(body), ["body"] = body.DeepClone(),
            ["cawHash"] = Hash(caw), ["caw"] = caw.DeepClone(),
            ["storageIdentity"] = storageIdentity is null ? null : StorageJson(storageIdentity),
        });

    private static JObject StorageJson(QuickerRpcActionStorageIdentity identity) => new()
    { ["kind"] = identity.Kind, ["draftId"] = identity.DraftId, ["version"] = identity.Version.ToString(CultureInfo.InvariantCulture),
        ["contentHash"] = identity.ContentHash };

    private static void ValidateStorageIdentity(QuickerRpcActionStorageIdentity? identity, long version)
    {
        if (identity is not null && (identity.Version != version || identity.Kind is not ("catalog" or "draft")
            || (identity.Kind == "catalog" && !string.IsNullOrEmpty(identity.DraftId))
            || (identity.Kind == "draft" && string.IsNullOrWhiteSpace(identity.DraftId))))
            throw new InvalidOperationException("Native storage identity is invalid or does not match the edit version.");
    }

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
            throw new InvalidOperationException("Native → YAML → native roundtrip changed the action. Export was blocked to preserve its data.");
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
        => Materialize(program, path => ReadText(dir, path));

    private static void Materialize(JObject program, Func<string, string> read)
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
                property.Replace(new JProperty(key, read(relative)));
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
        => LosslessProgramJson.ParseObject(ReadText(dir, relative), maxDepth: 512);

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
