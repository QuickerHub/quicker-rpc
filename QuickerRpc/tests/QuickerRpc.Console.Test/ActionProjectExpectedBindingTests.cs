using System.Diagnostics;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using QuickerRpc.Console.Mcp;
using QuickerRpc.Console.Serve;
using QuickerRpc.Contracts.Rpc;
using QuickerRpc.Testing;
using QuickerRpc.Transport;

namespace QuickerRpc.Console.Test;

[TestClass]
public sealed class ActionProjectExpectedBindingTests
{
    private const string Id = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    private readonly string root = Path.Combine(Directory.GetCurrentDirectory(), ".tmp", "project-binding-cas", Guid.NewGuid().ToString("N"));
    private string Project => Path.Combine(root, ".quicker", "actions", Id);
    private string Sidecar => Path.Combine(Project, ActionProjectHostBinding.RelativePath);
    private const string Body = "{\"steps\":[],\"variables\":[],\"opaque\":\"original\"}";
    private static readonly JsonSerializerOptions Json = new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };
    [TestCleanup] public void Cleanup() { if (Directory.Exists(root)) Directory.Delete(root, true); }

    private string Seed(QuickerRpcHostBinding binding)
    {
        using var lease = ActionProjectHostBinding.ClaimExport(Project, Id, binding);
        File.WriteAllText(Path.Combine(Project, "info.json"), JsonSerializer.Serialize(new { id = Id, title = "Fixture", editVersion = 7 }));
        File.WriteAllText(Path.Combine(Project, "data.json"), Body);
        ActionProjectHostBinding.WriteAfterExport(Project, Id, binding);
        var record = JsonNode.Parse(File.ReadAllText(Sidecar))!.AsObject();
        record["hostBinding"]!["future"] = new JsonObject { ["label"] = "original", ["ordered"] = new JsonArray(1, 2) };
        var raw = record.ToJsonString(); File.WriteAllText(Sidecar, raw); return raw;
    }

    private static ActionProjectExpectedBinding Expected(string json) => ActionProjectExpectedBinding.FromArgs(
        JsonSerializer.SerializeToElement(new { expectedProjectBinding = JsonDocument.Parse(json).RootElement }))!;

    private JsonElement Args(string? expected, bool specified = true)
    {
        var args = new JsonObject { ["id"] = Id, ["dir"] = Project, ["workspaceRoot"] = root };
        if (specified) args["expectedProjectBinding"] = expected is null ? null : JsonNode.Parse(expected);
        return JsonSerializer.SerializeToElement(args);
    }

    [TestMethod]
    public async Task Full_record_CAS_preserves_host_extensions_types_and_exact_numbers_under_the_lease()
    {
        await using var host = new FakeBindingHost();
        var raw = Seed(host.Binding);
        var reordered = JsonNode.Parse(raw)!.AsObject();
        reordered["actionId"] = Id.ToUpperInvariant();
        var future = reordered["hostBinding"]!["future"]!.AsObject();
        future.Remove("label"); future["label"] = "original";
        using (ActionProjectHostBinding.ClaimValidation(Project, Expected(reordered.ToJsonString()))) { }
        foreach (var mutation in new Action<JsonObject>[] {
            value => value["hostBinding"]!["capabilities"]!["action.source.read"] = false,
            value => value["hostBinding"]!["quickerVersion"] = "changed",
            value => value["hostBinding"]!["future"]!["label"] = "changed",
            value => value["hostBinding"]!["future"]!["ordered"] = new JsonArray(2, 1),
        })
        {
            var changed = JsonNode.Parse(raw)!.AsObject(); mutation(changed); File.WriteAllText(Sidecar, changed.ToJsonString());
            Assert.AreEqual(ActionProjectExpectedBinding.Conflict, Assert.ThrowsException<QuickerRpcClientException>(
                () => ActionProjectHostBinding.ClaimValidation(Project, Expected(raw))).ErrorCode);
        }
        var withNumber = raw.Replace("\"original\"", "9007199254740992", StringComparison.Ordinal);
        File.WriteAllText(Sidecar, withNumber.Replace("9007199254740992", "9007199254740993", StringComparison.Ordinal));
        Assert.AreEqual(ActionProjectExpectedBinding.Conflict, Assert.ThrowsException<QuickerRpcClientException>(
            () => ActionProjectHostBinding.ClaimValidation(Project, Expected(withNumber))).ErrorCode);
        File.WriteAllText(Sidecar, raw.Replace("\"original\"", "1", StringComparison.Ordinal));
        using (ActionProjectHostBinding.ClaimValidation(Project, Expected(raw.Replace("\"original\"", "1.0", StringComparison.Ordinal)))) { }
        Assert.AreEqual(ActionProjectExpectedBinding.Conflict, Assert.ThrowsException<QuickerRpcClientException>(
            () => ActionProjectHostBinding.ClaimValidation(Project, Expected(raw.Replace("\"original\"", "\"1e0\"", StringComparison.Ordinal)))).ErrorCode);
        Assert.AreEqual(Body, File.ReadAllText(Path.Combine(Project, "data.json")));
    }

    [TestMethod]
    public async Task Omitted_null_and_record_are_distinct_and_persistent_serve_does_not_inherit_child_environment()
    {
        await using var host = new FakeBindingHost();
        var raw = Seed(host.Binding);
        Assert.IsNull(ActionProjectExpectedBinding.FromArgs(Args(null, specified: false)));
        Assert.AreEqual(ActionProjectExpectedBinding.Conflict, Assert.ThrowsException<QuickerRpcClientException>(
            () => ActionProjectHostBinding.ClaimValidation(Project, Expected("null"))).ErrorCode);
        File.Delete(Sidecar);
        using (ActionProjectHostBinding.ClaimValidation(Project, Expected("null"))) { }
        Assert.AreEqual(ActionProjectExpectedBinding.Conflict, Assert.ThrowsException<QuickerRpcClientException>(
            () => ActionProjectHostBinding.ClaimValidation(Project, Expected(raw))).ErrorCode);
        File.WriteAllText(Sidecar, raw);
        var old = Environment.GetEnvironmentVariable(ActionProjectExpectedBinding.EnvironmentKey);
        Environment.SetEnvironmentVariable(ActionProjectExpectedBinding.EnvironmentKey, "invalid child-only JSON");
        try
        {
            await using var pool = new QkrpcRpcSessionPool(1, false);
            var valid = await ServeInvokeDispatcher.InvokeAsync(pool, "action.validate", Args(null, specified: false), 1, default, host.Binding);
            Assert.IsTrue(valid.Ok, valid.Error + ": " + valid.Message);
            Assert.ThrowsException<QuickerRpcClientException>(() => ActionProjectExpectedBinding.FromEnvironment());
        }
        finally { Environment.SetEnvironmentVariable(ActionProjectExpectedBinding.EnvironmentKey, old); }
    }

    [TestMethod]
    public async Task Serve_apply_validate_and_extract_compare_after_dispatch_without_any_persistence_on_conflict()
    {
        await using var host = new FakeBindingHost();
        var original = Seed(host.Binding);
        var changed = JsonNode.Parse(original)!;
        changed["hostBinding"]!["future"]!["label"] = "changed between Node preflight and dispatch";
        File.WriteAllText(Sidecar, changed.ToJsonString());
        await using var pool = new QkrpcRpcSessionPool(1, false);
        foreach (var op in new[] { "action.apply", "action.validate", "action.extract" })
        {
            var result = await ServeInvokeDispatcher.InvokeAsync(pool, op, Args(original), 1, default, host.Binding);
            Assert.AreEqual(ActionProjectExpectedBinding.Conflict, result.Error, op + ": " + result.Message);
            Assert.AreEqual(Body, File.ReadAllText(Path.Combine(Project, "data.json")), op);
            Assert.IsFalse(File.Exists(Path.Combine(Project, ActionProjectHostBinding.LeaseFile)), op);
        }
        Assert.AreEqual(0, host.Writes + host.StorageWrites);
        // A caller with the new full record can make a subsequent successful write; no lease leaked.
        var applied = await ServeInvokeDispatcher.InvokeAsync(pool, "action.apply", Args(changed.ToJsonString()), 1, default, host.Binding);
        Assert.IsTrue(applied.Ok, applied.Error + ": " + applied.Message);
        Assert.AreEqual(1, host.Writes);
    }

    [TestMethod]
    public async Task Real_CLI_child_environment_drives_the_same_apply_validate_extract_CAS()
    {
        await using var host = new FakeBindingHost();
        var original = Seed(host.Binding);
        var changed = JsonNode.Parse(original)!;
        changed["hostBinding"]!["capabilities"]!["action.source.read"] = false;
        File.WriteAllText(Sidecar, changed.ToJsonString());
        foreach (var verb in new[] { "apply", "validate", "extract" })
        {
            var result = await Cli(original, "action", verb, "--dir", Project, "--id", Id, "--no-bootstrap", "--json");
            Assert.AreEqual(1, result.Code, result.Output);
            StringAssert.Contains(result.Output, ActionProjectExpectedBinding.Conflict);
            Assert.AreEqual(Body, File.ReadAllText(Path.Combine(Project, "data.json")));
        }
        var nullResult = await Cli("null", "action", "apply", "--dir", Project, "--no-bootstrap", "--json");
        StringAssert.Contains(nullResult.Output, ActionProjectExpectedBinding.Conflict);
        Assert.AreEqual(0, host.Writes);
        var valid = await Cli(changed.ToJsonString(), "action", "apply", "--dir", Project, "--no-bootstrap", "--json");
        Assert.AreEqual(0, valid.Code, valid.Output);
        Assert.AreEqual(1, host.Writes);
    }

    [TestMethod]
    public async Task Metadata_uses_its_exact_directory_and_full_CAS_after_body_persistence_without_retargeting()
    {
        await using var host = new FakeBindingHost();
        await using var other = new FakeBindingHost("v2");
        var original = Seed(host.Binding);
        await using var pool = new QkrpcRpcSessionPool(1, false);
        var body = await ServeInvokeDispatcher.InvokeAsync(pool, "action.apply", Args(original), 1, default, host.Binding);
        Assert.IsTrue(body.Ok, body.Message);
        Assert.AreEqual(1, host.Writes);
        var changed = JsonNode.Parse(original)!;
        changed["hostBinding"]!["future"]!["label"] = "changed after body";
        File.WriteAllText(Sidecar, changed.ToJsonString());
        var args = JsonNode.Parse(Args(original).GetRawText())!.AsObject(); args["title"] = "Changed title"; args["expectedEditVersion"] = 8;
        var conflict = await ServeInvokeDispatcher.InvokeAsync(pool, "action.set-metadata", JsonSerializer.SerializeToElement(args), 1, default, host.Binding);
        Assert.AreEqual(ActionProjectExpectedBinding.Conflict, conflict.Error);
        Assert.AreEqual(0, host.MetadataWrites + other.MetadataWrites);
        args["expectedProjectBinding"] = changed.DeepClone();
        args.Remove("dir");
        var missingDir = await ServeInvokeDispatcher.InvokeAsync(pool, "action.set-metadata", JsonSerializer.SerializeToElement(args), 1, default, host.Binding);
        Assert.AreEqual(ActionProjectExpectedBinding.Conflict, missingDir.Error);
        Assert.AreEqual(0, host.MetadataWrites);
        args["dir"] = Project;
        args["id"] = "bbbbbbbb-cccc-dddd-eeee-ffffffffffff";
        var wrongId = await ServeInvokeDispatcher.InvokeAsync(pool, "action.set-metadata", JsonSerializer.SerializeToElement(args), 1, default, host.Binding);
        Assert.AreEqual(QuickerRpcBindingErrors.Mismatch, wrongId.Error);
        Assert.AreEqual(0, host.MetadataWrites);
        args["id"] = Id;
        args["expectedProjectBinding"] = null;
        var unbound = await ServeInvokeDispatcher.InvokeAsync(pool, "action.set-metadata", JsonSerializer.SerializeToElement(args), 1, default, host.Binding);
        Assert.AreEqual(ActionProjectExpectedBinding.Conflict, unbound.Error);
        args["expectedProjectBinding"] = changed.DeepClone();
        var successful = await ServeInvokeDispatcher.InvokeAsync(pool, "action.set-metadata", JsonSerializer.SerializeToElement(args), 1, default, host.Binding);
        Assert.IsTrue(successful.Ok, successful.Error + ": " + successful.Message);
        Assert.AreEqual(1, host.Writes); Assert.AreEqual(1, host.MetadataWrites);
        Assert.AreEqual(0, other.Writes + other.MetadataWrites + other.Handshakes);
    }

    [TestMethod]
    public async Task CLI_metadata_reads_child_exact_directory_and_omitted_expected_keeps_legacy_host_only_behavior()
    {
        await using var host = new FakeBindingHost();
        var original = Seed(host.Binding);
        var changed = JsonNode.Parse(original)!; changed["hostBinding"]!["future"]!["label"] = "changed";
        File.WriteAllText(Sidecar, changed.ToJsonString());
        var failed = await Cli(original, "action", "set-metadata", "--id", Id, "--title", "Changed", "--json", "--no-bootstrap");
        Assert.AreEqual(1, failed.Code); StringAssert.Contains(failed.Output, ActionProjectExpectedBinding.Conflict);
        Assert.AreEqual(0, host.MetadataWrites);
        var successful = await Cli(changed.ToJsonString(), "action", "set-metadata", "--id", Id, "--title", "Changed", "--json", "--no-bootstrap");
        Assert.AreEqual(0, successful.Code, successful.Output);
        Assert.AreEqual(1, host.MetadataWrites);
        var legacy = await Cli(null, "action", "set-metadata", "--id", Id, "--title", "Independent", "--json", "--no-bootstrap",
            "--host-binding", JsonSerializer.Serialize(host.Binding, Json));
        Assert.AreEqual(0, legacy.Code, legacy.Output);
        Assert.AreEqual(2, host.MetadataWrites);
    }

    [TestMethod]
    public async Task Metadata_response_lost_is_not_replayed_and_releases_its_project_lease()
    {
        await using var host = new FakeBindingHost();
        await using var other = new FakeBindingHost("v2");
        var expected = Seed(host.Binding);
        host.DropAfterWrite = true;
        var result = await Cli(expected, "action", "set-metadata", "--id", Id, "--title", "Changed", "--json", "--no-bootstrap");
        Assert.AreEqual(1, result.Code, result.Output);
        StringAssert.Contains(result.Output, QuickerRpcBindingErrors.UnknownWriteResult);
        Assert.AreEqual(1, host.MetadataWrites);
        Assert.AreEqual(0, other.MetadataWrites + other.Handshakes);
        Assert.IsFalse(File.Exists(Path.Combine(Project, ActionProjectHostBinding.LeaseFile)));
    }

    private async Task<(int Code, string Output)> Cli(string? expected, params string[] args)
    {
        var start = new ProcessStartInfo("dotnet") { WorkingDirectory = root, UseShellExecute = false, RedirectStandardOutput = true,
            RedirectStandardError = true, CreateNoWindow = true };
        start.ArgumentList.Add(typeof(QkrpcMcpRuntime).Assembly.Location);
        foreach (var arg in args) start.ArgumentList.Add(arg);
        start.Environment.Remove("QKRPC_HOST_BINDING"); start.Environment.Remove("QKRPC_HOST_SESSION");
        start.Environment["QKRPC_WORKSPACE_ROOT"] = root;
        if (expected is null)
        {
            start.Environment.Remove(ActionProjectExpectedBinding.EnvironmentKey);
            start.Environment.Remove(ActionProjectExpectedBinding.DirectoryEnvironmentKey);
        }
        else
        {
            start.Environment[ActionProjectExpectedBinding.EnvironmentKey] = expected;
            start.Environment[ActionProjectExpectedBinding.DirectoryEnvironmentKey] = Project;
        }
        using var child = Process.Start(start)!;
        var output = child.StandardOutput.ReadToEndAsync(); var error = child.StandardError.ReadToEndAsync();
        try { await child.WaitForExitAsync().WaitAsync(TimeSpan.FromSeconds(10)); }
        finally { if (!child.HasExited) { child.Kill(true); await child.WaitForExitAsync(); } }
        return (child.ExitCode, await output + await error);
    }
}
