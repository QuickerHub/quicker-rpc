using Microsoft.VisualStudio.TestTools.UnitTesting;
using Newtonsoft.Json.Linq;
using QuickerRpc.AgentModel.Catalog;
using QuickerRpc.AgentModel.XAction.Source;

namespace QuickerRpc.Console.Test;

[TestClass]
public sealed class ProgramSourceCodecTests
{
    private const string Native = """
        {
          "PayloadType":"xAction", "LimitSingleInstance":true, "SummaryExpression":"$$",
          "UnknownRoot":{"keep":null}, "SubPrograms":null,
          "Variables":[{"Id":"variable-identity","Key":"message","Type":0,"DefaultValue":"","Desc":null,"SaveState":false,"UnknownVariable":123}],
          "Steps":[
            {"StepRunnerKey":"sys:notify","StepId":"first","InputParams":{"msg":{"VarKey":"","Value":"hello","FutureParam":{"keep":true}},"unused":null},"OutputParams":null,"Note":"","Disabled":false,"DelayMs":0,"UnknownStep":{"keep":null}},
            {"StepRunnerKey":"sys:comment","InputParams":{"note":{"VarKey":null,"Value":"second"}},"Collapsed":false}
          ]
        }
        """;

    [TestMethod]
    public void NativeRoundtripPreservesUnknownFieldsNullsIdsAndExplicitDefaults()
    {
        var native = JObject.Parse(Native);
        var caw = V1ProgramSourceCodec.FromNative(native);
        var source = ProgramSourceCodec.Encode(caw);
        var decoded = ProgramSourceCodec.Decode(source);
        ProgramSourceCodec.RequireLosslessRoundtrip(decoded);
        var result = V1ProgramSourceCodec.ToNative(decoded, native);
        Assert.IsTrue(JToken.DeepEquals(native, result), result.ToString());
        Assert.AreEqual("first", decoded["steps"]![0]!.Value<string>("stepId"));
    }

    [TestMethod]
    public void EditingOneInputPreservesNativeMetadataAndUnrelatedNullBindings()
    {
        var native = JObject.Parse(Native);
        var caw = V1ProgramSourceCodec.FromNative(native);
        caw["steps"]![0]!["inputs"]!["msg"] = "changed";
        var result = V1ProgramSourceCodec.ToNative(ProgramSourceCodec.Decode(ProgramSourceCodec.Encode(caw)), native);
        var expected = (JObject)native.DeepClone();
        expected["Steps"]![0]!["InputParams"]!["msg"]!["Value"] = "changed";
        Assert.IsTrue(JToken.DeepEquals(expected, result), result.ToString());
    }

    [TestMethod]
    public void ExportIdsMatchIdlessStepsAcrossReorderAndDeletion()
    {
        var native = JObject.Parse(Native);
        var caw = V1ProgramSourceCodec.FromNative(native);
        var steps = (JArray)caw["steps"]!;
        var second = (JObject)steps[1]!.DeepClone();
        second["inputs"]!["note"] = "edited second";
        steps.Clear();
        steps.Add(second);
        steps.Add(new JObject { ["key"] = "sys:notify", ["inputs"] = new JObject { ["msg"] = "new" } });
        var result = V1ProgramSourceCodec.ToNative(ProgramSourceCodec.Decode(ProgramSourceCodec.Encode(caw)), native);
        var kept = result["Steps"]![0]!;
        Assert.IsNull(kept["StepId"]);
        Assert.AreEqual(false, kept.Value<bool>("Collapsed"));
        Assert.AreEqual("edited second", kept["InputParams"]!["note"]!.Value<string>("Value"));
        Assert.AreEqual(2, ((JArray)result["Steps"]!).Count);
        Assert.IsNull(result["Steps"]![1]!["UnknownStep"]);
    }

    [TestMethod]
    public void ExplicitSourceCheckpointKeepsIdlessStepMetadataAcrossRepeatedSaves()
    {
        var native = JObject.Parse(Native);
        var caw = V1ProgramSourceCodec.FromNative(native);
        var second = (JObject)caw["steps"]![1]!.DeepClone();
        second["inputs"]!["note"] = "first edit";
        caw["steps"] = new JArray(second);
        var savedCaw = V1ProgramSourceCodec.NormalizeForSave(caw);
        var savedNative = V1ProgramSourceCodec.ToNative(savedCaw, native);
        second["inputs"]!["note"] = "second edit";
        var again = V1ProgramSourceCodec.ToNative(caw, savedNative, savedCaw);
        Assert.AreEqual(false, again["Steps"]![0]!.Value<bool>("Collapsed"));
        Assert.IsNull(again["Steps"]![0]!["InputParams"]!["note"]!["VarKey"]?.Value<string>());
        Assert.AreEqual("second edit", again["Steps"]![0]!["InputParams"]!["note"]!.Value<string>("Value"));
        Assert.IsNull(again["Steps"]![0]!["StepId"]);
    }

    [TestMethod]
    public void NormalizeForSaveKeepsGeneratedSubprogramIdentityOnNextSave()
    {
        var source = ProgramSourceCodec.Decode("variables: []\nsteps: []\nsubPrograms:\n  - name: helper\n    variables: []\n    steps: []\n");
        var first = V1ProgramSourceCodec.NormalizeForSave(source);
        var second = V1ProgramSourceCodec.NormalizeForSave(source, first);
        Assert.IsFalse(string.IsNullOrWhiteSpace(first["subPrograms"]![0]!.Value<string>("id")));
        Assert.AreEqual(first["subPrograms"]![0]!.Value<string>("id"), second["subPrograms"]![0]!.Value<string>("id"));
    }

    [TestMethod]
    public void MovingStepAcrossBranchPreservesItsBaselineMetadata()
    {
        var native = JObject.Parse("""{"Steps":[{"StepRunnerKey":"sys:if","StepId":"condition","InputParams":{"condition":{"Value":"$=true"}},"IfSteps":[{"StepRunnerKey":"sys:notify","StepId":"child","InputParams":{"msg":{"Value":"hello","Future":123}},"UnknownChild":true}]}],"Variables":[]}""");
        var caw = V1ProgramSourceCodec.FromNative(native);
        var child = caw["steps"]![0]!["ifSteps"]![0]!.DeepClone();
        ((JObject)caw["steps"]![0]!).Remove("ifSteps");
        ((JArray)caw["steps"]!).Add(child);
        child["inputs"]!["msg"] = "moved";
        var result = V1ProgramSourceCodec.ToNative(caw, native);
        Assert.AreEqual(true, result["Steps"]![1]!.Value<bool>("UnknownChild"));
        Assert.AreEqual(123, result["Steps"]![1]!["InputParams"]!["msg"]!.Value<int>("Future"));
        Assert.AreEqual("moved", result["Steps"]![1]!["InputParams"]!["msg"]!.Value<string>("Value"));
    }

    [TestMethod]
    public void NativeIsoDatesRemainLosslessThroughYaml()
    {
        var native = JObject.Parse("""{"Variables":[],"Steps":[],"SubPrograms":[{"Id":"helper","Name":"helper","CreateTimeUtc":"2026-10-22T10:01:02Z","Variables":[],"Steps":[]}]}""");
        var caw = V1ProgramSourceCodec.FromNative(native);
        var result = V1ProgramSourceCodec.ToNative(ProgramSourceCodec.Decode(ProgramSourceCodec.Encode(caw)), native);
        Assert.IsTrue(JToken.DeepEquals(native, result), result.ToString());
    }

    [TestMethod]
    public void LowercaseEmptyNativeCanAddStepAndSaveTwiceWithoutDuplicateAliases()
    {
        var native = JObject.Parse("""{"steps":[],"variables":[],"subPrograms":[]}""");
        var original = V1ProgramSourceCodec.FromNative(native);
        Assert.IsTrue(JToken.DeepEquals(native, V1ProgramSourceCodec.ToNative(original, native)));
        var current = ProgramSourceCodec.Decode("variables: []\nsteps:\n  - notify: hello\nsubPrograms: []\n");
        var checkpoint = V1ProgramSourceCodec.NormalizeForSave(current, original);
        var first = V1ProgramSourceCodec.ToNative(checkpoint, native, original);
        Assert.IsNull(first["steps"]); Assert.IsNull(first["variables"]); Assert.IsNull(first["subPrograms"]);
        Assert.IsNotNull(first["Steps"]); Assert.IsNotNull(first["Variables"]); Assert.IsNotNull(first["SubPrograms"]);
        Assert.IsNotNull(V1ProgramSourceCodec.FromNative(first));
        current["steps"]![0]!["inputs"]!["msg"] = "again";
        var second = V1ProgramSourceCodec.ToNative(current, first, checkpoint);
        Assert.AreEqual("again", second["Steps"]![0]!["InputParams"]!["msg"]!.Value<string>("Value"));
        Assert.IsNotNull(V1ProgramSourceCodec.FromNative(second));
    }

    [TestMethod]
    public void LowercaseNativeLongNamesPreserveMetadataDuringEdits()
    {
        var native = JObject.Parse("""{"steps":[{"stepRunnerKey":"sys:notify","inputParams":{"msg":{"varKey":"","value":"hello","Future":true}},"stepId":"existing"}],"variables":[{"key":"message","type":0,"defaultValue":"hello","id":"keep"}],"subPrograms":[]}""");
        var caw = V1ProgramSourceCodec.FromNative(native);
        var decoded = ProgramSourceCodec.Decode(ProgramSourceCodec.Encode(caw));
        Assert.IsTrue(JToken.DeepEquals(native, V1ProgramSourceCodec.ToNative(decoded, native)));
        decoded["steps"]![0]!["inputs"]!["msg"] = "changed";
        decoded["variables"]![0]!["default"] = "changed";
        var result = V1ProgramSourceCodec.ToNative(decoded, native, caw);
        Assert.AreEqual("changed", result["Steps"]![0]!["InputParams"]!["msg"]!.Value<string>("Value"));
        Assert.AreEqual(true, result["Steps"]![0]!["InputParams"]!["msg"]!.Value<bool>("Future"));
        Assert.AreEqual("keep", result["Variables"]![0]!.Value<string>("Id"));
        Assert.AreEqual("changed", result["Variables"]![0]!.Value<string>("DefaultValue"));
        Assert.IsNotNull(V1ProgramSourceCodec.FromNative(result));
    }

    [TestMethod]
    public void DuplicateVariableKeysAndStepIdsAreRejected()
    {
        var duplicateVariables = JObject.Parse("""{"Variables":[{"Key":"x"},{"Key":"x"}],"Steps":[]}""");
        Assert.ThrowsException<ProgramSourceException>(() => V1ProgramSourceCodec.FromNative(duplicateVariables));
        var duplicateSteps = JObject.Parse("""{"Variables":[],"Steps":[{"StepRunnerKey":"sys:notify","StepId":"x"},{"StepRunnerKey":"sys:comment","StepId":"x"}]}""");
        Assert.ThrowsException<ProgramSourceException>(() => V1ProgramSourceCodec.FromNative(duplicateSteps));
    }

    [TestMethod]
    public void SourceSupportsUpstreamIfEachAndBindingSyntax()
    {
        var source = """
            $schema: quicker.program.source.v1
            variables:
              - key: text
                varType: text
            steps:
              - if:
                  condition: "$=true"
                  then:
                    - notify:
                        msg:
                          var: text
              - each:
                  input:
                    var: text
                  then:
                    - comment: |-
                        first
                        second
            """;
        var caw = ProgramSourceCodec.Decode(source);
        Assert.AreEqual("sys:if", caw["steps"]![0]!.Value<string>("key"));
        Assert.AreEqual("text", caw["steps"]![0]!["ifSteps"]![0]!["inputs"]!.Value<string>("msg.var"));
        ProgramSourceCodec.RequireLosslessRoundtrip(caw);
    }

    [TestMethod]
    public void SourceRejectsAliasesMixedBindsAndConflictingBranches()
    {
        var alias = Assert.ThrowsException<ProgramSourceException>(() => ProgramSourceCodec.Decode("steps: &steps []\n"));
        Assert.AreEqual(ProgramSourceCodes.YamlAliasForbidden, alias.Code);
        var mixed = Assert.ThrowsException<ProgramSourceException>(() => ProgramSourceCodec.Decode("steps:\n  - notify:\n      msg:\n        var: a\n        file: files/x.txt\n"));
        Assert.AreEqual(ProgramSourceCodes.MixedBind, mixed.Code);
        var conflict = Assert.ThrowsException<ProgramSourceException>(() => ProgramSourceCodec.Decode("steps:\n  - writeClipboard:\n      text: a\n      input: b\n"));
        Assert.AreEqual(ProgramSourceCodes.BranchConflict, conflict.Code);
    }

    [TestMethod]
    public void CatalogRejectsPrimaryOutputThatDoesNotExist()
    {
        var catalog = new StepRunnerCatalog
        {
            Items = [new StepRunnerDefinition { Key = "sys:notify", OutputParamDefs = [new StepRunnerOutputParamDef { Key = "isSuccess" }] }],
        };
        var error = Assert.ThrowsException<ProgramSourceException>(() => ProgramSourceCodec.Decode("steps:\n  - notify:\n      msg: hello\n      '>>': result\n", catalog));
        Assert.AreEqual(ProgramSourceCodes.NoPrimaryOutput, error.Code);
    }

    [TestMethod]
    public void EmbeddedSubprogramCallsKeepNativeVarPrefixesAndIdentity()
    {
        var native = JObject.Parse("""
            {"Variables":[],"Steps":[{"StepId":"call","StepRunnerKey":"sys:subprogram","InputParams":{"subProgram":{"Value":"helper"},"var:message":{"Value":"hello","Future":123}},"OutputParams":{"var:message":"result"}}],
            "SubPrograms":[{"Id":"helper-id","Name":"helper","SummaryExpression":"$$","Variables":[{"Id":"parameter-id","Key":"message","Type":0,"IsInput":true,"IsOutput":true}],"Steps":[],"UnknownSub":true}]}
            """);
        var caw = V1ProgramSourceCodec.FromNative(native);
        var result = V1ProgramSourceCodec.ToNative(ProgramSourceCodec.Decode(ProgramSourceCodec.Encode(caw)), native);
        Assert.IsTrue(JToken.DeepEquals(native, result), result.ToString());
        caw["steps"]![0]!["inputs"]!["message"] = "changed";
        result = V1ProgramSourceCodec.ToNative(caw, native);
        Assert.AreEqual("changed", result["Steps"]![0]!["InputParams"]!["var:message"]!.Value<string>("Value"));
        Assert.AreEqual(123, result["Steps"]![0]!["InputParams"]!["var:message"]!.Value<int>("Future"));
        Assert.AreEqual("helper", result["Steps"]![0]!["InputParams"]!["subProgram"]!.Value<string>("Value"));
    }

    private const string EscapedNativeSubprogram = """
        {
          "Variables": [],
          "Steps": [{"StepId":"call","StepRunnerKey":"sys:subprogram",
            "InputParams":{"subProgram":{"Value":"helper"},"var\u001fmessage":{"VarKey":"seed","Value":"unused","Future":123}},
            "OutputParams":{"var\u001fmessage":"result","isSuccess":"ok"},"FutureStep":true}],
          "SubPrograms": [{"Id":"helper-id","Name":"helper","Variables":[{"Key":"message","Type":0,"IsInput":true,"IsOutput":true}],
            "Steps":[{"StepId":"nested-call","StepRunnerKey":"sys:subprogram",
              "InputParams":{"subProgram":{"Value":"leaf"},"var\u001fmessage":{"Value":"inner","Future":456}},
              "OutputParams":{"var\u001fmessage":"nested-result"}}],"FutureSub":true},
            {"Id":"leaf-id","Name":"leaf","Variables":[],"Steps":[]}]
        }
        """;

    [TestMethod]
    public void EscapedNativeSubprogramIoIsReadableAndLosslessIncludingEmbeddedCalls()
    {
        var native = JObject.Parse(EscapedNativeSubprogram);
        var caw = V1ProgramSourceCodec.FromNative(native);
        Assert.AreEqual("helper", caw["steps"]![0]!.Value<string>("subProgram"));
        Assert.AreEqual("seed", caw["steps"]![0]!["inputs"]!.Value<string>("message.var"));
        Assert.AreEqual("result", caw["steps"]![0]!["outputs"]!.Value<string>("message"));
        var nested = caw["subPrograms"]![0]!["steps"]![0]!;
        Assert.AreEqual("leaf", nested.Value<string>("subProgram"));
        Assert.AreEqual("inner", nested["inputs"]!.Value<string>("message"));
        Assert.AreEqual("nested-result", nested["outputs"]!.Value<string>("message"));
        var decoded = ProgramSourceCodec.Decode(ProgramSourceCodec.Encode(caw));
        Assert.IsTrue(JToken.DeepEquals(native, V1ProgramSourceCodec.ToNative(decoded, native, caw)));
    }

    [TestMethod]
    public void EscapedNativeBindingsKeepStorageSpellingAndMetadataAcrossEditsAndRepeatedSave()
    {
        var native = JObject.Parse(EscapedNativeSubprogram);
        var baseline = V1ProgramSourceCodec.FromNative(native);
        var current = ProgramSourceCodec.Decode(ProgramSourceCodec.Encode(baseline));
        var outerInputs = (JObject)current["steps"]![0]!["inputs"]!;
        outerInputs.Remove("message.var");
        outerInputs["message"] = "changed";
        current["steps"]![0]!["outputs"]!["message"] = "new-result";
        var nested = current["subPrograms"]![0]!["steps"]![0]!;
        ((JObject)nested["inputs"]!).Remove("message");
        nested["inputs"]!["message.var"] = "inner-seed";
        nested["outputs"]!["message"] = "new-nested-result";

        var checkpoint = V1ProgramSourceCodec.NormalizeForSave(current, baseline);
        var first = V1ProgramSourceCodec.ToNative(checkpoint, native, baseline);
        var expected = (JObject)native.DeepClone();
        var expectedBinding = expected["Steps"]![0]!["InputParams"]!["var\u001fmessage"]!;
        expectedBinding["VarKey"] = "";
        expectedBinding["Value"] = "changed";
        expected["Steps"]![0]!["OutputParams"]!["var\u001fmessage"] = "new-result";
        var expectedNested = expected["SubPrograms"]![0]!["Steps"]![0]!;
        expectedNested["InputParams"]!["var\u001fmessage"]!["VarKey"] = "inner-seed";
        expectedNested["InputParams"]!["var\u001fmessage"]!["Value"] = "";
        expectedNested["OutputParams"]!["var\u001fmessage"] = "new-nested-result";
        Assert.IsTrue(JToken.DeepEquals(expected, first), first.ToString());
        Assert.IsTrue(JToken.DeepEquals(checkpoint, V1ProgramSourceCodec.FromNative(first)));

        outerInputs["message"] = "second edit";
        ((JObject)current["steps"]![0]!["outputs"]!).Remove("message");
        nested["inputs"]!["extra"] = "new argument";
        nested["outputs"]!["extra"] = "extra-result";
        var second = V1ProgramSourceCodec.ToNative(current, first, checkpoint);
        expectedBinding["Value"] = "second edit";
        ((JObject)expected["Steps"]![0]!["OutputParams"]!).Remove("var\u001fmessage");
        expectedNested["InputParams"]!["var:extra"] = new JObject { ["Value"] = "new argument" };
        expectedNested["OutputParams"]!["var:extra"] = "extra-result";
        Assert.IsTrue(JToken.DeepEquals(expected, second), second.ToString());
        Assert.IsNotNull(V1ProgramSourceCodec.FromNative(second));
    }

    [TestMethod]
    public void EscapedAndPlainNativeMapAliasesAreRejectedInsteadOfLosingBindings()
    {
        foreach (var field in new[] { "InputParams", "OutputParams" })
        {
            var native = JObject.Parse(EscapedNativeSubprogram);
            var map = (JObject)native["Steps"]![0]![field]!;
            map["var:message"] = map["var\u001fmessage"]!.DeepClone();
            Assert.ThrowsException<ProgramSourceException>(() => V1ProgramSourceCodec.FromNative(native));
        }
    }
}
