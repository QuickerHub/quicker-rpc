using System.Globalization;
using System.Security.Cryptography;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using QuickerRpc.AgentModel.XAction.Source;
using QuickerRpc.Contracts.Rpc;

namespace QuickerRpc.Console;

internal sealed class SourceDocumentWriteException(string message, string[] writtenFiles, string failedFile, Exception inner)
    : IOException(message, inner)
{
    internal string[] WrittenFiles { get; } = writtenFiles;
    internal string FailedFile { get; } = failedFile;
}

internal static partial class ActionSourceWorkspace
{
    private const string SnapshotConflict = "SOURCE_SNAPSHOT_CONFLICT";
    private const int MaxFiles = 2048;
    private const long MaxBundleBytes = 64 * 1024 * 1024;

    internal sealed record BundleCapture(string Directory, SortedDictionary<string, byte[]> Files, JObject Codec,
        string Revision, string ManagedRevision)
    {
        internal JObject Manifest() => new()
        {
            ["revision"] = Revision, ["managedRevision"] = ManagedRevision,
            ["codecRevision"] = Codec.Value<string>("descriptorRevision"),
            ["files"] = new JArray(Files.Select(pair => new JObject
            { ["path"] = pair.Key, ["sha256"] = ByteHash(pair.Value), ["bytes"] = pair.Value.LongLength })),
        };
    }

    internal static JObject Document(string directory, string mode, string? expectedSnapshot, string? editorJson,
        JArray? resources, CancellationToken token, string? baselineEditorJson = null)
    {
        token.ThrowIfCancellationRequested();
        if (mode is not ("inspect" or "preview" or "save-local"))
            throw new ProgramSourceException("INVALID_ARGS", "mode must be inspect, preview or save-local.");
        var dir = ResolveDirectory(directory);
        using var lease = ActionProjectHostBinding.ClaimValidation(dir, null);
        var capture = Capture(dir, token);
        RequireExpected(capture, expectedSnapshot, required: mode != "inspect");
        var originalPrepared = PrepareCaptured(capture);
        var raw = ProgramSourceCodec.Decode(CapturedText(capture, SourceFile));
        var baseline = CapturedJson(capture, BaselineFile);
        var projection = ProgramSourceEditorProjection.Create(raw, (JObject)baseline["caw"]!, (JObject)baseline["body"]!);
        if (mode == "inspect") return Describe(capture, originalPrepared, projection.EditorJson, mode);
        if (string.IsNullOrWhiteSpace(editorJson)) throw new ProgramSourceException("INVALID_ARGS", "editorJson must contain the complete lossless Editor JSON text.");

        var updated = projection.ToCaw(editorJson, baselineEditorJson);
        if (!JToken.DeepEquals(ReadOnlyEnvelope(raw), ReadOnlyEnvelope(updated)))
            throw new ProgramSourceException("SOURCE_DOCUMENT_READ_ONLY", "Source root identity and metadata are read-only.");
        // Equality is checked before canonical emission so an unchanged document keeps comments,
        // BOM and newline bytes, even if the source was formatted by hand.
        var sourceUnchanged = JToken.DeepEquals(raw, updated);
        var source = sourceUnchanged ? capture.Files[SourceFile] : Utf8.GetBytes(ProgramSourceCodec.Encode(updated));
        var replacements = DecodeResourceWrites(resources);
        var proposedFiles = new SortedDictionary<string, byte[]>(capture.Files, StringComparer.Ordinal)
        { [SourceFile] = source };
        foreach (var replacement in replacements)
        {
            if (OperatingSystem.IsWindows() && capture.Files.Keys.Any(path => path != replacement.Key && string.Equals(path, replacement.Key, StringComparison.OrdinalIgnoreCase)))
                throw new ProgramSourceException("SOURCE_DOCUMENT_INVALID_PATH", "Resource writes must retain the captured path spelling.");
            proposedFiles[replacement.Key] = replacement.Value;
            var path = SafeBundlePath(dir, replacement.Key);
            for (var parent = Path.GetDirectoryName(path); parent is not null && parent != dir; parent = Path.GetDirectoryName(parent))
                if (File.Exists(parent)) throw new ProgramSourceException("SOURCE_DOCUMENT_INVALID_PATH", "A resource parent is an existing file.");
        }
        if (proposedFiles.Count > MaxFiles || proposedFiles.Sum(pair => pair.Value.LongLength) > MaxBundleBytes)
            throw new ProgramSourceException("SOURCE_DOCUMENT_TOO_LARGE", "The proposed bundle exceeds its capture limits.");
        var proposed = MakeCapture(dir, proposedFiles, capture.Codec);
        var compiled = PrepareCaptured(proposed);
        // The adapter may normalize aliases, but it cannot authorize metadata writes.
        if (!JToken.DeepEquals(ReadOnlyEnvelope(originalPrepared.Body), ReadOnlyEnvelope(compiled.Body)))
            throw new ProgramSourceException("SOURCE_DOCUMENT_READ_ONLY", "Source root identity and metadata are read-only.");
        token.ThrowIfCancellationRequested();
        var normalization = sourceUnchanged ? "unchanged-original" : "codec-normalized";
        if (mode == "preview")
        {
            var output = Describe(capture, compiled, editorJson, mode);
            output["preview"] = new JObject
            {
                ["sourceYaml"] = Utf8.GetString(source), ["normalization"] = normalization,
                ["consumedSnapshot"] = capture.Revision, ["consumedBodyHash"] = compiled.ConsumedBodyHash,
            };
            return output;
        }

        RequireSameCapture(capture, Capture(dir, token));
        var written = new List<string>();
        var failed = SourceFile;
        try
        {
            // Only explicitly supplied resources are written. Managed sidecars never participate.
            foreach (var replacement in replacements.Append(new KeyValuePair<string, byte[]>(SourceFile, source)))
            {
                failed = replacement.Key;
                capture.Files.TryGetValue(replacement.Key, out var before);
                if (before is not null && before.AsSpan().SequenceEqual(replacement.Value)) continue;
                token.ThrowIfCancellationRequested();
                AssertManagedBytes(capture);
                CompareWrite(dir, replacement.Key, before, replacement.Value);
                written.Add(replacement.Key);
            }
            var after = Capture(dir, token);
            if (after.ManagedRevision != capture.ManagedRevision || !SameFiles(after.Files, proposed.Files))
                throw Conflict("Bundle changed during local save. Written files are retained; inspect again, do not replay.");
            var output = Describe(after, PrepareCaptured(after), editorJson, mode);
            output["saveLocal"] = new JObject
            {
                ["writtenFiles"] = new JArray(written), ["normalization"] = normalization,
                ["baselineAdvanced"] = false,
            };
            return output;
        }
        catch (Exception ex) when (written.Count > 0)
        {
            throw new SourceDocumentWriteException("Local save did not complete as one confirmed bundle update. Do not replay.", written.ToArray(), failed, ex);
        }
    }

    private static JObject Describe(BundleCapture capture, Prepared prepared, string editorJson, string mode)
    {
        var identity = CapturedJson(capture, IdentityFile);
        var baseline = CapturedJson(capture, BaselineFile);
        var oldBody = EditableBody((JObject)baseline["body"]!);
        var body = LosslessProgramJson.ParseObject(prepared.EditableBodyJson);
        return new JObject
        {
            ["schemaVersion"] = 1, ["kind"] = "source-bundle-document", ["mode"] = mode,
            ["projectDirectoryAbsolute"] = capture.Directory, ["actionId"] = prepared.ActionId,
            ["editVersion"] = prepared.EditVersion.ToString(CultureInfo.InvariantCulture),
            ["hostBinding"] = identity["hostBinding"]?.DeepClone() ?? JValue.CreateNull(),
            ["storageIdentity"] = identity["storageIdentity"]?.DeepClone() ?? JValue.CreateNull(),
            ["identityJson"] = Utf8.GetString(capture.Files[IdentityFile]),
            ["sourceYaml"] = Utf8.GetString(capture.Files[SourceFile]), ["editorJson"] = editorJson,
            ["codec"] = capture.Codec.DeepClone(), ["sourceSnapshot"] = capture.Manifest(),
            ["pending"] = new JObject
            {
                ["status"] = JToken.DeepEquals(body, oldBody) ? "clean" : "pending",
                ["comparedTo"] = "managed-native-checkpoint", ["nativeState"] = "unobserved",
                ["currentBodyHash"] = prepared.ConsumedBodyHash,
                ["baselineBodyHash"] = ByteHash(Utf8.GetBytes(oldBody.ToString(Formatting.None))),
            },
            ["capabilities"] = new JObject
            {
                ["read"] = true, ["preview"] = true, ["saveLocal"] = true,
                ["metadataWrite"] = false, ["nativeSync"] = "unobserved", ["snapshotAuthorizesWrite"] = false,
            },
            ["projection"] = new JObject
            {
                ["format"] = "quicker.editor-json.v1", ["identityMapping"] = "server-derived-per-source-snapshot",
                ["generatedVariableIdsAreNative"] = false, ["losslessNumbers"] = "json-text",
                ["metadataEditable"] = false, ["unsupportedCode"] = "SOURCE_DOCUMENT_UNSUPPORTED",
            },
        };
    }

    internal static void AssertManagedUnchanged(Prepared prepared)
    {
        using var lease = ActionProjectHostBinding.ClaimValidation(prepared.Directory, null);
        AssertManagedBytes(prepared.Snapshot);
    }

    private static void AssertManagedBytes(BundleCapture expected)
    {
        if (CurrentCodec().Value<string>("descriptorRevision") != expected.Codec.Value<string>("descriptorRevision"))
            throw Conflict("The loaded codec changed after the document was read.");
        foreach (var relative in new[] { IdentityFile, BaselineFile })
            RequireCurrentBytes(expected.Directory, relative, expected.Files[relative]);
    }

    private static void CheckpointCaptured(Prepared prepared, long editVersion, QuickerRpcActionStorageIdentity? storage)
    {
        using var lease = ActionProjectHostBinding.ClaimValidation(prepared.Directory, null);
        var capture = prepared.Snapshot;
        AssertManagedBytes(capture);
        var identity = CapturedJson(capture, IdentityFile);
        var checkpoint = CapturedJson(capture, BaselineFile);
        identity["editVersion"] = checkpoint["editVersion"] = editVersion.ToString(CultureInfo.InvariantCulture);
        var frozenBody = LosslessProgramJson.ParseObject(prepared.FrozenBodyJson);
        var frozenCaw = LosslessProgramJson.ParseObject(prepared.FrozenCawJson);
        checkpoint["body"] = frozenBody; checkpoint["bodyHash"] = Hash(frozenBody);
        checkpoint["caw"] = frozenCaw; checkpoint["cawHash"] = Hash(frozenCaw);
        if (storage is not null)
        {
            var updatedStorage = identity["storageIdentity"] as JObject ?? new JObject();
            foreach (var property in StorageJson(storage).Properties()) updatedStorage[property.Name] = property.Value.DeepClone();
            identity["storageIdentity"] = updatedStorage; checkpoint["storageIdentity"] = updatedStorage.DeepClone();
        }
        var checkpointBytes = JsonBytes(checkpoint); var identityBytes = JsonBytes(identity);
        CompareWrite(prepared.Directory, BaselineFile, capture.Files[BaselineFile], checkpointBytes);
        // A partial two-file replacement is reported, never rolled back over an external writer.
        RequireCurrentBytes(prepared.Directory, BaselineFile, checkpointBytes);
        CompareWrite(prepared.Directory, IdentityFile, capture.Files[IdentityFile], identityBytes);
        RequireCurrentBytes(prepared.Directory, BaselineFile, checkpointBytes);
        RequireCurrentBytes(prepared.Directory, IdentityFile, identityBytes);
    }

    private static BundleCapture Capture(string directory, CancellationToken token = default)
    {
        var dir = ResolveDirectory(directory);
        var paths = CapturePaths(dir);
        var files = new SortedDictionary<string, byte[]>(StringComparer.Ordinal);
        long total = 0;
        foreach (var relative in paths)
        {
            token.ThrowIfCancellationRequested();
            var path = SafeBundlePath(dir, relative);
            var length = new FileInfo(path).Length;
            if (length > MaxBundleBytes || checked(total + length) > MaxBundleBytes)
                throw new ProgramSourceException("SOURCE_DOCUMENT_TOO_LARGE", "Source bundle exceeds its 64 MiB capture limit.");
            var bytes = File.ReadAllBytes(path); total += bytes.LongLength;
            if (total > MaxBundleBytes) throw new ProgramSourceException("SOURCE_DOCUMENT_TOO_LARGE", "Source bundle exceeds its capture limit.");
            files.Add(relative, bytes);
        }
        // The lease coordinates product writers; external editors must also pass byte rechecks.
        foreach (var pair in files) { token.ThrowIfCancellationRequested(); RequireCurrentBytes(dir, pair.Key, pair.Value); }
        if (!paths.SequenceEqual(CapturePaths(dir), StringComparer.Ordinal)) throw Conflict("Resource paths changed during capture.");
        return MakeCapture(dir, files, CurrentCodec());
    }

    private static string[] CapturePaths(string dir)
    {
        var paths = new List<string> { SourceFile, IdentityFile, BaselineFile };
        var root = SafeBundlePath(dir, "files");
        if (Directory.Exists(root)) Visit(root);
        return paths.OrderBy(path => path, StringComparer.Ordinal).ToArray();
        void Visit(string folder)
        {
            foreach (var entry in Directory.EnumerateFileSystemEntries(folder).OrderBy(path => path, StringComparer.Ordinal))
            {
                SafeBundlePath(dir, Path.GetRelativePath(dir, entry).Replace('\\', '/'));
                if (Directory.Exists(entry)) Visit(entry);
                else paths.Add(Path.GetRelativePath(dir, entry).Replace('\\', '/'));
                if (paths.Count > MaxFiles) throw new ProgramSourceException("SOURCE_DOCUMENT_TOO_LARGE", "Too many source resource files.");
            }
        }
    }

    private static BundleCapture MakeCapture(string dir, SortedDictionary<string, byte[]> files, JObject codec)
    {
        string Revision(IEnumerable<KeyValuePair<string, byte[]>> items) => ByteHash(Utf8.GetBytes(new JObject
        {
            ["codecRevision"] = codec.Value<string>("descriptorRevision"),
            ["files"] = new JArray(items.Select(pair => new JObject { ["path"] = pair.Key, ["hash"] = ByteHash(pair.Value), ["bytes"] = pair.Value.LongLength })),
        }.ToString(Formatting.None)));
        return new BundleCapture(dir, files, codec, Revision(files), Revision(files.Where(pair => pair.Key is IdentityFile or BaselineFile)));
    }

    private static JObject CurrentCodec() => LosslessProgramJson.ParseObject(ProgramSourceCodecDescriptor.Describe().ToJsonString());
    private static JObject CapturedJson(BundleCapture capture, string relative) => LosslessProgramJson.ParseObject(CapturedText(capture, relative), 512);
    private static string CapturedText(BundleCapture capture, string relative)
    {
        relative = NormalizeBundleRelative(relative);
        if (!capture.Files.TryGetValue(relative, out var bytes) && OperatingSystem.IsWindows())
            bytes = capture.Files.FirstOrDefault(pair => string.Equals(pair.Key, relative, StringComparison.OrdinalIgnoreCase)).Value;
        if (bytes is null) throw new IOException($"Source resource is missing: {relative}.");
        var text = Utf8.GetString(bytes);
        return text.Length > 0 && text[0] == '\uFEFF' ? text[1..] : text;
    }
    private static string NormalizeBundleRelative(string relative)
    {
        var normalized = relative.Replace('\\', '/');
        if (Path.IsPathRooted(relative) || normalized.Split('/').Any(part => part is "" or "." or ".." || part.Contains(':')))
            throw new ProgramSourceException("SOURCE_DOCUMENT_INVALID_PATH", "Invalid source bundle path.");
        return normalized;
    }
    private static string SafeBundlePath(string dir, string relative)
    {
        relative = NormalizeBundleRelative(relative);
        var path = Path.GetFullPath(Path.Combine(dir, relative.Replace('/', Path.DirectorySeparatorChar)));
        if (!path.StartsWith(dir.TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar,
            OperatingSystem.IsWindows() ? StringComparison.OrdinalIgnoreCase : StringComparison.Ordinal))
            throw new ProgramSourceException("SOURCE_DOCUMENT_INVALID_PATH", "Source path escapes the bundle.");
        foreach (var part in path.Split(new[] { Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar }))
            if (part.StartsWith("OneDrive", StringComparison.OrdinalIgnoreCase) || part.Equals("Dropbox", StringComparison.OrdinalIgnoreCase) || part.StartsWith("iCloud", StringComparison.OrdinalIgnoreCase))
                throw new ProgramSourceException("SOURCE_DOCUMENT_INVALID_PATH", "Cloud source paths are not supported.");
        ActionProjectHostBinding.RequireSafePath(path);
        return path;
    }
    private static SortedDictionary<string, byte[]> DecodeResourceWrites(JArray? resources)
    {
        var result = new SortedDictionary<string, byte[]>(StringComparer.Ordinal);
        var insensitive = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        long total = 0;
        if (resources is null) return result;
        foreach (var item in resources)
        {
            if (item is not JObject resource || resource["path"]?.Type != JTokenType.String || resource["contentBase64"]?.Type != JTokenType.String
                || resource.Properties().Any(property => property.Name is not ("path" or "contentBase64")))
                throw new ProgramSourceException("INVALID_ARGS", "Each resource must contain only path and contentBase64 strings.");
            var path = NormalizeBundleRelative(resource.Value<string>("path")!);
            if (!path.StartsWith("files/", StringComparison.Ordinal) || !insensitive.Add(path))
                throw new ProgramSourceException("SOURCE_DOCUMENT_INVALID_PATH", "Resource writes must be unique files/* paths.");
            var encoded = resource.Value<string>("contentBase64")!;
            if (encoded.Length > MaxBundleBytes * 2) throw new ProgramSourceException("SOURCE_DOCUMENT_TOO_LARGE", "Resource content exceeds its limit.");
            byte[] bytes;
            try { bytes = Convert.FromBase64String(encoded); }
            catch (FormatException) { throw new ProgramSourceException("INVALID_ARGS", "Resource contentBase64 is invalid."); }
            total += bytes.LongLength;
            if (total > MaxBundleBytes || result.Count >= MaxFiles) throw new ProgramSourceException("SOURCE_DOCUMENT_TOO_LARGE", "Resource writes exceed their limit.");
            result.Add(path, bytes);
        }
        return result;
    }
    private static void RequireExpected(BundleCapture capture, string? expected, bool required)
    {
        if (expected is null) { if (required) throw new ProgramSourceException("SOURCE_SNAPSHOT_REQUIRED", "expectedSnapshot is required."); return; }
        if (!string.Equals(expected, capture.Revision, StringComparison.Ordinal)) throw Conflict("Bundle bytes or codec changed. Inspect again.");
    }
    private static void RequireSameCapture(BundleCapture expected, BundleCapture actual)
    { if (expected.Revision != actual.Revision) throw Conflict("Bundle changed after capture. No local save was started."); }
    private static bool SameFiles(SortedDictionary<string, byte[]> left, SortedDictionary<string, byte[]> right) =>
        left.Count == right.Count && left.All(pair => right.TryGetValue(pair.Key, out var bytes) && pair.Value.AsSpan().SequenceEqual(bytes));
    private static void RequireCurrentBytes(string dir, string relative, byte[]? expected)
    {
        var path = SafeBundlePath(dir, relative);
        if (expected is null) { if (File.Exists(path) || Directory.Exists(path)) throw Conflict($"A competing file appeared: {relative}."); return; }
        if (!File.Exists(path) || !File.ReadAllBytes(path).AsSpan().SequenceEqual(expected)) throw Conflict($"Source bytes changed: {relative}.");
    }
    private static void CompareWrite(string dir, string relative, byte[]? expected, byte[] value)
    {
        var path = SafeBundlePath(dir, relative);
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        var temporary = path + "." + Guid.NewGuid().ToString("N") + ".tmp";
        try
        {
            using (var stream = new FileStream(temporary, FileMode.CreateNew, FileAccess.Write, FileShare.None)) stream.Write(value);
            RequireCurrentBytes(dir, relative, expected);
            SafeBundlePath(dir, relative);
            File.Move(temporary, path, overwrite: expected is not null);
        }
        finally { if (File.Exists(temporary)) File.Delete(temporary); }
    }
    private static byte[] JsonBytes(JObject value) => Utf8.GetBytes(value.ToString(Formatting.Indented) + "\n");
    private static JObject EditableBody(JObject body) => new()
    {
        ["Steps"] = ProgramArray(body, "Steps").DeepClone(), ["Variables"] = ProgramArray(body, "Variables").DeepClone(),
        ["SubPrograms"] = ProgramArray(body, "SubPrograms").DeepClone(),
    };
    private static string ByteHash(byte[] bytes) => "sha256:" + Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant();
    private static ProgramSourceException Conflict(string message) => new(SnapshotConflict, message);
}
