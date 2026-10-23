using System.Text.Json;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using Formatting = Newtonsoft.Json.Formatting;
using Newtonsoft.Json.Linq;
using QuickerRpc.AgentModel.XAction.Source;
using QuickerRpc.Console.Serve;
using QuickerRpc.Testing;
using QuickerRpc.Transport;

namespace QuickerRpc.Console.Test;

[TestClass]
public sealed class ActionSourceVariableDefaultTests
{
    private const string ActionId = "9b638790-d7b9-4f3d-ae44-e04e36177731";
    private readonly string directory = Path.Combine(Path.GetTempPath(), "qkrpc-source-default-test-" + Guid.NewGuid().ToString("N"));

    [TestCleanup]
    public void Cleanup()
    {
        if (Directory.Exists(directory)) Directory.Delete(directory, recursive: true);
    }

    [TestMethod]
    public async Task V1FlatDefaultFiles_MaterializeRootAndNestedValuesWithoutRpcOrCheckpointChanges()
    {
        await using var host = new FakeBindingHost { BodyJson = Native().ToString(Formatting.None) };
        await using var session = await QuickerRpcClient.ConnectBoundAsync(host.Binding);
        var opened = await ActionSourceServeOps.OpenAsync(session.Rpc,
            JsonSerializer.SerializeToElement(new { id = ActionId, dir = directory, noAutoFiles = true }), default);
        Assert.IsTrue(opened.Ok, opened.Message);
        var caw = ReadSource();
        foreach (var (variable, file) in new[]
        {
            ((JObject)caw["variables"]![0]!, "files/root.txt"),
            ((JObject)caw["subPrograms"]![0]!["variables"]![0]!, "files/child.txt"),
        })
        {
            variable.Remove("default");
            variable["default.file"] = file;
        }
        Directory.CreateDirectory(Path.Combine(directory, "files"));
        File.WriteAllText(Path.Combine(directory, "files/root.txt"), "root\r\n默认值\n");
        File.WriteAllText(Path.Combine(directory, "files/child.txt"), "nested\n默认值\r\n");
        WriteSource(caw);
        var before = BundleTexts();
        var handshakes = host.Handshakes;
        var result = await ActionSourceServeOps.SaveAsync(null, Args(dryRun: true), default);
        Assert.IsTrue(result.Ok, result.Error + ": " + result.Message);
        var prepared = ActionSourceWorkspace.Prepare(directory);
        Assert.AreEqual("root\r\n默认值\n", prepared.Body["Variables"]![0]!.Value<string>("DefaultValue"));
        Assert.AreEqual("nested\n默认值\r\n", prepared.Body["SubPrograms"]![0]!["Variables"]![0]!.Value<string>("DefaultValue"));
        AssertBundleTexts(before);
        Assert.AreEqual(handshakes, host.Handshakes);
        Assert.AreEqual(0, host.Writes);
    }

    [DataTestMethod]
    [DataRow(false, false)]
    [DataRow(false, true)]
    [DataRow(true, false)]
    [DataRow(true, true)]
    public async Task V1NewDefaultContainers_FailOfflineWithExactVariableLocation(bool nested, bool array)
    {
        await using var host = new FakeBindingHost();
        ActionSourceWorkspace.Open(directory, ActionId, 7, "fixture", "catalog", Native(), noAutoFiles: true, hostBinding: host.Binding);
        var caw = ReadSource();
        var variables = nested ? caw["subPrograms"]![0]!["variables"]! : caw["variables"]!;
        variables[0]!["default"] = array ? new JArray("opaque") : new JObject { ["file"] = "files/default.txt" };
        WriteSource(caw);
        var before = BundleTexts();
        var response = await ActionSourceServeOps.SaveAsync(null, Args(dryRun: true), default);
        Assert.IsFalse(response.Ok);
        Assert.AreEqual(ProgramSourceCodes.CawInvalid, response.Error);
        StringAssert.Contains(response.Message, nested ? "SubPrograms[0].Variables[0].DefaultValue" : "Variables[0].DefaultValue");
        StringAssert.Contains(response.Message, nested ? "\"child\"" : "\"root\"");
        StringAssert.Contains(response.Message, "default.file");
        AssertBundleTexts(before);
        Assert.AreEqual(0, host.Handshakes);
        Assert.AreEqual(0, host.Writes);
    }

    [DataTestMethod]
    [DataRow(false)]
    [DataRow(true)]
    public async Task V1UnchangedCamelCaseDefaultContainers_AreStillRejected(bool nested)
    {
        await using var host = new FakeBindingHost();
        var native = Native();
        var program = nested ? (JObject)native["SubPrograms"]![0]! : native;
        program["Variables"]![0]!["DefaultValue"] = new JObject { ["file"] = "files/opaque.txt" };
        CamelCaseVariables(native);
        ActionSourceWorkspace.Open(directory, ActionId, 7, "fixture", "catalog", native, noAutoFiles: true, hostBinding: host.Binding);
        var before = BundleTexts();
        var response = await ActionSourceServeOps.SaveAsync(null, Args(dryRun: true), default);
        Assert.IsFalse(response.Ok);
        Assert.AreEqual(ProgramSourceCodes.CawInvalid, response.Error);
        StringAssert.Contains(response.Message, nested ? "subPrograms[0].variables[0].defaultValue" : "variables[0].defaultValue");
        AssertBundleTexts(before);
    }

    [DataTestMethod]
    [DataRow("text")]
    [DataRow("number")]
    [DataRow("boolean")]
    [DataRow("null")]
    public async Task V1ScalarDefaultsAndOpaqueNativeFields_SurviveAnUnrelatedNoteEdit(string kind)
    {
        await using var host = new FakeBindingHost();
        var native = Native();
        native["Variables"]![0]!["DefaultValue"] = kind switch
        {
            "number" => new JRaw("0.123456789012345678901"),
            "boolean" => new JValue(false),
            "null" => JValue.CreateNull(),
            _ => new JValue("literal file: files/does-not-exist.txt"),
        };
        native["FutureRoot"] = new JObject { ["number"] = new JRaw("9223372036854775807"), ["list"] = new JArray(1, new JObject { ["keep"] = true }) };
        native["Variables"]![0]!["FutureDefault"] = new JObject { ["DefaultValue"] = new JArray(new JRaw("1e999"), new JRaw("-0")) };
        ActionSourceWorkspace.Open(directory, ActionId, 7, "fixture", "catalog", native, noAutoFiles: true, hostBinding: host.Binding);
        var caw = ReadSource();
        caw["steps"]![0]!["note"] = "edited note";
        WriteSource(caw);
        Assert.IsTrue((await ActionSourceServeOps.SaveAsync(null, Args(dryRun: true), default)).Ok);
        var expected = (JObject)native.DeepClone();
        expected["Steps"]![0]!["Note"] = "edited note";
        var prepared = ActionSourceWorkspace.Prepare(directory);
        Assert.AreEqual(expected.ToString(Formatting.None), prepared.Body.ToString(Formatting.None));
        Assert.AreEqual(expected["FutureRoot"]!.ToString(Formatting.None), prepared.Body["FutureRoot"]!.ToString(Formatting.None));
        Assert.AreEqual(expected["Variables"]![0]!["FutureDefault"]!.ToString(Formatting.None), prepared.Body["Variables"]![0]!["FutureDefault"]!.ToString(Formatting.None));
    }

    [DataTestMethod]
    [DataRow(true)]
    [DataRow(false)]
    public async Task V2AndUnverifiedBundles_PreserveOpaqueDefaultsWithoutApplyingTheV1Profile(bool verifiedV2)
    {
        await using var host = new FakeBindingHost("v2");
        var native = Native();
        native["Variables"]![0]!["DefaultValue"] = new JObject { ["file"] = "files/opaque.txt", ["future"] = new JRaw("9007199254740993") };
        native["SubPrograms"]![0]!["Variables"]![0]!["DefaultValue"] = new JArray(new JRaw("1e999"), new JObject { ["future"] = true });
        ActionSourceWorkspace.Open(directory, ActionId, 7, "fixture", "catalog", native, noAutoFiles: true, hostBinding: verifiedV2 ? host.Binding : null);
        Assert.AreEqual(native.ToString(Formatting.None), ActionSourceWorkspace.Prepare(directory).Body.ToString(Formatting.None));
        var caw = ReadSource();
        caw["steps"]![0]!["note"] = "edited note";
        WriteSource(caw);
        var before = BundleTexts();
        var response = await ActionSourceServeOps.SaveAsync(null, Args(dryRun: true), default);
        Assert.IsTrue(response.Ok, response.Error + ": " + response.Message);
        var expected = (JObject)native.DeepClone();
        expected["Steps"]![0]!["Note"] = "edited note";
        Assert.AreEqual(expected.ToString(Formatting.None), ActionSourceWorkspace.Prepare(directory).Body.ToString(Formatting.None));
        AssertBundleTexts(before);
        Assert.AreEqual(0, host.Handshakes);
        Assert.AreEqual(0, host.Writes);
    }

    private JObject ReadSource() => ProgramSourceCodec.Decode(File.ReadAllText(Path.Combine(directory, ActionSourceWorkspace.SourceFile)));
    private void WriteSource(JObject caw) => File.WriteAllText(Path.Combine(directory, ActionSourceWorkspace.SourceFile), ProgramSourceCodec.Encode(caw));
    private JsonElement Args(bool dryRun) => JsonSerializer.SerializeToElement(new { dir = directory, dryRun });
    private Dictionary<string, string> BundleTexts() => new[] { ActionSourceWorkspace.SourceFile, ActionSourceWorkspace.IdentityFile, ActionSourceWorkspace.BaselineFile }
        .ToDictionary(path => path, path => File.ReadAllText(Path.Combine(directory, path)));
    private void AssertBundleTexts(Dictionary<string, string> expected)
    {
        foreach (var item in expected) Assert.AreEqual(item.Value, File.ReadAllText(Path.Combine(directory, item.Key)), item.Key);
    }

    private static void CamelCaseVariables(JObject program)
    {
        program["variables"] = program["Variables"]!.DeepClone();
        program.Remove("Variables");
        foreach (var variable in ((JArray)program["variables"]!).OfType<JObject>())
        {
            variable["defaultValue"] = variable["DefaultValue"]!.DeepClone();
            variable.Remove("DefaultValue");
        }
        program["subPrograms"] = program["SubPrograms"]!.DeepClone();
        program.Remove("SubPrograms");
        foreach (var child in ((JArray)program["subPrograms"]!).OfType<JObject>()) CamelCaseVariables(child);
    }

    private static JObject Native() => new()
    {
        ["Steps"] = new JArray(new JObject { ["StepRunnerKey"] = "sys:notify", ["StepId"] = "original", ["Note"] = "before" }),
        ["Variables"] = new JArray(new JObject { ["Key"] = "root", ["Id"] = "root-id", ["Type"] = 0, ["DefaultValue"] = "" }),
        ["SubPrograms"] = new JArray(new JObject
        {
            ["Id"] = "024d48d3-d319-4827-8c5a-468bc225832a", ["Name"] = "helper", ["Steps"] = new JArray(),
            ["Variables"] = new JArray(new JObject { ["Key"] = "child", ["Id"] = "child-id", ["Type"] = 0, ["DefaultValue"] = "" }),
            ["SubPrograms"] = new JArray(),
        }),
    };
}
