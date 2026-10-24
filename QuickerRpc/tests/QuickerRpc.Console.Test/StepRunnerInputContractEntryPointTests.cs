using System.Text.Json;
using CommandLine;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using QuickerRpc.Console.Mcp;
using QuickerRpc.Console.Serve;
using QuickerRpc.Contracts.Rpc;
using QuickerRpc.Testing;
using QuickerRpc.Transport;

namespace QuickerRpc.Console.Test;

[TestClass]
public sealed class StepRunnerInputContractEntryPointTests
{
    private static JsonElement Args(object value) => JsonSerializer.SerializeToElement(value);
    private static JsonElement Data(ServeInvokeResponse response) => JsonSerializer.SerializeToElement(response.Data, QkrpcJson.CliOutput);

    [TestMethod]
    public void Cli_value_options_keep_native_literals_that_look_like_switches()
    {
        using var parser = new Parser(settings => settings.HelpWriter = null);
        foreach (var value in new[] { "", "--json", "--native-option", "--control-field=x", " A " })
        {
            StepRunnerOptions? options = null;
            string? errors = null;
            parser.ParseArguments<StepRunnerOptions, GuideOptions>(new[] { "step-runner", "input-contract", "--key=sys:fixture", "--control-field-json", JsonSerializer.Serialize(value) })
                .WithParsed<StepRunnerOptions>(parsed => options = parsed).WithNotParsed(failures => errors = string.Join(",", failures.Select(error => error.Tag)));
            Assert.IsNotNull(options, $"Literal {JsonSerializer.Serialize(value)} failed: {errors}");
            Assert.AreEqual("input-contract", options.Command);
            Assert.AreEqual("sys:fixture", options.Key);
            Assert.AreEqual(value, StepRunnerInputContractCli.CreateRequest(options).ControlFieldValue);
        }
        foreach (var invalid in new[] { "null", "true", "{}", "unquoted" })
            Assert.ThrowsException<ArgumentException>(() => StepRunnerInputContractCli.CreateRequest(new StepRunnerOptions { Key = "sys:fixture", ControlFieldJson = invalid }));
        Assert.ThrowsException<ArgumentException>(() => StepRunnerInputContractCli.CreateRequest(new StepRunnerOptions { Key = "sys:fixture", ControlField = "A", ControlFieldJson = "\"B\"" }));
        Assert.IsNull(StepRunnerInputContractCli.CreateRequest(new StepRunnerOptions { Key = "sys:fixture" }).ControlFieldValue);
    }

    [TestMethod]
    public async Task Bound_input_contract_preserves_native_zero_false_null_and_explicit_empty_control()
    {
        await using var host = new FakeBindingHost();
        host.Info.Capabilities[QuickerRpcHostCapabilityNames.StepRunnerInputContractRead] = true;
        await using var pool = new QkrpcRpcSessionPool(2, false);
        var result = await ServeInvokeDispatcher.InvokeAsync(pool, "step-runner.input-contract",
            Args(new { key = "sys:fixture", controlField = "" }), 2, default, host.Binding);
        Assert.IsTrue(result.Ok, result.Message);
        var contract = Data(result).GetProperty("payload").GetProperty("contract");
        var input = contract.GetProperty("inputs")[0];
        Assert.AreEqual(0, input.GetProperty("varType").GetInt32());
        Assert.AreEqual(0, input.GetProperty("variableMode").GetInt32());
        Assert.IsFalse(input.GetProperty("allowInput").GetBoolean());
        Assert.IsFalse(input.GetProperty("isControlField").GetBoolean());
        Assert.AreEqual(JsonValueKind.Null, input.GetProperty("blockedReason").ValueKind);
        Assert.AreEqual("", contract.GetProperty("appliedControlFieldValue").GetString());
        Assert.AreEqual("", host.LastInputContractRequest!.ControlFieldValue);
        Assert.AreEqual(1, host.InputContractReads);
        Assert.AreEqual(0, host.CatalogReads);
        Assert.AreEqual(0, host.Writes);
        Assert.AreEqual(host.SessionId, result.HostBinding!.HostSessionId);

        var compact = QkrpcMcpResponseCompact.Compact(QkrpcMcpJson.FormatServeResponse(result));
        using var json = JsonDocument.Parse(compact);
        var mcpInput = json.RootElement.GetProperty("contract").GetProperty("inputs")[0];
        Assert.IsFalse(mcpInput.GetProperty("allowInput").GetBoolean());
        Assert.AreEqual(0, mcpInput.GetProperty("variableMode").GetInt32());
        Assert.AreEqual(JsonValueKind.Null, mcpInput.GetProperty("blockedReason").ValueKind);
    }

    [TestMethod]
    public async Task Missing_capability_is_rejected_even_after_a_session_was_cached_by_a_legacy_read()
    {
        await using var host = new FakeBindingHost();
        await using var pool = new QkrpcRpcSessionPool(2, false);
        Assert.IsTrue((await ServeInvokeDispatcher.InvokeAsync(pool, "step-runner.list", Args(new { limit = 1 }), 2, default, host.Binding)).Ok);
        var result = await ServeInvokeDispatcher.InvokeAsync(pool, "step-runner.input-contract", Args(new { key = "sys:fixture" }), 2, default, host.Binding);
        Assert.IsFalse(result.Ok);
        Assert.AreEqual("INPUT_CONTRACT_UNSUPPORTED", result.Error);
        Assert.AreEqual(0, host.InputContractReads);
        Assert.AreEqual(1, host.CatalogReads);
        Assert.AreEqual(0, host.Writes);
    }

    [TestMethod]
    public async Task Native_refusal_and_missing_contract_keep_their_failure_without_UI_or_other_host_fallback()
    {
        await using var host = new FakeBindingHost();
        host.Info.Capabilities[QuickerRpcHostCapabilityNames.StepRunnerInputContractRead] = true;
        await using var pool = new QkrpcRpcSessionPool(2, false);
        host.InputContract = _ => new() { ErrorCode = "NATIVE_POLICY_UNKNOWN", ErrorMessage = "fixture native refusal" };
        var refused = await ServeInvokeDispatcher.InvokeAsync(pool, "step-runner.input-contract", Args(new { key = "sys:fixture" }), 2, default, host.Binding);
        Assert.AreEqual("NATIVE_POLICY_UNKNOWN", refused.Error);
        host.InputContract = _ => new() { Success = true };
        var invalid = await ServeInvokeDispatcher.InvokeAsync(pool, "step-runner.input-contract", Args(new { key = "sys:fixture" }), 2, default, host.Binding);
        Assert.AreEqual("INVALID_INPUT_CONTRACT", invalid.Error);
        Assert.AreEqual(2, host.InputContractReads);
        Assert.AreEqual(0, host.CatalogReads);
        Assert.AreEqual(0, host.Writes);
    }

    [TestMethod]
    public async Task A_first_validation_read_preserves_candidate_selection_and_uses_a_nonbootstrap_connection_owner()
    {
        await using var host = new FakeBindingHost();
        host.Info.Capabilities[QuickerRpcHostCapabilityNames.StepRunnerInputContractRead] = true;
        await using var pool = new QkrpcRpcSessionPool(2, true,
            new QuickerRpcHostSelection { CandidateEndpoints = new[] { host.Endpoint } });
        Assert.IsTrue(pool.MayBootstrapOnConnect);
        await using (var connectedOnly = pool.CreateConnectedReadPool()) Assert.IsFalse(connectedOnly.MayBootstrapOnConnect);
        var result = await ServeInvokeDispatcher.InvokeAsync(pool, "step-runner.input-contract", Args(new { key = "sys:fixture" }), 2, default);
        Assert.IsTrue(result.Ok, result.Message);
        Assert.AreEqual(host.SessionId, result.HostBinding!.HostSessionId);
        Assert.IsNull(pool.Binding, "An isolated validation read does not silently replace the caller's connection owner.");
        Assert.AreEqual(1, host.InputContractReads);
        Assert.AreEqual(0, host.Writes);
    }

    [TestMethod]
    public async Task A_first_validation_read_keeps_its_selected_binding_on_native_exceptions_and_timeouts()
    {
        await using var host = new FakeBindingHost();
        host.Info.Capabilities[QuickerRpcHostCapabilityNames.StepRunnerInputContractRead] = true;
        await using var pool = new QkrpcRpcSessionPool(2, true,
            new QuickerRpcHostSelection { CandidateEndpoints = new[] { host.Endpoint } });
        host.InputContract = _ => throw new InvalidOperationException("fixture native failure after binding");
        var failed = await ServeInvokeDispatcher.InvokeAsync(pool, "step-runner.input-contract", Args(new { key = "sys:fixture" }), 2, default);
        Assert.IsFalse(failed.Ok);
        Assert.AreEqual("INVOKE_FAILED", failed.Error);
        Assert.AreEqual(host.SessionId, failed.HostBinding?.HostSessionId, "An exception must not erase the actual selected owner.");
        host.AsyncInputContract = async (_, token) => { await Task.Delay(10_000, token); return new(); };
        var timeout = await ServeInvokeDispatcher.InvokeAsync(pool, "step-runner.input-contract", Args(new { key = "sys:fixture" }), 1, default);
        Assert.IsFalse(timeout.Ok);
        Assert.AreEqual("RPC_TIMEOUT", timeout.Error);
        Assert.AreEqual(host.SessionId, timeout.HostBinding?.HostSessionId, "A deadline after binding still identifies that owner.");
        Assert.AreEqual(0, host.Writes);
    }

    [TestMethod]
    public async Task A_precancelled_input_contract_makes_no_handshake_or_native_read()
    {
        await using var host = new FakeBindingHost();
        await using var pool = new QkrpcRpcSessionPool(2, false);
        using var stop = new CancellationTokenSource(); stop.Cancel();
        await Assert.ThrowsExceptionAsync<OperationCanceledException>(() => ServeInvokeDispatcher.InvokeAsync(pool,
            "step-runner.input-contract", Args(new { key = "sys:fixture" }), 2, stop.Token, host.Binding));
        Assert.AreEqual(0, host.Handshakes);
        Assert.AreEqual(0, host.InputContractReads);
        Assert.AreEqual(0, host.Writes);
    }
}
