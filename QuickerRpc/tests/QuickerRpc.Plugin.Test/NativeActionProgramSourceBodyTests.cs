using Microsoft.VisualStudio.TestTools.UnitTesting;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using QuickerRpc.Plugin.Services;

namespace QuickerRpc.Plugin.Test;

[TestClass]
public sealed class NativeActionProgramSourceBodyTests
{
    [DataTestMethod]
    [DataRow("2026-10-23T01:02:03.0000000+00:00")]
    [DataRow("2026-10-23T01:02:03.1234567+08:00")]
    [DataRow("2026-10-23T01:02:03.000Z")]
    public void Parse_preserves_timestamp_looking_parameter_strings(string value)
    {
        var json = new JObject
        {
            ["Steps"] = new JArray(new JObject
            {
                ["InputParams"] = new JObject { ["msg"] = new JObject { ["Value"] = value } },
            }),
            ["Variables"] = new JArray(),
        }.ToString(Formatting.None);

        var parsed = NativeActionProgramSourceBody.Parse(json);
        var literal = parsed["Steps"]![0]!["InputParams"]!["msg"]!["Value"]!;

        Assert.AreEqual(JTokenType.String, literal.Type);
        Assert.AreEqual(value, literal.Value<string>());
        Assert.AreEqual(json, parsed.ToString(Formatting.None));
    }

    [TestMethod]
    public void Merge_preserves_catalog_and_submitted_timestamp_strings_exactly()
    {
        const string catalogTimestamp = "2026-10-23T01:02:03.0000000+00:00";
        const string submittedTimestamp = "2026-10-23T01:02:03.1234567+08:00";
        var catalog = NativeActionProgramSourceBody.Parse("{\"futureRoot\":\"" + catalogTimestamp + "\",\"Steps\":[],\"Variables\":[]}");
        var source = NativeActionProgramSourceBody.Parse("{\"Steps\":[{\"InputParams\":{\"msg\":{\"Value\":\"" + submittedTimestamp + "\"}}}],\"Variables\":[]}");

        var savedJson = NativeActionProgramSourceBody.Merge(catalog, source);
        var saved = NativeActionProgramSourceBody.Parse(savedJson);

        Assert.AreEqual(catalogTimestamp, saved.Value<string>("futureRoot"));
        Assert.AreEqual(submittedTimestamp, saved["Steps"]![0]!["InputParams"]!["msg"]!.Value<string>("Value"));
    }

    [TestMethod]
    public void Merge_preserves_catalog_root_and_unknown_nested_program_fields()
    {
        var catalog = JObject.Parse("{\"Id\":\"original-id\",\"LimitSingleInstance\":true,\"futureRoot\":{\"x\":1},\"Steps\":[],\"Variables\":[],\"SubPrograms\":[{\"id\":\"embedded\"}]}");
        var source = JObject.Parse("{\"steps\":[{\"stepRunnerKey\":\"custom:future\",\"futureStep\":{\"null\":null,\"flag\":true}}],\"variables\":[{\"key\":\"v\",\"futureVariable\":42}],\"Id\":\"original-id\",\"futureRoot\":{\"x\":1}}");

        var merged = JObject.Parse(NativeActionProgramSourceBody.Merge(catalog, source));

        Assert.AreEqual("original-id", merged.Value<string>("Id"));
        Assert.AreEqual(true, merged.Value<bool>("LimitSingleInstance"));
        Assert.IsTrue(JToken.DeepEquals(catalog["futureRoot"], merged["futureRoot"]));
        Assert.IsTrue(JToken.DeepEquals(source["steps"], merged["Steps"]));
        Assert.IsTrue(JToken.DeepEquals(source["variables"], merged["Variables"]));
        Assert.IsTrue(JToken.DeepEquals(catalog["SubPrograms"], merged["SubPrograms"]));
        Assert.IsNull(merged["steps"]);
        Assert.AreEqual(0, ((JArray)catalog["Steps"]!).Count);
    }

    [TestMethod]
    public void Merge_rejects_root_identity_and_metadata_changes()
    {
        var catalog = JObject.Parse("{\"id\":\"original\",\"metadata\":{\"title\":\"original\"},\"steps\":[],\"variables\":[]}");
        foreach (var change in new[] { "\"Id\":\"another-action\"", "\"metadata\":{\"title\":\"changed\"}", "\"newMetadata\":true" })
        {
            var source = JObject.Parse("{\"steps\":[],\"variables\":[]," + change + "}");
            Assert.ThrowsException<System.InvalidOperationException>(() => NativeActionProgramSourceBody.Merge(catalog, source));
        }
    }

    [TestMethod]
    public void Merge_can_explicitly_clear_embedded_subprograms_and_keeps_future_fields()
    {
        var catalog = JObject.Parse("{\"steps\":[],\"variables\":[],\"subPrograms\":[{\"id\":\"old\"}]}");
        var source = JObject.Parse("{\"steps\":[],\"variables\":[],\"subPrograms\":[{\"id\":\"new\",\"future\":{\"nested\":true}}]}");
        var merged = JObject.Parse(NativeActionProgramSourceBody.Merge(catalog, source));
        Assert.IsTrue(JToken.DeepEquals(source["subPrograms"], merged["subPrograms"]));

        source["subPrograms"] = new JArray();
        merged = JObject.Parse(NativeActionProgramSourceBody.Merge(catalog, source));
        Assert.AreEqual(0, ((JArray)merged["subPrograms"]!).Count);
    }

    [TestMethod]
    public void Merge_rejects_case_ambiguous_program_fields_and_invalid_arrays()
    {
        var catalog = JObject.Parse("{\"steps\":[],\"variables\":[]}");
        foreach (var invalid in new[] { "{\"steps\":[],\"Steps\":[],\"variables\":[]}", "{\"steps\":[],\"variables\":[] ,\"subPrograms\":null}" })
        {
            Assert.ThrowsException<JsonException>(() => NativeActionProgramSourceBody.Merge(catalog, JObject.Parse(invalid)));
        }
    }
}
