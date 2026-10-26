using Microsoft.VisualStudio.TestTools.UnitTesting;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using QuickerRpc.AgentModel.XAction.Source;

namespace QuickerRpc.Console.Test;

[TestClass]
public sealed class ProgramSourceVariableIdentityTests
{
    private const string Native = """
        {"Variables":[
          {"Id":"real-a","Key":"before","Type":0,"DefaultValue":"","Desc":null,"SaveState":false,
           "Future":{"number":0.123456789012345678901,"integer":9223372036854775807,"exp":1e999,"zero":-0}},
          {"Id":"real-b","Key":"other","Type":1,"FutureOther":{"keep":true}}
        ],"Steps":[]}
        """;

    [TestMethod]
    public void Canonical_and_yaml_source_keep_real_identity_without_silently_rewriting_its_alias()
    {
        foreach (var field in new[] { "id", "Id" })
        {
            var caw = JObject.Parse("""{"variables":[{"key":"value","varType":"text"}],"steps":[]}""");
            caw["variables"]![0]![field] = "source-real-id";
            var canonical = CawCanonicalizer.Canonicalize(caw);
            Assert.AreEqual("source-real-id", canonical["variables"]![0]!.Value<string>(field));
            Assert.IsNull(canonical["variables"]![0]![field == "id" ? "Id" : "id"]);
            var decoded = ProgramSourceCodec.Decode(ProgramSourceCodec.Encode(caw));
            Assert.AreEqual("source-real-id", decoded["variables"]![0]!.Value<string>(field));
            Assert.IsNull(decoded["variables"]![0]![field == "id" ? "Id" : "id"]);
            Assert.AreEqual("source-real-id", V1ProgramSourceCodec.ToNative(decoded)["Variables"]![0]!.Value<string>("Id"));
        }
    }

    [TestMethod]
    public void Real_identity_tracks_rename_and_reorder_without_losing_native_extensions_or_numeric_lexemes()
    {
        var native = LosslessProgramJson.ParseObject(Native);
        var baseline = V1ProgramSourceCodec.FromNative(native);
        Assert.AreEqual("real-a", baseline["variables"]![0]!.Value<string>("id"));
        var edited = ProgramSourceCodec.Decode(ProgramSourceCodec.Encode(baseline));
        var variables = (JArray)edited["variables"]!;
        var renamed = (JObject)variables[0]!.DeepClone();
        renamed["key"] = "renamed";
        renamed["desc"] = "edited";
        var other = variables[1]!.DeepClone();
        variables.Clear();
        variables.Add(other);
        variables.Add(renamed);

        var saved = V1ProgramSourceCodec.ToNative(edited, native, baseline);
        var expected = (JObject)native.DeepClone();
        var expectedVariable = (JObject)expected["Variables"]![0]!.DeepClone();
        expectedVariable["Key"] = "renamed";
        expectedVariable["Desc"] = "edited";
        expected["Variables"] = new JArray(expected["Variables"]![1]!.DeepClone(), expectedVariable);
        Assert.IsTrue(JToken.DeepEquals(expected, saved), saved.ToString());
        Assert.AreEqual(native["Variables"]![0]!["Future"]!.ToString(Formatting.None),
            saved["Variables"]![1]!["Future"]!.ToString(Formatting.None));
        Assert.IsNull(saved["Variables"]![1]!["id"]);

        var checkpoint = V1ProgramSourceCodec.NormalizeForSave(edited, baseline);
        var next = ProgramSourceCodec.Decode(ProgramSourceCodec.Encode(checkpoint));
        next["variables"]![1]!["desc"] = "second edit";
        var savedAgain = V1ProgramSourceCodec.ToNative(next, saved, checkpoint);
        Assert.AreEqual("real-a", savedAgain["Variables"]![1]!.Value<string>("Id"));
        Assert.AreEqual("renamed", savedAgain["Variables"]![1]!.Value<string>("Key"));
        Assert.AreEqual("second edit", savedAgain["Variables"]![1]!.Value<string>("Desc"));
        Assert.AreEqual(native["Variables"]![0]!["Future"]!.ToString(Formatting.None),
            savedAgain["Variables"]![1]!["Future"]!.ToString(Formatting.None));
    }

    [TestMethod]
    public void A_pre_identity_source_checkpoint_matches_the_real_native_id_by_its_original_key()
    {
        var native = LosslessProgramJson.ParseObject(Native);
        var legacy = V1ProgramSourceCodec.FromNative(native);
        foreach (var variable in legacy["variables"]!.OfType<JObject>()) variable.Remove("id");
        var edited = (JObject)legacy.DeepClone();
        edited["variables"]![0]!["id"] = "real-a";
        edited["variables"]![0]!["key"] = "renamed";
        var saved = V1ProgramSourceCodec.ToNative(edited, native, legacy);
        var expected = (JObject)native.DeepClone();
        expected["Variables"]![0]!["Key"] = "renamed";
        Assert.IsTrue(JToken.DeepEquals(expected, saved), saved.ToString());
    }

    [TestMethod]
    public void An_idless_source_edit_preserves_the_existing_native_identity_with_old_or_new_checkpoints()
    {
        foreach (var legacyCheckpoint in new[] { false, true })
        {
            var native = LosslessProgramJson.ParseObject(Native);
            var baseline = V1ProgramSourceCodec.FromNative(native);
            if (legacyCheckpoint)
                foreach (var variable in baseline["variables"]!.OfType<JObject>()) variable.Remove("id");
            var edited = (JObject)baseline.DeepClone();
            ((JObject)edited["variables"]![0]!).Remove("id");
            edited["variables"]![0]!["default"] = "edited default";
            var saved = V1ProgramSourceCodec.ToNative(edited, native, baseline);
            var expected = (JObject)native.DeepClone();
            expected["Variables"]![0]!["DefaultValue"] = "edited default";
            Assert.IsTrue(JToken.DeepEquals(expected, saved), saved.ToString());
        }
    }

    [TestMethod]
    public void A_real_source_id_is_not_discarded_based_on_its_editor_like_spelling()
    {
        // The editor projection, not this codec, knows which IDs it synthesized.
        var source = ProgramSourceCodec.Decode("variables:\n  - key: value\n    id: v-1\nsteps: []\n");
        var saved = V1ProgramSourceCodec.ToNative(source);
        Assert.AreEqual("v-1", saved["Variables"]![0]!.Value<string>("Id"));
    }

    [TestMethod]
    public void Conflicting_current_or_checkpoint_ids_cannot_overwrite_a_native_identity()
    {
        var native = LosslessProgramJson.ParseObject(Native);
        var baseline = V1ProgramSourceCodec.FromNative(native);
        var current = (JObject)baseline.DeepClone();
        current["variables"]![0]!["id"] = "replacement-id";
        AssertInvalid(() => V1ProgramSourceCodec.ToNative(current, native, baseline));

        var checkpoint = (JObject)baseline.DeepClone();
        checkpoint["variables"]![0]!["id"] = "replacement-id";
        // Even the no-op fast path must validate the supplied native/checkpoint identity pair.
        AssertInvalid(() => V1ProgramSourceCodec.ToNative(checkpoint, native, checkpoint));
    }

    [TestMethod]
    public void Duplicate_or_ambiguous_source_ids_and_non_string_identities_are_rejected()
    {
        foreach (var json in new[]
        {
            """{"variables":[{"key":"a","id":"same"},{"key":"b","id":"same"}],"steps":[]}""",
            """{"variables":[{"key":"a","id":"same","Id":"same"}],"steps":[]}""",
            """{"variables":[{"key":"a","id":"a","Id":"b"}],"steps":[]}""",
            """{"variables":[{"key":"a","id":9223372036854775807}],"steps":[]}""",
            """{"variables":[{"key":"a","Id":{"future":true}}],"steps":[]}""",
        })
        {
            var source = LosslessProgramJson.ParseObject(json);
            AssertInvalid(() => CawCanonicalizer.Canonicalize(source));
            AssertInvalid(() => V1ProgramSourceCodec.ToNative(source));
        }
    }

    [TestMethod]
    public void Duplicate_native_identities_are_rejected_even_with_an_old_idless_checkpoint()
    {
        var native = LosslessProgramJson.ParseObject(Native);
        var baseline = V1ProgramSourceCodec.FromNative(native);
        foreach (var variable in baseline["variables"]!.OfType<JObject>()) variable.Remove("id");
        native["Variables"]![1]!["Id"] = "real-a";
        AssertInvalid(() => V1ProgramSourceCodec.FromNative(native));
        AssertInvalid(() => V1ProgramSourceCodec.ToNative(baseline, native, baseline));
    }

    [TestMethod]
    public void Two_source_rows_cannot_reuse_one_native_row_through_id_and_key_matches()
    {
        var native = LosslessProgramJson.ParseObject(Native);
        var baseline = V1ProgramSourceCodec.FromNative(native);
        var current = (JObject)baseline.DeepClone();
        current["variables"]![0]!["key"] = "renamed";
        current["variables"]![1] = new JObject { ["key"] = "before", ["varType"] = "text" };
        AssertInvalid(() => V1ProgramSourceCodec.ToNative(current, native, baseline));
    }

    [TestMethod]
    public void An_idless_rename_cannot_silently_replace_an_identified_native_variable()
    {
        var native = LosslessProgramJson.ParseObject(Native);
        var baseline = V1ProgramSourceCodec.FromNative(native);
        var current = (JObject)baseline.DeepClone();
        ((JObject)current["variables"]![0]!).Remove("id");
        current["variables"]![0]!["key"] = "unproven rename";
        AssertInvalid(() => V1ProgramSourceCodec.ToNative(current, native, baseline));
    }

    [TestMethod]
    public void An_idless_addition_is_allowed_when_all_existing_identified_variables_are_retained()
    {
        var native = LosslessProgramJson.ParseObject(Native);
        var baseline = V1ProgramSourceCodec.FromNative(native);
        foreach (var variable in baseline["variables"]!.OfType<JObject>()) variable.Remove("id");
        var current = (JObject)baseline.DeepClone();
        ((JArray)current["variables"]!).Add(new JObject { ["key"] = "new value", ["varType"] = "text" });
        var saved = V1ProgramSourceCodec.ToNative(current, native, baseline);
        Assert.AreEqual("real-a", saved["Variables"]![0]!.Value<string>("Id"));
        Assert.AreEqual("real-b", saved["Variables"]![1]!.Value<string>("Id"));
        Assert.IsNull(saved["Variables"]![2]!["Id"]);
        Assert.AreEqual("new value", saved["Variables"]![2]!.Value<string>("Key"));
    }

    [TestMethod]
    public void Variable_identities_are_matched_within_their_own_program_scope()
    {
        var native = JObject.Parse("""{"Variables":[{"Id":"local","Key":"root","Type":0}],"Steps":[],"SubPrograms":[{"Id":"child","Name":"Child","Variables":[{"Id":"local","Key":"input","Type":0,"Future":true}],"Steps":[]}]}""");
        var baseline = V1ProgramSourceCodec.FromNative(native);
        var current = (JObject)baseline.DeepClone();
        current["subPrograms"]![0]!["variables"]![0]!["key"] = "renamed";
        var saved = V1ProgramSourceCodec.ToNative(current, native, baseline);
        Assert.AreEqual("root", saved["Variables"]![0]!.Value<string>("Key"));
        Assert.AreEqual("renamed", saved["SubPrograms"]![0]!["Variables"]![0]!.Value<string>("Key"));
        Assert.AreEqual("local", saved["SubPrograms"]![0]!["Variables"]![0]!.Value<string>("Id"));
        Assert.AreEqual(true, saved["SubPrograms"]![0]!["Variables"]![0]!.Value<bool>("Future"));
    }

    private static void AssertInvalid(Action action)
    {
        var error = Assert.ThrowsException<ProgramSourceException>(action);
        Assert.AreEqual(ProgramSourceCodes.CawInvalid, error.Code);
    }
}
