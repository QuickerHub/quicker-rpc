using System.Diagnostics;
using System.Text;
using System.Text.Json;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using Newtonsoft.Json.Linq;
using QuickerRpc.Console.Mcp;
using QuickerRpc.Console.Serve;

namespace QuickerRpc.Console.Test;

[TestClass]
public sealed class SourceDocumentEntryPointTests
{
    private readonly string directory = Path.Combine(Path.GetTempPath(), "qkrpc-source-document-entry-" + Guid.NewGuid().ToString("N"));
    private const string Id = "c48202e2-e309-4723-9d2a-7a83a29b38fb";

    [TestCleanup]
    public void Cleanup() { if (Directory.Exists(directory)) Directory.Delete(directory, true); }

    [TestMethod]
    public async Task Local_document_precedes_binding_and_discovery_and_serializes_as_a_plain_object()
    {
        Open();
        var original = File.ReadAllBytes(Path.Combine(directory, ActionSourceWorkspace.SourceFile));
        await using var pool = new QkrpcRpcSessionPool(1, true);
        var discoveryCalls = 0;
        var result = await ServeInvokeDispatcher.InvokeAsync(pool, "source.document",
            Args(new { dir = directory, mode = "inspect", hostBinding = 42, hostSessionId = "must-not-select" }), 1, default, null,
            _ => { discoveryCalls++; throw new AssertFailedException("Local source document invoked discovery."); });
        Assert.IsTrue(result.Ok, result.Error + ": " + result.Message);
        Assert.IsNull(result.HostBinding);
        Assert.AreEqual(0, discoveryCalls);
        var data = JsonSerializer.SerializeToElement(result.Data);
        Assert.AreEqual(JsonValueKind.Object, data.ValueKind);
        Assert.AreEqual("source-bundle-document", data.GetProperty("kind").GetString());
        Assert.AreEqual(JsonValueKind.String, data.GetProperty("editorJson").ValueKind);
        Assert.AreEqual(JsonValueKind.Object, data.GetProperty("sourceSnapshot").ValueKind);
        CollectionAssert.AreEqual(original, File.ReadAllBytes(Path.Combine(directory, ActionSourceWorkspace.SourceFile)));
    }

    [TestMethod]
    public async Task Preview_and_save_local_use_the_same_stdin_contract_without_host_selection()
    {
        Open();
        var inspected = await Cli(new { dir = directory, mode = "inspect" });
        Assert.AreEqual(0, inspected.Code, inspected.Output);
        using var initial = JsonDocument.Parse(inspected.Output);
        var data = initial.RootElement.GetProperty("data");
        var snapshot = data.GetProperty("sourceSnapshot").GetProperty("revision").GetString();
        var editorJson = data.GetProperty("editorJson").GetString();
        var baseline = File.ReadAllBytes(Path.Combine(directory, ActionSourceWorkspace.BaselineFile));
        var yaml = File.ReadAllBytes(Path.Combine(directory, ActionSourceWorkspace.SourceFile));
        foreach (var mode in new[] { "preview", "save-local" })
        {
            var result = await Cli(new { dir = directory, mode, expectedSnapshot = snapshot, editorJson, baselineEditorJson = editorJson, resources = Array.Empty<object>() });
            Assert.AreEqual(0, result.Code, result.Output);
            using var response = JsonDocument.Parse(result.Output);
            Assert.IsTrue(response.RootElement.GetProperty("ok").GetBoolean());
            Assert.IsFalse(response.RootElement.TryGetProperty("hostBinding", out _));
            Assert.AreEqual("source-bundle-document", response.RootElement.GetProperty("data").GetProperty("kind").GetString());
        }
        CollectionAssert.AreEqual(baseline, File.ReadAllBytes(Path.Combine(directory, ActionSourceWorkspace.BaselineFile)));
        CollectionAssert.AreEqual(yaml, File.ReadAllBytes(Path.Combine(directory, ActionSourceWorkspace.SourceFile)));
    }

    [TestMethod]
    public async Task Structured_document_errors_stay_local_and_cancellation_does_not_read_or_connect()
    {
        Open();
        await using var pool = new QkrpcRpcSessionPool(1, true);
        foreach (var invalid in new object[] {
            new { dir = directory, editorJson = new { steps = Array.Empty<object>() } },
            new { dir = directory, resources = new { path = "files/a.txt" } },
            new { dir = directory, expectedSnapshot = 42 },
            new { dir = directory, baselineEditorJson = new { steps = Array.Empty<object>() } },
        })
        {
            var rejected = await ServeInvokeDispatcher.InvokeAsync(pool, "source.document", Args(invalid), 1, default, null,
                _ => throw new AssertFailedException("Invalid local request invoked discovery."));
            Assert.AreEqual("INVALID_ARGS", rejected.Error);
            Assert.IsNull(rejected.HostBinding);
        }
        var stale = await ServeInvokeDispatcher.InvokeAsync(pool, "source.document",
            Args(new { dir = directory, mode = "preview", expectedSnapshot = "sha256:stale", editorJson = "{}" }), 1, default, null,
            _ => throw new AssertFailedException("Stale local request invoked discovery."));
        Assert.IsFalse(stale.Ok);
        StringAssert.Contains(stale.Error!, "SOURCE_");
        Assert.IsNull(stale.HostBinding);
        using var cancel = new CancellationTokenSource(); cancel.Cancel();
        await Assert.ThrowsExceptionAsync<OperationCanceledException>(() => ServeInvokeDispatcher.InvokeAsync(pool,
            "source.document", Args(new { dir = directory }), 1, cancel.Token, null,
            _ => throw new AssertFailedException("Cancelled local request invoked discovery.")));
    }

    [TestMethod]
    public async Task Expected_source_snapshot_CLI_flag_and_serve_dryrun_reject_stale_bytes_without_a_host()
    {
        Open();
        var prepared = ActionSourceWorkspace.Prepare(directory);
        File.AppendAllText(Path.Combine(directory, ActionSourceWorkspace.SourceFile), "\n# newer local bytes\n");
        await using var pool = new QkrpcRpcSessionPool(1, true);
        var dryRun = await ServeInvokeDispatcher.InvokeAsync(pool, "action.save",
            Args(new { dir = directory, dryRun = true, expectedSnapshot = prepared.SnapshotRevision }), 1, default, null,
            _ => throw new AssertFailedException("Stale dry-run invoked discovery."));
        Assert.IsFalse(dryRun.Ok);
        StringAssert.Contains(dryRun.Error!, "SOURCE_");
        var cli = await Cli(null, "action", "save", "--dir", directory,
            "--expected-source-snapshot", prepared.SnapshotRevision, "--dry-run", "--json");
        Assert.AreEqual(1, cli.Code, cli.Output);
        StringAssert.Contains(cli.Output, dryRun.Error!);
    }

    [TestMethod]
    public async Task Busy_local_owner_returns_the_same_structured_error_from_CLI_without_removing_its_lease()
    {
        Open();
        using (ActionProjectHostBinding.ClaimValidation(directory, null))
        {
            var cli = await Cli(new { dir = directory, mode = "inspect" });
            Assert.AreEqual(1, cli.Code, cli.Output);
            using var response = JsonDocument.Parse(cli.Output);
            Assert.AreEqual("PROJECT_BUSY", response.RootElement.GetProperty("error").GetString());
            Assert.IsTrue(File.Exists(Path.Combine(directory, ActionProjectHostBinding.LeaseFile)));
        }
    }

    [TestMethod]
    public async Task CLI_rejects_inline_document_body_and_invalid_stdin_instead_of_entering_a_host_verb()
    {
        var inline = await Cli(null, "source", "document", "--json", "--editor-json", "{}");
        Assert.AreEqual(1, inline.Code, inline.Output);
        StringAssert.Contains(inline.Output, "SOURCE_DOCUMENT_PARSE_ERROR");
        var invalid = await Cli("not JSON");
        Assert.AreEqual(1, invalid.Code, invalid.Output);
        StringAssert.Contains(invalid.Output, "INVALID_ARGS");
        CollectionAssert.Contains(ServeOpenApiCatalog.InvokeOps, "source.document");
    }

    private void Open()
    {
        ActionSourceWorkspace.Open(directory, Id, 7, "fixture", "catalog", new JObject {
            ["Steps"] = new JArray(), ["Variables"] = new JArray(), ["SubPrograms"] = new JArray() });
        var source = Path.Combine(directory, ActionSourceWorkspace.SourceFile);
        File.WriteAllText(source, "# retained comment\r\n" + File.ReadAllText(source).Replace("\n", "\r\n", StringComparison.Ordinal), new UTF8Encoding(true));
    }
    private static JsonElement Args(object args) => JsonSerializer.SerializeToElement(args);
    private static async Task<(int Code, string Output)> Cli(object? input, params string[] args)
    {
        if (args.Length == 0) args = new[] { "source", "document", "--json" };
        var start = new ProcessStartInfo("dotnet") { UseShellExecute = false, RedirectStandardOutput = true,
            RedirectStandardError = true, RedirectStandardInput = true, CreateNoWindow = true };
        start.ArgumentList.Add(typeof(QkrpcMcpRuntime).Assembly.Location);
        foreach (var arg in args) start.ArgumentList.Add(arg);
        // Deliberately invalid inherited selection proves local routes ignore host environment.
        start.Environment["QKRPC_HOST_BINDING"] = "invalid-host-binding-must-not-be-read";
        start.Environment["QKRPC_HOST_SESSION"] = "invalid-host-session-must-not-be-selected";
        using var child = Process.Start(start)!;
        var stdout = child.StandardOutput.ReadToEndAsync(); var stderr = child.StandardError.ReadToEndAsync();
        using var stop = new CancellationTokenSource(TimeSpan.FromSeconds(15));
        try
        {
            if (input is not null) await child.StandardInput.WriteAsync(input is string text ? text : JsonSerializer.Serialize(input));
            child.StandardInput.Close();
            await child.WaitForExitAsync(stop.Token);
            return (child.ExitCode, await stdout + await stderr);
        }
        finally
        {
            if (!child.HasExited) { child.Kill(entireProcessTree: true); await child.WaitForExitAsync(); }
        }
    }
}
