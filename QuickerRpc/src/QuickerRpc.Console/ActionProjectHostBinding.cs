using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;
using Microsoft.Win32.SafeHandles;
using QuickerRpc.Contracts.Rpc;

namespace QuickerRpc.Console;

/// <summary>Tool-owned provenance for legacy disk projects; never grants native storage identity.</summary>
internal static class ActionProjectHostBinding
{
    internal const string RelativePath = ".qkrpc/project-binding.json";
    internal const string LeaseFile = ".qkrpc-project.lock";
    private static readonly JsonSerializerOptions Json = new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase, PropertyNameCaseInsensitive = true };
    internal sealed record Document(int SchemaVersion, string Kind, string ActionId, QuickerRpcHostBinding HostBinding)
    {
        internal string Directory { get; init; } = string.Empty;
    }

    internal static Document Read(string directory, string? expectedActionId = null)
    {
        var path = Path.Combine(Path.GetFullPath(directory), RelativePath.Replace('/', Path.DirectorySeparatorChar));
        RequireSafePath(path);
        if (!File.Exists(path)) throw Failure(QuickerRpcBindingErrors.Required, "This disk project has no verified host binding. Reopen explicitly into a new directory.");
        if (new FileInfo(path).Length > 128000) throw Failure(QuickerRpcBindingErrors.InvalidHandshake, "Project binding is too large.");
        var record = JsonSerializer.Deserialize<Document>(File.ReadAllText(path, Encoding.UTF8), Json)
            ?? throw Failure(QuickerRpcBindingErrors.InvalidHandshake, "Project binding is invalid.");
        var binding = record.HostBinding;
        if (record.SchemaVersion != 1 || record.Kind != "action" || !Guid.TryParse(record.ActionId, out _)
            || binding is null || string.IsNullOrWhiteSpace(binding.HostInstanceId)
            || !Guid.TryParseExact(binding.HostSessionId, "N", out _)
            || binding.Endpoint != QuickerRpcEndpointNames.ForSession(binding.HostSessionId)
            || binding.ProtocolVersion != 1 || binding.SchemaVersion != 1 || binding.HostKind is not ("v1" or "v2"))
            throw Failure(QuickerRpcBindingErrors.InvalidHandshake, "Project binding is invalid.");
        if (!string.IsNullOrWhiteSpace(expectedActionId) && !string.Equals(record.ActionId, expectedActionId, StringComparison.OrdinalIgnoreCase))
            throw Failure(QuickerRpcBindingErrors.Mismatch, "Project binding belongs to another action.");
        RequireDirectoryActionId(directory, record.ActionId);
        var infoPath = Path.Combine(Path.GetFullPath(directory), "info.json");
        RequireSafePath(infoPath);
        if (File.Exists(infoPath))
        {
            if (new FileInfo(infoPath).Length > 128000) throw Failure(QuickerRpcBindingErrors.InvalidHandshake, "Project identity metadata is too large.");
            using var info = JsonDocument.Parse(File.ReadAllText(infoPath));
            foreach (var key in new[] { "id", "Id", "ID", "actionId" })
                if (info.RootElement.TryGetProperty(key, out var id) && id.ValueKind == JsonValueKind.String
                    && !string.Equals(id.GetString(), record.ActionId, StringComparison.OrdinalIgnoreCase))
                    throw Failure(QuickerRpcBindingErrors.Mismatch, "Project metadata and binding identify different actions.");
        }
        return record with { Directory = Path.GetFullPath(directory) };
    }

    internal static IDisposable ClaimExport(string directory, string actionId, QuickerRpcHostBinding? binding, bool allowExisting = true, ActionProjectExpectedBinding? expected = null)
    {
        if (binding is null) throw Failure(QuickerRpcBindingErrors.Required, "Disk export requires a verified host binding.");
        var dir = Path.GetFullPath(directory);
        RequireDirectoryActionId(dir, actionId);
        RequireSafePath(dir);
        Directory.CreateDirectory(dir);
        var leasePath = Path.Combine(dir, LeaseFile);
        var lease = ClaimLease(dir);
        try
        {
            expected?.AssertMatches(dir);
            var path = Path.Combine(dir, RelativePath.Replace('/', Path.DirectorySeparatorChar));
            RequireSafePath(path);
            if (File.Exists(path))
            {
                if (!allowExisting) throw Failure("PROJECT_ALREADY_EXISTS", "Create bootstrap cannot replace an existing project.");
                var existing = Read(dir, actionId);
                if (!existing.HostBinding.SameDestination(binding))
                    throw Failure(QuickerRpcBindingErrors.Mismatch, "The project and export belong to different host sessions.");
            }
            else if (Directory.EnumerateFileSystemEntries(dir).Any(entry => Path.GetFileName(entry) != LeaseFile))
                throw Failure(QuickerRpcBindingErrors.Required, "An existing disk project cannot be implicitly rebound. Reopen into a new directory.");
            // Exporters may update nested resources before the final info/data writer runs.
            InspectTree(dir, leasePath, new Counter());
            return lease;
        }
        catch { lease.Dispose(); throw; }
    }

    internal static IDisposable ClaimValidation(string directory, ActionProjectExpectedBinding? expected)
    {
        var dir = Path.GetFullPath(directory);
        var lease = ClaimLease(dir);
        try
        {
            expected?.AssertMatches(dir);
            InspectTree(dir, Path.Combine(dir, LeaseFile), new Counter());
            return lease;
        }
        catch { lease.Dispose(); throw; }
    }

    private static FileStream ClaimLease(string directory)
    {
        RequireSafePath(directory);
        var leasePath = Path.Combine(directory, LeaseFile);
        if (Path.Exists(leasePath)) throw Failure("PROJECT_BUSY", "Another process owns this project export.");
        RequireSafePath(leasePath);
        try { return new FileStream(leasePath, FileMode.CreateNew, FileAccess.Write, FileShare.None, 1, FileOptions.DeleteOnClose); }
        catch (IOException ex) { throw Failure("PROJECT_BUSY", "Another process owns this project export. " + ex.Message); }
    }

    internal static void WriteAfterExport(string directory, string actionId, QuickerRpcHostBinding binding)
    {
        var dir = Path.GetFullPath(directory);
        RequireDirectoryActionId(dir, actionId);
        var path = Path.Combine(dir, RelativePath.Replace('/', Path.DirectorySeparatorChar));
        RequireSafePath(path);
        if (File.Exists(path))
        {
            if (!Read(dir, actionId).HostBinding.SameDestination(binding))
                throw Failure(QuickerRpcBindingErrors.Mismatch, "Project binding changed during export.");
            return;
        }
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        var temporary = path + "." + Guid.NewGuid().ToString("N") + ".tmp";
        try
        {
            using (var file = new FileStream(temporary, FileMode.CreateNew, FileAccess.Write, FileShare.None))
            using (var writer = new StreamWriter(file, new UTF8Encoding(false)))
                writer.Write(JsonSerializer.Serialize(new Document(1, "action", Guid.Parse(actionId).ToString("D"), binding), Json) + "\n");
            File.Move(temporary, path); // Never replace a competing owner's provenance.
        }
        finally { if (File.Exists(temporary)) File.Delete(temporary); }
    }

    internal static void RequireConnection(string directory, IQuickerRpcService rpc, string? actionId = null) =>
        QuickerRpcClient.RequireBinding(rpc, Read(directory, actionId).HostBinding);

    internal static Document? Find(string? actionId, string? explicitDirectory, string? workspaceRoot = null, bool required = false)
    {
        var root = Path.GetFullPath(string.IsNullOrWhiteSpace(workspaceRoot) ? Directory.GetCurrentDirectory() : workspaceRoot);
        if (!string.IsNullOrWhiteSpace(explicitDirectory))
        {
            var dir = Path.GetFullPath(explicitDirectory, root);
            RequireSafePath(dir);
            if (required || (Directory.Exists(dir) && Directory.EnumerateFileSystemEntries(dir).Any())) return Read(dir, actionId);
            return null;
        }
        var actions = Path.Combine(root, ".quicker", "actions");
        RequireSafePath(actions);
        var matches = new List<string>();
        if (Directory.Exists(actions)) foreach (var dir in Directory.EnumerateDirectories(actions))
        {
            RequireSafePath(dir);
            var matchesId = string.Equals(Path.GetFileName(dir), actionId, StringComparison.OrdinalIgnoreCase);
            foreach (var leaf in new[] { RelativePath, "info.json" })
            {
                var path = Path.Combine(dir, leaf.Replace('/', Path.DirectorySeparatorChar));
                RequireSafePath(path);
                if (!File.Exists(path)) continue;
                if (new FileInfo(path).Length > 128000) throw Failure("HOST_HANDSHAKE_INVALID", "Project identity metadata is too large.");
                using var json = JsonDocument.Parse(File.ReadAllText(path));
                foreach (var key in new[] { "actionId", "id", "Id", "ID" })
                    if (json.RootElement.TryGetProperty(key, out var id) && id.ValueKind == JsonValueKind.String
                        && string.Equals(id.GetString(), actionId, StringComparison.OrdinalIgnoreCase)) matchesId = true;
            }
            if (matchesId) matches.Add(dir);
        }
        if (matches.Count > 1) throw Failure("PROJECT_SELECTION_REQUIRED", "Multiple disk projects identify this action.");
        if (matches.Count == 1) return Read(matches[0], actionId);
        if (required) throw Failure(QuickerRpcBindingErrors.Required, "No bound disk project exists for this action.");
        return null;
    }

    internal static void RequireExplicitSelection(Document record)
    {
        var selected = Environment.GetEnvironmentVariable("QKRPC_HOST_SESSION")?.Trim();
        var raw = Environment.GetEnvironmentVariable("QKRPC_HOST_BINDING");
        var configured = string.IsNullOrWhiteSpace(raw) ? null : JsonSerializer.Deserialize<QuickerRpcHostBinding>(raw, Json);
        if (!string.IsNullOrWhiteSpace(raw) && configured is null)
            throw Failure(QuickerRpcBindingErrors.InvalidHandshake, "QKRPC_HOST_BINDING is invalid.");
        if ((!string.IsNullOrEmpty(selected) && selected != record.HostBinding.HostSessionId)
            || (configured is not null && !configured.SameDestination(record.HostBinding)))
            throw Failure(QuickerRpcBindingErrors.Mismatch, "The explicit host selection differs from the disk project.");
    }

    private sealed class Counter { public int Value; }
    private static void RequireDirectoryActionId(string directory, string actionId)
    {
        if (!Guid.TryParse(actionId, out var expected)) throw Failure(QuickerRpcBindingErrors.InvalidHandshake, "Project action id must be a GUID.");
        if (Guid.TryParse(Path.GetFileName(Path.TrimEndingDirectorySeparator(Path.GetFullPath(directory))), out var name) && name != expected)
            throw Failure(QuickerRpcBindingErrors.Mismatch, "The GUID project directory identifies another action.");
    }
    private static void InspectTree(string directory, string leasePath, Counter count)
    {
        foreach (var path in Directory.EnumerateFileSystemEntries(directory))
        {
            if (string.Equals(path, leasePath, OperatingSystem.IsWindows() ? StringComparison.OrdinalIgnoreCase : StringComparison.Ordinal)) continue;
            if (++count.Value > 10000) throw Failure("PROJECT_TOO_LARGE", "Project metadata inspection exceeded its limit.");
            RequireSafePath(path);
            if (Directory.Exists(path)) InspectTree(path, leasePath, count);
        }
    }

    internal static void RequireSafePath(string path)
    {
        var absolute = Path.GetFullPath(path);
        if (absolute[Path.GetPathRoot(absolute)!.Length..].Contains(':')) throw Failure("UNSAFE_PROJECT_PATH", "Alternate data streams are not allowed.");
        var files = new List<string>();
        for (var current = absolute; !string.IsNullOrEmpty(current); current = Path.GetDirectoryName(current))
        {
            if (!Path.Exists(current)) continue;
            var attributes = File.GetAttributes(current);
            const FileAttributes forbidden = FileAttributes.ReparsePoint | FileAttributes.Offline | (FileAttributes)0x40000 | (FileAttributes)0x400000;
            if ((attributes & forbidden) != 0) throw Failure("UNSAFE_PROJECT_PATH", "Project paths cannot use links or cloud placeholders.");
            if ((attributes & FileAttributes.Directory) == 0) files.Add(current);
        }
        foreach (var file in files)
            if (LinkCount(file) != 1) throw Failure("UNSAFE_PROJECT_PATH", "Project files must have a single hard link.");
    }

    private static uint LinkCount(string path)
    {
        if (OperatingSystem.IsWindows())
        {
            using var file = File.OpenHandle(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete);
            if (!GetFileInformationByHandle(file, out var info)) throw new IOException("Cannot inspect project file links.");
            return info.NumberOfLinks;
        }
        if (OperatingSystem.IsLinux() && Statx(-100, path, 0x100, 4, out var stat) == 0) return stat.LinkCount;
        throw new IOException("Cannot verify project file links on this platform.");
    }

    [StructLayout(LayoutKind.Sequential)] private struct FileInformation
    {
        public uint Attributes; public System.Runtime.InteropServices.ComTypes.FILETIME Creation, Access, Write;
        public uint Volume, SizeHigh, SizeLow, NumberOfLinks, IndexHigh, IndexLow;
    }
    [StructLayout(LayoutKind.Explicit, Size = 256)] private struct StatxInfo { [FieldOffset(16)] public uint LinkCount; }
    [DllImport("kernel32.dll", SetLastError = true)] [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool GetFileInformationByHandle(SafeFileHandle file, out FileInformation info);
    [DllImport("libc", EntryPoint = "statx", SetLastError = true)] private static extern int Statx(int fd, string path, int flags, uint mask, out StatxInfo info);
    private static QuickerRpcClientException Failure(string code, string message) => new(code, message);
}
