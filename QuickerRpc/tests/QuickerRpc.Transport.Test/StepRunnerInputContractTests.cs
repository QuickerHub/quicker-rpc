using System;
using System.Collections.Generic;
using System.IO.Pipes;
using System.Reflection;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using Newtonsoft.Json.Serialization;
using QuickerRpc.Contracts.Rpc;
using QuickerRpc.Testing;
using StreamJsonRpc;

namespace QuickerRpc.Transport.Test;

[TestClass]
public sealed class StepRunnerInputContractTests
{
    private const string LegacySchema = "{\"stepRunnerKey\":\"sys:fixture\",\"inputs\":[{\"key\":\"text\",\"valueType\":\"Text\"}]}";

    [TestMethod]
    public void Input_contract_is_read_only_and_requires_its_own_capability()
    {
        var method = nameof(IQuickerRpcService.GetStepRunnerInputContractAsync);
        Assert.IsTrue(QuickerRpcMethodPolicy.IsReadOnly(method));
        Assert.AreEqual(QuickerRpcHostCapabilityNames.StepRunnerInputContractRead, QuickerRpcMethodPolicy.Capability(method));
    }

    [TestMethod]
    public async Task Named_pipe_preserves_explicit_raw_native_facts_and_unknowns_without_legacy_detail()
    {
        using var fixture = await Fixture.ConnectAsync(true);
        var client = new QuickerRpcGuardedService(fixture.Proxy);
        client.Bind(QuickerRpcHostDiscovery.Verify(await fixture.Proxy.GetHostSessionAsync(), fixture.Endpoint));
        var request = new QuickerRpcStepRunnerInputContractRequest { StepRunnerKey = "sys:fixture" };
        var result = await client.GetStepRunnerInputContractAsync(request);
        Assert.IsTrue(result.Success);
        Assert.IsNotNull(result.Contract);
        Assert.AreEqual(0, result.Contract.Inputs[0].VarType);
        Assert.AreEqual(0, result.Contract.Inputs[0].VariableMode);
        Assert.AreEqual(false, result.Contract.Inputs[0].AllowInput);
        Assert.IsNull(result.Contract.Inputs[1].VariableMode);

        var raw = await fixture.ClientRpc.InvokeAsync<JObject>(nameof(IQuickerRpcService.GetStepRunnerInputContractAsync), request);
        var contract = raw.GetValue("contract", StringComparison.OrdinalIgnoreCase) as JObject;
        Assert.IsNotNull(contract, "Inspect the RPC result as raw JSON, before DTO defaults can hide missing fields.");
        AssertExplicitContract(contract);
        Assert.AreEqual(2, fixture.Target!.ContractReads);
        Assert.AreEqual(0, fixture.Target.DetailReads, "The input contract must not fall back to the compressed agent schema.");
        Assert.AreEqual("sys:fixture", fixture.Target.LastRequest!.StepRunnerKey);
        Assert.IsNull(fixture.Target.LastRequest.ControlFieldValue);
    }

    [TestMethod]
    public void System_text_json_global_default_omission_cannot_remove_contract_facts()
    {
        var json = System.Text.Json.JsonSerializer.Serialize(CreateContract(), new System.Text.Json.JsonSerializerOptions
        {
            PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase,
            DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingDefault,
        });
        AssertExplicitContract(JObject.Parse(json));
    }

    [TestMethod]
    public void Newtonsoft_global_default_and_null_omission_cannot_remove_contract_facts()
    {
        var json = JsonConvert.SerializeObject(CreateContract(), new JsonSerializerSettings
        {
            DefaultValueHandling = DefaultValueHandling.Ignore,
            NullValueHandling = NullValueHandling.Ignore,
            ContractResolver = new CamelCasePropertyNamesContractResolver(),
        });
        AssertExplicitContract(JObject.Parse(json));
    }

    [DataTestMethod]
    [DataRow("missing")]
    [DataRow("false")]
    public async Task Missing_or_false_capability_blocks_both_guards_before_inner_dispatch(string capability)
    {
        using var fixture = await Fixture.ConnectAsync(capability == "missing" ? null : false);
        var client = new QuickerRpcGuardedService(fixture.Proxy);
        client.Bind(QuickerRpcHostDiscovery.Verify(await fixture.Proxy.GetHostSessionAsync(), fixture.Endpoint));
        var request = new QuickerRpcStepRunnerInputContractRequest { StepRunnerKey = "sys:fixture" };
        var local = await Assert.ThrowsExceptionAsync<QuickerRpcClientException>(() => client.GetStepRunnerInputContractAsync(request));
        Assert.AreEqual(QuickerRpcBindingErrors.Unsupported, local.ErrorCode);
        var remote = await Assert.ThrowsExceptionAsync<RemoteInvocationException>(() => fixture.Proxy.GetStepRunnerInputContractAsync(request));
        StringAssert.Contains(remote.ErrorData!.ToString()!, QuickerRpcBindingErrors.Unsupported);
        Assert.AreEqual(0, fixture.Target!.ContractReads);
        Assert.AreEqual(0, fixture.Target.DetailReads);

        var legacy = await client.GetStepRunnerDetailAsync("sys:fixture");
        Assert.IsTrue(legacy.Success);
        Assert.AreEqual(LegacySchema, legacy.SchemaJson);
        Assert.AreEqual(1, fixture.Target.DetailReads);
        Assert.AreEqual(0, fixture.Target.ContractReads);
    }

    [TestMethod]
    public async Task Read_only_input_contract_still_requires_a_verified_dedicated_binding_before_dispatch()
    {
        using var fixture = await Fixture.ConnectAsync(true);
        var client = new QuickerRpcGuardedService(fixture.Proxy);
        var request = new QuickerRpcStepRunnerInputContractRequest { StepRunnerKey = "sys:fixture" };
        var local = await Assert.ThrowsExceptionAsync<QuickerRpcClientException>(() => client.GetStepRunnerInputContractAsync(request));
        Assert.AreEqual(QuickerRpcBindingErrors.Required, local.ErrorCode);
        var remote = await Assert.ThrowsExceptionAsync<RemoteInvocationException>(() => fixture.Proxy.GetStepRunnerInputContractAsync(request));
        StringAssert.Contains(remote.ErrorData!.ToString()!, QuickerRpcBindingErrors.Required);
        Assert.AreEqual(0, fixture.Target!.ContractReads);
        Assert.AreEqual(0, fixture.Target.DetailReads);

        var legacy = await fixture.Proxy.GetStepRunnerDetailAsync("sys:fixture");
        Assert.AreEqual(LegacySchema, legacy.SchemaJson, "Existing read methods retain their pre-handshake behavior.");
        Assert.AreEqual(1, fixture.Target.DetailReads);
    }

    [TestMethod]
    public async Task Old_plugin_without_new_method_fails_closed_and_keeps_legacy_detail_unchanged()
    {
        using var fixture = await Fixture.ConnectAsync(null, legacy: true);
        var client = new QuickerRpcGuardedService(fixture.Proxy);
        client.Bind(QuickerRpcHostDiscovery.Verify(await fixture.Proxy.GetHostSessionAsync(), fixture.Endpoint));
        var request = new QuickerRpcStepRunnerInputContractRequest { StepRunnerKey = "sys:fixture" };
        var unsupported = await Assert.ThrowsExceptionAsync<QuickerRpcClientException>(() => client.GetStepRunnerInputContractAsync(request));
        Assert.AreEqual(QuickerRpcBindingErrors.Unsupported, unsupported.ErrorCode);
        await Assert.ThrowsExceptionAsync<RemoteMethodNotFoundException>(() => fixture.Proxy.GetStepRunnerInputContractAsync(request));
        Assert.AreEqual(0, fixture.Legacy!.DetailReads, "Neither unsupported capability nor missing RPC method may synthesize a contract from get-detail.");

        var legacy = await client.GetStepRunnerDetailAsync("sys:fixture");
        Assert.IsTrue(legacy.Success);
        Assert.AreEqual(LegacySchema, legacy.SchemaJson);
        Assert.AreEqual(1, fixture.Legacy.DetailReads);
    }

    private static QuickerRpcStepRunnerInputContract CreateContract() => new()
    {
        Version = 1,
        Source = "runtime-definition",
        HostKind = "v1",
        StepRunnerKey = "sys:fixture",
        ControlFieldKey = null,
        AppliedControlFieldValue = null,
        VisibilityResolved = false,
        ReservedBindings = new[] { "file", "varKey", ".file", ".var" },
        Inputs = new List<QuickerRpcStepRunnerInputContractInput>
        {
            new()
            {
                Key = "known-zero",
                PolicyKnown = true,
                VarType = 0,
                VariableMode = 0,
                AllowInput = false,
                IsControlField = false,
                VisibilityResolved = true,
                Visible = true,
                LiteralPolicy = "allowed",
                LiteralValueRestriction = "none",
                BlockedReason = null,
            },
            new() { Key = "unknown", BlockedReason = "native_policy_unavailable" },
        },
    };

    private static void AssertExplicitContract(JObject contract)
    {
        Assert.AreEqual(1, contract.Value<int>("version"));
        Assert.AreEqual("runtime-definition", contract.Value<string>("source"));
        Assert.AreEqual("v1", contract.Value<string>("hostKind"));
        Assert.AreEqual("sys:fixture", contract.Value<string>("stepRunnerKey"));
        AssertToken(contract, "controlFieldKey", JTokenType.Null);
        AssertToken(contract, "appliedControlFieldValue", JTokenType.Null);
        Assert.AreEqual(false, AssertToken(contract, "visibilityResolved", JTokenType.Boolean).Value<bool>());
        CollectionAssert.AreEqual(new[] { "file", "varKey", ".file", ".var" }, contract["reservedBindings"]!.ToObject<string[]>());

        var inputs = contract["inputs"] as JArray;
        Assert.IsNotNull(inputs);
        Assert.AreEqual(2, inputs.Count);
        var known = (JObject)inputs[0]!;
        Assert.AreEqual("known-zero", known.Value<string>("key"));
        Assert.AreEqual(true, AssertToken(known, "policyKnown", JTokenType.Boolean).Value<bool>());
        Assert.AreEqual(0, AssertToken(known, "varType", JTokenType.Integer).Value<int>());
        Assert.AreEqual(0, AssertToken(known, "variableMode", JTokenType.Integer).Value<int>());
        Assert.AreEqual(false, AssertToken(known, "allowInput", JTokenType.Boolean).Value<bool>());
        Assert.AreEqual(false, AssertToken(known, "isControlField", JTokenType.Boolean).Value<bool>());
        AssertToken(known, "blockedReason", JTokenType.Null);
        Assert.AreEqual("allowed", known.Value<string>("literalPolicy"));
        Assert.AreEqual("none", AssertToken(known, "literalValueRestriction", JTokenType.String).Value<string>());
        Assert.AreEqual(0, ((JArray)AssertToken(known, "options", JTokenType.Array)).Count);

        var unknown = (JObject)inputs[1]!;
        Assert.AreEqual("unknown", unknown.Value<string>("key"));
        Assert.AreEqual(false, AssertToken(unknown, "policyKnown", JTokenType.Boolean).Value<bool>());
        foreach (var key in new[] { "varType", "variableMode", "allowInput", "isControlField" }) AssertToken(unknown, key, JTokenType.Null);
        Assert.AreEqual(false, AssertToken(unknown, "visibilityResolved", JTokenType.Boolean).Value<bool>());
        Assert.AreEqual(false, AssertToken(unknown, "visible", JTokenType.Boolean).Value<bool>());
        Assert.AreEqual("unknown", unknown.Value<string>("literalPolicy"));
        Assert.AreEqual("unknown", AssertToken(unknown, "literalValueRestriction", JTokenType.String).Value<string>());
        Assert.AreEqual("native_policy_unavailable", unknown.Value<string>("blockedReason"));
        Assert.AreEqual(0, ((JArray)AssertToken(unknown, "options", JTokenType.Array)).Count);
    }

    private static JToken AssertToken(JObject value, string key, JTokenType type)
    {
        var property = value.Property(key, StringComparison.Ordinal);
        Assert.IsNotNull(property, "Required explicit property is missing: " + key);
        Assert.AreEqual(type, property.Value.Type, "Unexpected JSON token for " + key);
        return property.Value;
    }

    public class InputContractTarget : DispatchProxy
    {
        public QuickerRpcHostSessionInfo Info = new();
        public int ContractReads, DetailReads;
        public QuickerRpcStepRunnerInputContractRequest? LastRequest;

        protected override object? Invoke(MethodInfo? method, object?[]? args)
        {
            if (method!.Name == nameof(IQuickerRpcService.GetHostSessionAsync)) return Task.FromResult(Info);
            if (method.Name == nameof(IQuickerRpcService.GetStepRunnerInputContractAsync))
            {
                Interlocked.Increment(ref ContractReads);
                LastRequest = (QuickerRpcStepRunnerInputContractRequest)args![0]!;
                return Task.FromResult(new QuickerRpcStepRunnerInputContractResult { Success = true, Contract = CreateContract() });
            }
            if (method.Name == nameof(IQuickerRpcService.GetStepRunnerDetailAsync))
            {
                Interlocked.Increment(ref DetailReads);
                return Task.FromResult(new QuickerRpcStepRunnerDetailResult { Success = true, SchemaJson = LegacySchema });
            }
            throw new AssertFailedException("No fallback or unrelated host method is allowed: " + method.Name);
        }
    }

    public sealed class LegacyTarget
    {
        public QuickerRpcHostSessionInfo Info = new();
        public int DetailReads;
        public Task<QuickerRpcHostSessionInfo> GetHostSessionAsync(CancellationToken cancellationToken = default) => Task.FromResult(Info);
        public Task<QuickerRpcStepRunnerDetailResult> GetStepRunnerDetailAsync(string key, string? controlFieldValue = null, CancellationToken cancellationToken = default)
        {
            Interlocked.Increment(ref DetailReads);
            return Task.FromResult(new QuickerRpcStepRunnerDetailResult { Success = true, SchemaJson = LegacySchema });
        }
    }

    private sealed class Fixture : IDisposable
    {
        private readonly NamedPipeServerStream server;
        private readonly NamedPipeClientStream client;
        private readonly JsonRpc serverRpc;
        private bool disposed;
        public string Endpoint { get; }
        public JsonRpc ClientRpc { get; }
        public IQuickerRpcService Proxy { get; }
        public InputContractTarget? Target { get; }
        public LegacyTarget? Legacy { get; }

        private Fixture(string endpoint, NamedPipeServerStream server, NamedPipeClientStream client, QuickerRpcHostSessionInfo info, bool legacy)
        {
            Endpoint = endpoint;
            this.server = server;
            this.client = client;
            if (legacy)
            {
                Legacy = new LegacyTarget { Info = info };
                serverRpc = StreamJsonRpcFactory.StartListeningServer(server, Legacy);
            }
            else
            {
                var inner = DispatchProxy.Create<IQuickerRpcService, InputContractTarget>();
                Target = (InputContractTarget)(object)inner;
                Target.Info = info;
                serverRpc = StreamJsonRpcFactory.StartListeningServer<IQuickerRpcService>(server, new QuickerRpcGuardedService(inner, server: true));
            }
            (ClientRpc, Proxy) = StreamJsonRpcSession.CreateClient<IQuickerRpcService>(client);
        }

        public static async Task<Fixture> ConnectAsync(bool? supported, bool legacy = false)
        {
            var session = Guid.NewGuid().ToString("N");
            var endpoint = QuickerRpcEndpointNames.ForSession(session);
            var server = CurrentUserPipeFixture.Create(endpoint, 1);
            var client = new NamedPipeClientStream(".", endpoint, PipeDirection.InOut, PipeOptions.Asynchronous);
            try
            {
                using var stop = new CancellationTokenSource(TimeSpan.FromSeconds(5));
                var accepting = server.WaitForConnectionAsync(stop.Token);
                await client.ConnectAsync(stop.Token);
                await accepting;
                var info = new QuickerRpcHostSessionInfo
                {
                    HostSessionId = session, HostInstanceId = "fixture-" + session, Endpoint = endpoint, ProtocolVersion = 1,
                    Host = new() { Kind = "v1", QuickerVersion = "fixture" },
                };
                if (supported.HasValue) info.Capabilities[QuickerRpcHostCapabilityNames.StepRunnerInputContractRead] = supported.Value;
                return new Fixture(endpoint, server, client, info, legacy);
            }
            catch { client.Dispose(); server.Dispose(); throw; }
        }

        public void Dispose()
        {
            if (disposed) return;
            disposed = true;
            ClientRpc.Dispose(); serverRpc.Dispose(); client.Dispose(); server.Dispose();
        }
    }
}
