using Microsoft.VisualStudio.TestTools.UnitTesting;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using QuickerRpc.AgentModel.XAction.Source;

namespace QuickerRpc.Console.Test;

[TestClass]
public sealed class ProgramSourceEditorProjectionTests
{
    private static JObject Read(string json) => LosslessProgramJson.ParseObject(json);
    private static JObject Editor(ProgramSourceEditorProjection projection) => Read(projection.EditorJson);
    private static string Json(JObject value) => value.ToString(Formatting.None);
    private static void Same(JToken expected, JToken actual, string? reason = null) => Assert.IsTrue(JToken.DeepEquals(expected, actual), reason + "\nExpected: " + expected + "\nActual: " + actual);
    private static void Unsupported(Action operation)
    {
        var error = Assert.ThrowsException<ProgramSourceException>(operation);
        Assert.AreEqual(ProgramSourceEditorProjection.UnsupportedCode, error.Code);
    }

    [TestMethod]
    public void Raw_decoded_source_roundtrips_files_opaque_values_and_unknown_branches_without_materialization()
    {
        var caw = ProgramSourceCodec.Decode("""
            $schema: quicker.program.source.v1
            variables:
              - key: source
                varType: text
                default.file: files/not-present.txt
                future:
                  retained: true
            steps:
              - key: future:runner
                stepId: original-step
                inputs:
                  code:
                    file: files/also-not-present.cs
                  from:
                    var: source
                  literal: '@var:literal text'
                  escaped: '@value:already literal'
                futurePayload:
                  nested:
                    - null
                    - future: yes
                ifSteps:
                  - key: future:branch
                    note: child
            subPrograms: []
            futureRoot:
              - 9223372036854775807
              - 0.123456789012345678901
              - 1e999
              - -0
            """);
        var before = Json(caw);
        var projection = ProgramSourceEditorProjection.Create(caw);
        var editor = Editor(projection);
        Assert.AreEqual("future:runner", editor["steps"]![0]!.Value<string>("stepRunnerKey"));
        Assert.AreEqual("files/also-not-present.cs", editor["steps"]![0]!["inputParams"]!.Value<string>("code.file"));
        Assert.AreEqual("@value:@var:literal text", editor["steps"]![0]!["inputParams"]!.Value<string>("literal"));
        Assert.AreEqual("@value:@value:already literal", editor["steps"]![0]!["inputParams"]!.Value<string>("escaped"));
        Assert.AreEqual("files/not-present.txt", editor["variables"]![0]!.Value<string>("default.file"));
        Same(caw, projection.ToCaw(projection.EditorJson));
        editor["steps"]![0]!["note"] = "edited";
        var saved = projection.ToCaw(Json(editor));
        Assert.AreEqual("edited", saved["steps"]![0]!.Value<string>("note"));
        Same(caw["futureRoot"]!, saved["futureRoot"]!);
        Same(caw["steps"]![0]!["inputs"]!, saved["steps"]![0]!["inputs"]!);
        Same(caw["steps"]![0]!["futurePayload"]!, saved["steps"]![0]!["futurePayload"]!);
        Same(caw["steps"]![0]!["ifSteps"]!, saved["steps"]![0]!["ifSteps"]!);
        Assert.AreEqual(before, Json(caw), "projection and edits do not mutate the supplied source");
    }

    [TestMethod]
    public void Internal_calls_expand_target_and_reserved_callee_io_then_fold_edited_nested_calls()
    {
        var caw = Read("""
            {"variables":[],"steps":[{"key":"sys:subprogram","subProgram":"Child","inputs":{"subProgram":"callee argument","message.var":"msg","code.file":"files/a.cs","summary":"caption","var:summary":"callee summary"},"outputs":{"answer":"result","isSuccess":"ok","var:isSuccess":"calleeOk"},"ifSteps":[{"key":"sys:subprogram","subProgram.var":"selected"}]}],"subPrograms":[{"id":"child","name":"Child","variables":[],"steps":[],"subPrograms":[{"name":"Nested","variables":[],"steps":[]}]}]}
            """);
        var projection = ProgramSourceEditorProjection.Create(caw);
        var editor = Editor(projection);
        var call = (JObject)editor["steps"]![0]!;
        var inputs = (JObject)call["inputParams"]!;
        Assert.AreEqual("Child", inputs.Value<string>("subProgram"));
        Assert.AreEqual("callee argument", inputs.Value<string>("var:subProgram"));
        Assert.AreEqual("msg", inputs.Value<string>("var:message.var"));
        Assert.AreEqual("files/a.cs", inputs.Value<string>("var:code.file"));
        Assert.AreEqual("callee summary", inputs.Value<string>("var:summary"));
        Assert.AreEqual("selected", call["ifSteps"]![0]!["inputParams"]!.Value<string>("subProgram.var"));
        Same(caw, projection.ToCaw(projection.EditorJson));
        inputs["subProgram"] = "Other";
        inputs["var:message.var"] = "changed";
        var saved = projection.ToCaw(Json(editor));
        Assert.AreEqual("Other", saved["steps"]![0]!.Value<string>("subProgram"));
        Assert.AreEqual("changed", saved["steps"]![0]!["inputs"]!.Value<string>("message.var"));
        Assert.IsNull(saved["steps"]![0]!["stepId"]);
        Assert.IsNull(saved["steps"]![0]!["ifSteps"]![0]!["inputs"]);
        Assert.IsNull(saved["subPrograms"]![0]!["subPrograms"]![0]!["id"]);
    }

    [TestMethod]
    public void Source_and_native_real_ids_survive_and_synthetic_ids_never_reach_native_fields()
    {
        var native = Read("""
            {"Steps":[{"StepRunnerKey":"sys:comment","StepId":"s-1","InputParams":{"note":{"Value":"before","Future":{"keep":null}}}}],"Variables":[{"Id":"native-real","Key":"first","Type":0,"DefaultValue":"","Future":{"n":9223372036854775807,"nil":null}},{"Id":"v-1","Key":"second","Type":0}],"SubPrograms":[{"Id":"child","Name":"Child","Steps":[],"Variables":[{"Id":"native-real","Key":"local","Type":0,"Future":"nested"}]}]}
            """);
        var baseline = V1ProgramSourceCodec.FromNative(native);
        var raw = ProgramSourceCodec.Decode(ProgramSourceCodec.Encode(baseline));
        // Old bundles have no source variable ids. Only genuine native ids may be promoted on rename.
        foreach (var variable in ((JArray)raw["variables"]!).OfType<JObject>()) variable.Remove("id");
        ((JObject)raw["subPrograms"]![0]!["variables"]![0]!).Remove("id");
        var projection = ProgramSourceEditorProjection.Create(raw, baseline, native);
        var editor = Editor(projection);
        Assert.AreEqual("native-real", editor["variables"]![0]!.Value<string>("id"));
        Same(raw, projection.ToCaw(projection.EditorJson));
        editor["variables"]![0]!["key"] = "renamed";
        editor["subPrograms"]![0]!["variables"]![0]!["key"] = "renamed-local";
        ((JArray)editor["variables"]!).Add(Read("""{"id":"v-1700000000000","key":"new","varType":"text","future":"new-data"}"""));
        var caw = projection.ToCaw(Json(editor));
        Assert.AreEqual("native-real", caw["variables"]![0]!.Value<string>("id"));
        Assert.IsNull(caw["variables"]![1]!["id"], "native id resembling a GUI id is retained by the native baseline, not written as synthetic source data");
        Assert.IsNull(caw["variables"]![2]!["id"]);
        var saved = V1ProgramSourceCodec.ToNative(caw, native, baseline);
        Assert.AreEqual("native-real", saved["Variables"]![0]!.Value<string>("Id"));
        Assert.AreEqual("v-1", saved["Variables"]![1]!.Value<string>("Id"));
        Same(native["Variables"]![0]!["Future"]!, saved["Variables"]![0]!["Future"]!);
        Assert.IsNull(saved["Variables"]![2]!["Id"]);
        Assert.AreEqual("native-real", saved["SubPrograms"]![0]!["Variables"]![0]!.Value<string>("Id"));
        Assert.AreEqual("nested", saved["SubPrograms"]![0]!["Variables"]![0]!.Value<string>("Future"));
    }

    [TestMethod]
    public void Explicit_source_ids_keep_their_spelling_and_legacy_numeric_type_is_reversible()
    {
        var raw = Read("""{"steps":[],"variables":[{"Id":"real-source-id","key":"count","type":12,"future":{"keep":null}}]}""");
        var projection = ProgramSourceEditorProjection.Create(raw);
        var editor = Editor(projection);
        Assert.AreEqual("real-source-id", editor["variables"]![0]!.Value<string>("id"));
        Assert.AreEqual(12, editor["variables"]![0]!.Value<int>("varType"));
        Same(raw, projection.ToCaw(projection.EditorJson));
        editor["variables"]![0]!["key"] = "renamed";
        editor["variables"]![0]!["varType"] = "number";
        var saved = projection.ToCaw(Json(editor));
        Assert.AreEqual("real-source-id", saved["variables"]![0]!.Value<string>("Id"));
        Assert.IsNull(saved["variables"]![0]!["id"]);
        Assert.IsNull(saved["variables"]![0]!["type"]);
        Assert.AreEqual("number", saved["variables"]![0]!.Value<string>("varType"));
    }

    [TestMethod]
    public void Idless_source_rename_and_reorder_survive_two_saves_and_a_newer_ui_draft()
    {
        var raw = Read("""{"steps":[{"key":"future:runner"}],"variables":[{"key":"first","default.file":"files/no-read.txt","opaque":9223372036854775807},{"key":"second","opaque":1e999}],"futureRoot":{"nested":[null,-0]}}""");
        var first = ProgramSourceEditorProjection.Create(raw);
        var savedDocument = Editor(first);
        var variables = (JArray)savedDocument["variables"]!;
        var firstRow = variables[0]!.DeepClone();
        firstRow["key"] = "renamed-first";
        var secondRow = variables[1]!.DeepClone();
        variables.ReplaceAll(new object[] { secondRow, firstRow });
        var savedCaw = first.ToCaw(Json(savedDocument));
        Assert.AreEqual("second", savedCaw["variables"]![0]!.Value<string>("key"));
        Assert.IsNull(savedCaw["variables"]![0]!["id"]);
        Assert.IsNull(savedCaw["steps"]![0]!["stepId"]);

        // The save response races a newer draft. Its baseline retains old GUI ids after reorder.
        var newerDraft = (JObject)savedDocument.DeepClone();
        newerDraft["variables"]![1]!["key"] = "renamed-again";
        newerDraft["steps"]![0]!["note"] = "draft created while saving";
        var second = ProgramSourceEditorProjection.Create(savedCaw);
        var savedAgain = second.ToCaw(Json(newerDraft), Json(savedDocument));
        Assert.AreEqual("renamed-again", savedAgain["variables"]![1]!.Value<string>("key"));
        Assert.AreEqual("draft created while saving", savedAgain["steps"]![0]!.Value<string>("note"));
        Assert.IsNull(savedAgain["variables"]![1]!["id"]);
        Same(raw["futureRoot"]!, savedAgain["futureRoot"]!);
        Same(raw["variables"]![0]!["opaque"]!, savedAgain["variables"]![1]!["opaque"]!);
        Assert.AreEqual("files/no-read.txt", savedAgain["variables"]![1]!.Value<string>("default.file"));
        Same(savedCaw, second.ToCaw(Json(savedDocument), Json(savedDocument)), "rebase is request-local and does not consume or mutate its baseline");
    }

    [TestMethod]
    public void A_rebase_cannot_omit_unknown_fields_change_numbers_or_change_real_identities()
    {
        var source = Read("""{"steps":[{"key":"future","stepId":"actual","opaque":1e999}],"variables":[{"id":"actual-variable","key":"x","opaque":9223372036854775807}],"future":{"required":true}}""");
        var projection = ProgramSourceEditorProjection.Create(source);
        foreach (var change in new Action<JObject>[]
        {
            row => row.Remove("future"),
            row => ((JObject)row["variables"]![0]!).Remove("opaque"),
            row => row["steps"]![0]!["opaque"] = 1,
            row => row["variables"]![0]!["id"] = "different",
            row => row["steps"]![0]!["stepId"] = "different",
        })
        {
            var baseline = Editor(projection);
            change(baseline);
            Unsupported(() => projection.ToCaw(projection.EditorJson, Json(baseline)));
        }
    }

    [TestMethod]
    public void Acknowledged_gui_defaults_remain_a_valid_baseline_after_real_codec_emission()
    {
        var source = ProgramSourceCodec.Decode("variables: []\nsteps: []\n");
        var projection = ProgramSourceEditorProjection.Create(source);
        var acknowledged = Editor(projection);
        ((JArray)acknowledged["steps"]!).Add(Read("""
            {"stepId":"new","stepRunnerKey":"sys:comment","inputParams":{},"outputParams":{},"ifSteps":[],"elseSteps":[],"note":"","disabled":false,"collapsed":false,"delayMs":0,"future":{"empty":{},"false":false,"number":1e999}}
            """));
        ((JArray)acknowledged["variables"]!).Add(Read("""
            {"id":"v-new-gui-row","key":"new","default":"","desc":"","paramName":"","group":"","customType":"","isLocked":false,"saveState":false,"isInput":false,"isOutput":false,"inputParamInfo":{},"outputParamInfo":{},"tableDef":{},"future":{"numbers":[9223372036854775807,-0]}}
            """));
        acknowledged["subPrograms"] = new JArray(Read("""{"id":"new-sub","name":"New sub","kind":1,"steps":[],"variables":[],"subPrograms":[]}"""));
        var firstCaw = projection.ToCaw(Json(acknowledged));
        var decodedSavedSource = ProgramSourceCodec.Decode(ProgramSourceCodec.Encode(firstCaw));
        Assert.IsNull(decodedSavedSource["steps"]![0]!["inputs"]);
        Assert.IsNull(decodedSavedSource["steps"]![0]!["outputs"]);
        Assert.IsNull(decodedSavedSource["variables"]![0]!["desc"]);
        Assert.AreEqual("text", decodedSavedSource["variables"]![0]!.Value<string>("varType"));
        Assert.AreEqual("", decodedSavedSource["variables"]![0]!.Value<string>("default"), "empty default is source data, not a removable GUI default");
        var next = ProgramSourceEditorProjection.Create(decodedSavedSource);
        Same(decodedSavedSource, next.ToCaw(Json(acknowledged), Json(acknowledged)));
        var newerDraft = (JObject)acknowledged.DeepClone();
        newerDraft["steps"]![0]!["note"] = "second save";
        newerDraft["variables"]![0]!["default"] = "new default";
        var secondCaw = next.ToCaw(Json(newerDraft), Json(acknowledged));
        Assert.AreEqual("second save", secondCaw["steps"]![0]!.Value<string>("note"));
        Assert.AreEqual("new default", secondCaw["variables"]![0]!.Value<string>("default"));
        Assert.IsNull(secondCaw["variables"]![0]!["id"]);
        Same(decodedSavedSource["steps"]![0]!["future"]!, secondCaw["steps"]![0]!["future"]!);
        Same(decodedSavedSource["variables"]![0]!["future"]!, secondCaw["variables"]![0]!["future"]!);
    }

    [TestMethod]
    public void Structural_default_rebase_does_not_erase_unknowns_nondefaults_or_empty_variable_defaults()
    {
        var source = Read("""
            {"steps":[{"key":"future","stepId":"step","future":{"outputs":{},"note":"","disabled":false,"nil":null,"number":1e999}}],"variables":[{"key":"x","varType":"text","default":"","future":{"isInput":false,"tableDef":{}}}],"subPrograms":[{"id":"sub","name":"Sub","steps":[],"variables":[]}]}
            """
        );
        var projection = ProgramSourceEditorProjection.Create(source);
        var acknowledged = Editor(projection);
        acknowledged["subPrograms"]![0]!["subPrograms"] = new JArray();
        Same(source, projection.ToCaw(Json(acknowledged), Json(acknowledged)), "only the absent structural subPrograms list may be restored");
        foreach (var change in new Action<JObject>[]
        {
            row => ((JObject)row["steps"]![0]!["future"]!).Remove("outputs"),
            row => ((JObject)row["steps"]![0]!["future"]!).Remove("nil"),
            row => ((JObject)row["variables"]![0]!["future"]!).Remove("isInput"),
            row => ((JObject)row["variables"]![0]!).Remove("default"),
            row => row["steps"]![0]!["outputParams"] = new JObject { ["newOutput"] = "x" },
            row => row["steps"]![0]!["disabled"] = true,
            row => row["steps"]![0]!["delayMs"] = 1,
            row => row["steps"]![0]!["note"] = " ",
            row => row["variables"]![0]!["varType"] = "number",
        })
        {
            var invalid = (JObject)acknowledged.DeepClone();
            change(invalid);
            Unsupported(() => projection.ToCaw(Json(acknowledged), Json(invalid)));
        }
    }

    [TestMethod]
    public void Baseline_native_without_a_real_variable_id_rejects_rename_instead_of_losing_metadata()
    {
        var native = Read("""{"Steps":[],"Variables":[{"Key":"existing","Type":0,"Future":{"unknown":null}}]}""");
        var caw = V1ProgramSourceCodec.FromNative(native);
        var projection = ProgramSourceEditorProjection.Create(caw, caw, native);
        var edited = Editor(projection);
        edited["variables"]![0]!["key"] = "renamed";
        Unsupported(() => projection.ToCaw(Json(edited)));
        Same(caw, projection.ToCaw(projection.EditorJson));
    }

    [TestMethod]
    public void An_id_added_only_to_current_source_cannot_prove_native_variable_rename_ownership()
    {
        var native = Read("""{"Steps":[],"Variables":[{"Key":"existing","Type":0,"Future":{"unknown":null}}]}""");
        var checkpoint = V1ProgramSourceCodec.FromNative(native);
        var raw = (JObject)checkpoint.DeepClone();
        raw["variables"]![0]!["id"] = "new-id-not-yet-paired-with-native";
        var projection = ProgramSourceEditorProjection.Create(raw, checkpoint, native);
        var edited = Editor(projection);
        edited["variables"]![0]!["key"] = "renamed";
        Unsupported(() => projection.ToCaw(Json(edited)));
        Same(raw, projection.ToCaw(projection.EditorJson));

        // A checkpoint that already pairs a real source identity with the original key is proof.
        var pairedCheckpoint = (JObject)raw.DeepClone();
        var paired = ProgramSourceEditorProjection.Create(raw, pairedCheckpoint, native);
        var pairedEditor = Editor(paired);
        pairedEditor["variables"]![0]!["key"] = "renamed";
        var caw = paired.ToCaw(Json(pairedEditor));
        var saved = V1ProgramSourceCodec.ToNative(caw, native, pairedCheckpoint);
        Assert.AreEqual("renamed", saved["Variables"]![0]!.Value<string>("Key"));
        Assert.AreEqual("new-id-not-yet-paired-with-native", saved["Variables"]![0]!.Value<string>("Id"));
        Same(native["Variables"]![0]!["Future"]!, saved["Variables"]![0]!["Future"]!);
    }

    [TestMethod]
    public void Unsupported_input_and_default_values_fail_before_the_GUI_can_coerce_them_to_empty_strings()
    {
        foreach (var value in new[] { "42", "0.123456789012345678901", "1e999", "false", "null", "[]", "[1]", "{}", "{\"literal\":\"data\"}", "{\"value\":\"looks-like-a-legacy-binding\"}" })
        {
            foreach (var suffix in new[] { "", ".var", ".file" })
            {
                var source = Read("{\"steps\":[{\"key\":\"future\",\"inputs\":{\"p" + suffix + "\":" + value + "}}]}");
                Unsupported(() => ProgramSourceEditorProjection.Create(source));
            }
            foreach (var field in new[] { "default", "default.file" })
            {
                var source = Read("{\"steps\":[],\"variables\":[{\"key\":\"x\",\"" + field + "\":" + value + "}]}");
                Unsupported(() => ProgramSourceEditorProjection.Create(source));
            }
            Unsupported(() => ProgramSourceEditorProjection.Create(Read("{\"steps\":[{\"key\":\"future\",\"outputs\":{\"result\":" + value + "}}]}")));
        }
        var opaque = Read("""
            {"steps":[{"key":"future","inputs":{"value":"safe"},"future":{"nil":null,"number":1e999,"array":[false,9223372036854775807],"object":{}}}],"variables":[{"key":"x","default":"","future":{"default":{},"number":0.123456789012345678901,"nil":null}}]}
            """);
        var projection = ProgramSourceEditorProjection.Create(opaque);
        Same(opaque, projection.ToCaw(projection.EditorJson));
        var edited = Editor(projection);
        edited["steps"]![0]!["note"] = "unrelated edit";
        var saved = projection.ToCaw(Json(edited));
        Same(opaque["steps"]![0]!["future"]!, saved["steps"]![0]!["future"]!);
        Same(opaque["variables"]![0]!["future"]!, saved["variables"]![0]!["future"]!);
        edited["steps"]![0]!["inputParams"]!["value"] = new JObject { ["literal"] = "cannot display" };
        Unsupported(() => projection.ToCaw(Json(edited)));
    }

    [TestMethod]
    public void Conflicting_bindings_aliases_duplicate_rows_and_metadata_changes_fail_closed()
    {
        foreach (var json in new[]
        {
            """{"steps":[{"key":"x","stepRunnerKey":"x"}]}""",
            """{"steps":[{"key":"x","inputs":{"p":"x","p.var":"v"}}]}""",
            """{"steps":[{"key":"x","inputs":{"p.VAR":"v"}}]}""",
            """{"steps":[{"key":"sys:subprogram","subProgram":"x","inputs":{"x":"a","var:x":"b"}}]}""",
            """{"steps":[{"key":"x","stepId":"same"},{"key":"y","stepId":"same"}]}""",
            """{"steps":[],"variables":[{"key":"x"},{"key":"x"}]}""",
            """{"steps":[3]}""",
            """{"subPrograms":[{"id":"foreign","kind":2}]}""",
        }) Unsupported(() => ProgramSourceEditorProjection.Create(Read(json)));

        var projection = ProgramSourceEditorProjection.Create(Read("""{"name":"read-only root","steps":[{"key":"x"}],"variables":[{"key":"x"}]}"""));
        var changed = Editor(projection);
        changed["name"] = "forbidden";
        var readOnly = Assert.ThrowsException<ProgramSourceException>(() => projection.ToCaw(Json(changed)));
        Assert.AreEqual(ProgramSourceEditorProjection.ReadOnlyCode, readOnly.Code);
        changed = Editor(projection);
        ((JArray)changed["variables"]!).Add(changed["variables"]![0]!.DeepClone());
        Unsupported(() => projection.ToCaw(Json(changed)));
        Unsupported(() => projection.ToCaw("{\"steps\":[],\"steps\":[]}"));
        Same(Read(projection.EditorJson), Editor(projection));
    }
}
