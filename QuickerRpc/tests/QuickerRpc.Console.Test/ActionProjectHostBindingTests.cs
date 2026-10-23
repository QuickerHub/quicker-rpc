using System.Runtime.InteropServices;
using System.Diagnostics;
using System.Text.Json;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using QuickerRpc.Console.Mcp;
using QuickerRpc.Console.Serve;
using QuickerRpc.Contracts.Rpc;
using QuickerRpc.Testing;
using QuickerRpc.Transport;

namespace QuickerRpc.Console.Test;

[TestClass]
public sealed class ActionProjectHostBindingTests
{
    private const string ActionId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    private readonly string root = Path.Combine(Directory.GetCurrentDirectory(), ".tmp", "project-binding", Guid.NewGuid().ToString("N"));
    private string Project => Path.Combine(root, ".quicker", "actions", ActionId);
    private static QuickerRpcHostBinding Binding(string instance = "a")
    {
        var session = Guid.NewGuid().ToString("N");
        return new(instance, session, QuickerRpcEndpointNames.ForSession(session), 1, 1, "v1", "fixture", new Dictionary<string, bool>());
    }
    [TestCleanup] public void Cleanup() { if (Directory.Exists(root)) Directory.Delete(root, true); }

    [TestMethod]
    public void Fresh_export_records_provenance_only_after_files_are_written_and_never_changes_the_target()
    {
        var binding = Binding();
        using (ActionProjectHostBinding.ClaimExport(Project, ActionId, binding))
        {
            Assert.IsFalse(File.Exists(Path.Combine(Project, ActionProjectHostBinding.RelativePath)));
            File.WriteAllText(Path.Combine(Project, "info.json"), "{\"id\":\"" + ActionId + "\"}");
            File.WriteAllText(Path.Combine(Project, "data.json"), "{\"steps\":[]}");
            ActionProjectHostBinding.WriteAfterExport(Project, ActionId, binding);
        }
        var actual = ActionProjectHostBinding.Read(Project, ActionId);
        Assert.IsTrue(binding.SameDestination(actual.HostBinding));
        using (ActionProjectHostBinding.ClaimExport(Project, ActionId, binding)) { }
        Assert.AreEqual(QuickerRpcBindingErrors.Mismatch,
            Assert.ThrowsException<QuickerRpcClientException>(() => ActionProjectHostBinding.ClaimExport(Project, ActionId, Binding("b"))).ErrorCode);
        Assert.AreEqual("{\"steps\":[]}", File.ReadAllText(Path.Combine(Project, "data.json")));
    }

    [TestMethod]
    public void Old_unbound_projects_are_not_adopted_and_competing_fresh_exports_cannot_mix_their_files()
    {
        Directory.CreateDirectory(Project);
        File.WriteAllText(Path.Combine(Project, "data.json"), "original");
        Assert.AreEqual(QuickerRpcBindingErrors.Required,
            Assert.ThrowsException<QuickerRpcClientException>(() => ActionProjectHostBinding.ClaimExport(Project, ActionId, Binding())).ErrorCode);
        Assert.AreEqual("original", File.ReadAllText(Path.Combine(Project, "data.json")));
        var fresh = Path.Combine(root, ".quicker", "actions", "fresh");
        var a = Binding();
        using (ActionProjectHostBinding.ClaimExport(fresh, ActionId, a))
        {
            Assert.AreEqual("PROJECT_BUSY", Assert.ThrowsException<QuickerRpcClientException>(() => ActionProjectHostBinding.ClaimExport(fresh, ActionId, Binding("b"))).ErrorCode);
            File.WriteAllText(Path.Combine(fresh, "data.json"), "a");
            ActionProjectHostBinding.WriteAfterExport(fresh, ActionId, a);
        }
        Assert.AreEqual("a", File.ReadAllText(Path.Combine(fresh, "data.json")));
    }

    [TestMethod]
    public void Ambiguous_GUID_and_explicit_foreign_selection_are_rejected_before_connecting()
    {
        var binding = Binding();
        foreach (var dir in new[] { Project, Path.Combine(root, ".quicker", "actions", "second") })
        {
            using var owner = ActionProjectHostBinding.ClaimExport(dir, ActionId, binding);
            ActionProjectHostBinding.WriteAfterExport(dir, ActionId, binding);
        }
        Assert.AreEqual("PROJECT_SELECTION_REQUIRED", Assert.ThrowsException<QuickerRpcClientException>(() => ActionProjectHostBinding.Find(ActionId, null, root)).ErrorCode);
        var previous = Environment.GetEnvironmentVariable("QKRPC_HOST_SESSION");
        try
        {
            Environment.SetEnvironmentVariable("QKRPC_HOST_SESSION", Binding("b").HostSessionId);
            Assert.AreEqual(QuickerRpcBindingErrors.Mismatch, Assert.ThrowsException<QuickerRpcClientException>(() => ActionProjectHostBinding.RequireExplicitSelection(ActionProjectHostBinding.Read(Project))).ErrorCode);
        }
        finally { Environment.SetEnvironmentVariable("QKRPC_HOST_SESSION", previous); }
    }

    [TestMethod]
    public void Binding_commit_failure_is_not_a_successful_export_and_cannot_overwrite_a_foreign_record()
    {
        var binding = Binding();
        using (ActionProjectHostBinding.ClaimExport(Project, ActionId, binding))
        {
            File.WriteAllText(Path.Combine(Project, "data.json"), "saved local data");
            File.WriteAllText(Path.Combine(Project, ".qkrpc"), "blocked sidecar directory");
            Assert.ThrowsException<IOException>(() => ActionProjectHostBinding.WriteAfterExport(Project, ActionId, binding));
        }
        Assert.IsFalse(File.Exists(Path.Combine(Project, ActionProjectHostBinding.RelativePath)));
    }

    [TestMethod]
    public void Metadata_paths_reject_hardlinks_and_alternate_stream_aliases()
    {
        Directory.CreateDirectory(Project);
        var target = Path.Combine(Project, "info.json");
        var alias = Path.Combine(Project, "alias.json");
        File.WriteAllText(target, "fixture");
        var linked = OperatingSystem.IsWindows() ? CreateHardLink(@"\\?\" + alias, @"\\?\" + target, IntPtr.Zero) : Link(target, alias) == 0;
        Assert.IsTrue(linked, "Hard-link fixture creation failed: " + Marshal.GetLastPInvokeError());
        Assert.AreEqual("UNSAFE_PROJECT_PATH", Assert.ThrowsException<QuickerRpcClientException>(() => ActionProjectHostBinding.RequireSafePath(target)).ErrorCode);
        Assert.AreEqual("fixture", File.ReadAllText(target));
        Assert.AreEqual("UNSAFE_PROJECT_PATH", Assert.ThrowsException<QuickerRpcClientException>(() => ActionProjectHostBinding.RequireSafePath(target + ":stream")).ErrorCode);
    }

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool CreateHardLink(string path, string existing, IntPtr attributes);
    [DllImport("libc", EntryPoint = "link", SetLastError = true)] private static extern int Link(string target, string link);

    [TestMethod]
    public async Task Serve_extract_get_and_apply_keep_the_persisted_host_and_directory_across_requests()
    {
        await using var a = new FakeBindingHost();
        await using var b = new FakeBindingHost("v2");
        var named = Path.Combine(root, ".quicker", "actions", "named");
        await using var pool = new QkrpcRpcSessionPool(1, false);
        var extracted = await ServeInvokeDispatcher.InvokeAsync(pool, "action.extract", Args(new { id = ActionId, dir = named, workspaceRoot = root }), 1, default, a.Binding);
        Assert.IsTrue(extracted.Ok, extracted.Error + ": " + extracted.Message);
        Assert.IsTrue(a.Binding.SameDestination(ActionProjectHostBinding.Read(named).HostBinding));
        var before = File.ReadAllText(Path.Combine(named, "data.json"));
        var rejected = await ServeInvokeDispatcher.InvokeAsync(pool, "action.extract", Args(new { id = ActionId, dir = named, workspaceRoot = root }), 1, default, b.Binding);
        Assert.AreEqual(QuickerRpcBindingErrors.Mismatch, rejected.Error);
        Assert.AreEqual(before, File.ReadAllText(Path.Combine(named, "data.json")));
        var refreshed = await ServeInvokeDispatcher.InvokeAsync(pool, "action.extract", Args(new { id = ActionId, workspaceRoot = root }), 1, default);
        Assert.IsTrue(refreshed.Ok, refreshed.Message);
        Assert.AreEqual(1, Directory.GetDirectories(Path.Combine(root, ".quicker", "actions")).Length);
        var applied = await ServeInvokeDispatcher.InvokeAsync(pool, "action.apply", Args(new { id = ActionId, workspaceRoot = root }), 1, default);
        Assert.IsTrue(applied.Ok, applied.Error + ": " + applied.Message);
        Assert.AreEqual(1, a.Writes);
        Assert.AreEqual(0, b.Writes + b.Handshakes + b.LegacyReads);
        var get = await ServeInvokeDispatcher.InvokeAsync(pool, "action.get", Args(new { id = ActionId, workspaceRoot = root }), 1, default, b.Binding);
        Assert.AreEqual(QuickerRpcBindingErrors.Mismatch, get.Error);
        Assert.AreEqual(0, b.Handshakes + b.LegacyReads);
    }

    [TestMethod]
    public async Task Old_unbound_and_ambiguous_projects_reject_serve_before_handshake_or_writes()
    {
        await using var host = new FakeBindingHost();
        await using var pool = new QkrpcRpcSessionPool(1, false);
        Directory.CreateDirectory(Project);
        File.WriteAllText(Path.Combine(Project, "info.json"), "{\"id\":\"" + ActionId + "\"}");
        File.WriteAllText(Path.Combine(Project, "data.json"), "original");
        foreach (var op in new[] { "action.apply", "action.extract", "action.get" })
        {
            var result = await ServeInvokeDispatcher.InvokeAsync(pool, op, Args(new { id = ActionId, workspaceRoot = root }), 1, default, host.Binding);
            Assert.AreEqual(QuickerRpcBindingErrors.Required, result.Error, op + ": " + result.Message);
        }
        Assert.AreEqual("original", File.ReadAllText(Path.Combine(Project, "data.json")));
        Assert.AreEqual(0, host.Handshakes + host.LegacyReads + host.Writes);
    }

    [TestMethod]
    public async Task Node_and_CSharp_create_new_project_leases_exclude_each_other()
    {
        Directory.CreateDirectory(Project);
        var lease = Path.Combine(Project, ActionProjectHostBinding.LeaseFile);
        using (ActionProjectHostBinding.ClaimExport(Project, ActionId, Binding()))
        using (var node = StartNode("const fs=require('node:fs');try{fs.openSync(process.argv[1],'wx');process.exitCode=2}catch(e){if(!['EEXIST','EPERM','EACCES'].includes(e.code))throw e}", lease))
        {
            await node.WaitForExitAsync().WaitAsync(TimeSpan.FromSeconds(5));
            Assert.AreEqual(0, node.ExitCode, await node.StandardError.ReadToEndAsync());
        }
        using var owner = StartNode("const fs=require('node:fs');const fd=fs.openSync(process.argv[1],'wx');process.stdout.write('ready\\n');process.stdin.once('data',()=>{fs.closeSync(fd);fs.unlinkSync(process.argv[1]);process.stdin.destroy()});", lease);
        try
        {
            Assert.AreEqual("ready", await owner.StandardOutput.ReadLineAsync().WaitAsync(TimeSpan.FromSeconds(5)));
            Assert.AreEqual("PROJECT_BUSY", Assert.ThrowsException<QuickerRpcClientException>(() => ActionProjectHostBinding.ClaimExport(Project, ActionId, Binding())).ErrorCode);
            await owner.StandardInput.WriteLineAsync("release");
            await owner.StandardInput.FlushAsync();
            await owner.WaitForExitAsync().WaitAsync(TimeSpan.FromSeconds(5));
            Assert.AreEqual(0, owner.ExitCode, await owner.StandardError.ReadToEndAsync());
        }
        finally { if (!owner.HasExited) { owner.Kill(entireProcessTree: true); await owner.WaitForExitAsync(); } }
        using (ActionProjectHostBinding.ClaimExport(Project, ActionId, Binding())) { }
    }

    [TestMethod]
    public async Task Mcp_create_keeps_actual_receipt_provenance_and_reports_partial_local_failure()
    {
        var old = Environment.GetEnvironmentVariable("QKRPC_WORKSPACE_ROOT");
        Environment.SetEnvironmentVariable("QKRPC_WORKSPACE_ROOT", root);
        try
        {
            var binding = Binding();
            var receipt = QkrpcMcpResponseCompact.Compact(JsonSerializer.Serialize(new { ok = true, hostBinding = binding,
                data = new { action = "create", payload = new { actionId = ActionId, title = "Fixture", editVersion = 7 } } }, new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase }));
            using var parsed = JsonDocument.Parse(receipt);
            Assert.AreEqual(binding.HostSessionId, parsed.RootElement.GetProperty("hostBinding").GetProperty("hostSessionId").GetString());
            await using var runtime = new QkrpcMcpRuntime(1, false, new QkrpcMcpWorkspaceContext());
            // Auxiliary workspace documentation must not undo a committed project receipt.
            Directory.CreateDirectory(Path.Combine(root, ".quicker", "README.md"));
            var created = await QkrpcMcpWorkspaceSync.AugmentActionCreateAsync(runtime, receipt, null, default);
            StringAssert.Contains(created, "\"ok\":true");
            var record = ActionProjectHostBinding.Find(ActionId, null, root, required: true)!;
            Assert.IsTrue(binding.SameDestination(record.HostBinding));
            var before = File.ReadAllText(Path.Combine(record.Directory, "data.json"));
            var again = await QkrpcMcpWorkspaceSync.AugmentActionCreateAsync(runtime, receipt, null, default);
            using var rejected = JsonDocument.Parse(again);
            Assert.IsFalse(rejected.RootElement.GetProperty("ok").GetBoolean());
            Assert.IsTrue(rejected.RootElement.GetProperty("persistedParts").GetProperty("hostAction").GetBoolean());
            Assert.IsFalse(rejected.RootElement.GetProperty("retryable").GetBoolean());
            Assert.AreEqual(before, File.ReadAllText(Path.Combine(record.Directory, "data.json")));
            var partial = QkrpcMcpResponseCompact.Compact("{\"ok\":false,\"error\":\"PROJECT_BINDING_WRITE_FAILED\",\"message\":\"partial\",\"data\":{\"persistedParts\":{\"localProject\":true,\"binding\":false}}}");
            StringAssert.Contains(partial, "\"localProject\":true");
        }
        finally { Environment.SetEnvironmentVariable("QKRPC_WORKSPACE_ROOT", old); }
    }

    private static JsonElement Args(object value) => JsonSerializer.SerializeToElement(value);

    [TestMethod]
    public async Task Guid_directory_without_metadata_id_cannot_redirect_the_sidecar_action()
    {
        var foreign = Path.Combine(root, ".quicker", "actions", "bbbbbbbb-cccc-dddd-eeee-ffffffffffff");
        Assert.AreEqual(QuickerRpcBindingErrors.Mismatch, Assert.ThrowsException<QuickerRpcClientException>(
            () => ActionProjectHostBinding.ClaimExport(foreign, ActionId, Binding())).ErrorCode);
        Assert.IsFalse(Directory.Exists(foreign));
        Directory.CreateDirectory(Path.Combine(foreign, ".qkrpc"));
        File.WriteAllText(Path.Combine(foreign, "info.json"), "{\"title\":\"No id\"}");
        File.WriteAllText(Path.Combine(foreign, ActionProjectHostBinding.RelativePath), JsonSerializer.Serialize(
            new ActionProjectHostBinding.Document(1, "action", ActionId, Binding()), new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase }));
        Assert.AreEqual(QuickerRpcBindingErrors.Mismatch, Assert.ThrowsException<QuickerRpcClientException>(() => ActionProjectHostBinding.Read(foreign)).ErrorCode);
        await using var host = new FakeBindingHost();
        await using var pool = new QkrpcRpcSessionPool(1, false);
        var apply = await ServeInvokeDispatcher.InvokeAsync(pool, "action.apply", Args(new { dir = foreign, workspaceRoot = root }), 1, default, host.Binding);
        Assert.AreEqual(QuickerRpcBindingErrors.Mismatch, apply.Error);
        Assert.AreEqual(0, host.Handshakes + host.LegacyReads + host.Writes);
    }

    [TestMethod]
    public async Task Cli_extract_and_apply_reopen_only_the_bound_host_and_never_fall_back_after_it_exits()
    {
        var a = new FakeBindingHost();
        await using var b = new FakeBindingHost("v2");
        try
        {
            var extract = await Cli("action", "extract", "--id", ActionId, "--dir", Project, "--host-binding",
                JsonSerializer.Serialize(a.Binding, new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase }), "--no-bootstrap", "--json");
            Assert.AreEqual(0, extract.Code, extract.Output);
            Assert.IsTrue(a.Binding.SameDestination(ActionProjectHostBinding.Read(Project).HostBinding));
            var foreign = await Cli("action", "apply", "--dir", Project, "--host-binding",
                JsonSerializer.Serialize(b.Binding, new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase }), "--no-bootstrap", "--json");
            Assert.AreEqual(1, foreign.Code);
            StringAssert.Contains(foreign.Output, QuickerRpcBindingErrors.Mismatch);
            var apply = await Cli("action", "apply", "--dir", Project, "--no-bootstrap", "--json");
            Assert.AreEqual(0, apply.Code, apply.Output);
            Assert.AreEqual(1, a.Writes);
        }
        finally { await a.DisposeAsync(); }
        var unavailable = await Cli("action", "apply", "--dir", Project, "--timeout", "1", "--no-bootstrap", "--json");
        Assert.AreEqual(1, unavailable.Code, unavailable.Output);
        StringAssert.Contains(unavailable.Output, QuickerRpcBindingErrors.Unavailable);
        Assert.AreEqual(0, b.Writes + b.Handshakes + b.LegacyReads);
    }

    private async Task<(int Code, string Output)> Cli(params string[] args)
    {
        Directory.CreateDirectory(root);
        var start = new ProcessStartInfo("dotnet") { WorkingDirectory = root, UseShellExecute = false, RedirectStandardOutput = true,
            RedirectStandardError = true, CreateNoWindow = true };
        start.ArgumentList.Add(typeof(QkrpcMcpRuntime).Assembly.Location);
        foreach (var arg in args) start.ArgumentList.Add(arg);
        start.Environment.Remove("QKRPC_HOST_SESSION"); start.Environment.Remove("QKRPC_HOST_BINDING");
        start.Environment["QKRPC_WORKSPACE_ROOT"] = root;
        using var child = Process.Start(start)!;
        var output = child.StandardOutput.ReadToEndAsync();
        var error = child.StandardError.ReadToEndAsync();
        try { await child.WaitForExitAsync().WaitAsync(TimeSpan.FromSeconds(10)); }
        finally { if (!child.HasExited) { child.Kill(true); await child.WaitForExitAsync(); } }
        return (child.ExitCode, await output + await error);
    }

    private static Process StartNode(string script, string path)
    {
        var start = new ProcessStartInfo("node") { UseShellExecute = false, RedirectStandardInput = true, RedirectStandardOutput = true, RedirectStandardError = true, CreateNoWindow = true };
        start.ArgumentList.Add("-e"); start.ArgumentList.Add(script); start.ArgumentList.Add(path);
        return Process.Start(start)!;
    }
}
