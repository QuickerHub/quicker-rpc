using Microsoft.VisualStudio.TestTools.UnitTesting;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using QuickerRpc.AgentModel.XAction.Source;
using System.Security.Cryptography;
using System.Text;

namespace QuickerRpc.Console.Test;

[TestClass]
public sealed class ProgramSourceVariableIdentityDescriptorTests
{
    [TestMethod]
    public void Real_source_ids_including_gui_shaped_ids_are_source_proof_without_implying_native_rename_proof()
    {
        foreach (var field in new[] { "id", "Id" })
        {
            var raw = Read("""{"variables":[{"key":"value","varType":"text"}],"steps":[]}""");
            raw["variables"]![0]![field] = "v-1";
            var projection = ProgramSourceEditorProjection.Create(raw);
            var row = Row(Describe(projection), "main", "v-1");

            Assert.AreEqual("source", row.Value<string>("provenance"));
            Assert.AreEqual("v-1", row.Value<string>("sourceId"));
            Assert.IsTrue(row.Value<bool>("sourceIdProven"));
            AssertNull(row, "nativeCheckpointId");
            Assert.IsFalse(row.Value<bool>("nativeCheckpointIdProven"));
            Assert.IsTrue(row.Value<bool>("ownedSurface"));
            Assert.IsFalse(row.Value<bool>("hasSyntheticAncestor"));
            AssertStable(row, true);
            AssertRenameDenied(row);
            AssertLocal(row, true, (JObject)raw["variables"]![0]!, "main", "value");
            Assert.AreEqual("unknown", row.Value<string>("nativeIdentity"));
            Same(raw, projection.ToCaw(projection.EditorJson));
        }
    }

    [TestMethod]
    public void Genuine_native_id_is_proof_even_when_its_spelling_looks_generated_and_source_has_no_id()
    {
        var native = Read("""{"Steps":[],"Variables":[{"Id":"v-1","Key":"value","Type":0,"Future":{"keep":null}}]}""");
        var checkpoint = V1ProgramSourceCodec.FromNative(native);
        var raw = Clone(checkpoint);
        ((JObject)raw["variables"]![0]!).Remove("id");
        var projection = ProgramSourceEditorProjection.Create(raw, checkpoint, native);
        var row = Row(Describe(projection), "main", "v-1");

        Assert.AreEqual("native-checkpoint", row.Value<string>("provenance"));
        AssertNull(row, "sourceId");
        Assert.IsFalse(row.Value<bool>("sourceIdProven"));
        Assert.AreEqual("v-1", row.Value<string>("nativeCheckpointId"));
        Assert.IsTrue(row.Value<bool>("nativeCheckpointIdProven"));
        Assert.AreEqual("checkpoint-proven", row.Value<string>("nativeIdentity"));
        AssertStable(row, true);
        AssertRenameProven(row, "native-id");
        AssertLocal(row, true, (JObject)raw["variables"]![0]!, "main", "value");
        Same(raw, projection.ToCaw(projection.EditorJson));
    }

    [TestMethod]
    public void Caw_checkpoint_bound_id_without_native_identity_remains_unknown()
    {
        var raw = Read("""{"variables":[{"key":"value","varType":"text"}],"steps":[]}""");
        var checkpoint = Clone(raw);
        checkpoint["variables"]![0]!["id"] = "checkpoint-only";
        var projection = ProgramSourceEditorProjection.Create(raw, checkpoint);
        var row = Row(Describe(projection), "main", "checkpoint-only");

        Assert.AreEqual("unknown", row.Value<string>("provenance"));
        AssertNull(row, "sourceId");
        AssertNull(row, "nativeCheckpointId");
        Assert.IsFalse(row.Value<bool>("sourceIdProven"));
        Assert.IsFalse(row.Value<bool>("nativeCheckpointIdProven"));
        Assert.AreEqual("unknown", row.Value<string>("nativeIdentity"));
        AssertStable(row, false, "unproven-variable-identity");
        AssertRenameDenied(row, "unproven-variable-identity");
    }

    [TestMethod]
    public void Generated_and_new_editor_ids_never_become_source_or_native_proof()
    {
        var raw = Read("""{"variables":[{"key":"existing","future":{"nil":null,"number":0.123456789012345678901,"integer":9223372036854775807,"exponent":1e999,"zero":-0}}],"steps":[]}""");
        var projection = ProgramSourceEditorProjection.Create(raw);
        var editor = Read(projection.EditorJson);
        var generatedId = editor["variables"]![0]!.Value<string>("id")!;
        ((JArray)editor["variables"]!).Add(Read("""{"id":"real-looking-client-id","key":"added","varType":"text"}"""));
        var descriptor = projection.DescribeVariableIdentities(Json(editor));
        AssertHashes(descriptor, Json(editor), projection.EditorJson);

        foreach (var id in new[] { generatedId, "real-looking-client-id" })
        {
            var row = Row(descriptor, "main", id);
            Assert.AreEqual("generated", row.Value<string>("provenance"));
            AssertNull(row, "sourceId");
            AssertNull(row, "nativeCheckpointId");
            Assert.IsFalse(row.Value<bool>("sourceIdProven"));
            Assert.IsFalse(row.Value<bool>("nativeCheckpointIdProven"));
            Assert.AreEqual("unknown", row.Value<string>("nativeIdentity"));
            AssertStable(row, false, "generated-editor-id");
            AssertRenameDenied(row, "generated-editor-id");
        }
        AssertLocal(Row(descriptor, "main", generatedId), true, (JObject)raw["variables"]![0]!, "main", "existing");
        var added = Row(descriptor, "main", "real-looking-client-id");
        AssertLocal(added, false);
        AssertNull(added, "sourceRowAnchor");
        var restored = projection.ToCaw(Json(editor));
        Assert.IsNull(restored["variables"]![0]!["id"]);
        Assert.IsNull(restored["variables"]![1]!["id"]);
    }

    [TestMethod]
    public void Absent_null_or_blank_source_ids_can_prove_the_original_local_row_but_not_native_identity()
    {
        foreach (var identity in new[] { "{}", "{\"id\":null}", "{\"Id\":\"   \"}" })
        {
            var variable = Read(identity);
            variable["key"] = "value";
            variable["future"] = Read("""{"nil":null,"number":1e999}""");
            var raw = new JObject { ["variables"] = new JArray(variable), ["steps"] = new JArray() };
            var projection = ProgramSourceEditorProjection.Create(raw);
            var editor = Read(projection.EditorJson);
            var id = editor["variables"]![0]!.Value<string>("id")!;
            var row = Row(Describe(projection), "main", id);

            Assert.AreEqual("generated", row.Value<string>("provenance"));
            Assert.AreEqual("unknown", row.Value<string>("nativeIdentity"));
            Assert.IsFalse(row.Value<bool>("sourceIdProven"));
            Assert.IsFalse(row.Value<bool>("nativeCheckpointIdProven"));
            AssertStable(row, false, "generated-editor-id");
            AssertRenameDenied(row, "generated-editor-id");
            AssertLocal(row, true, variable, "main", "value");
            Same(raw, projection.ToCaw(projection.EditorJson));
        }
    }

    [TestMethod]
    public void Detached_editor_text_and_rebased_edit_keep_the_original_raw_row_anchor_and_exact_text_hashes()
    {
        var raw = Read("""{"variables":[{"id":"source-real","key":"before","future":{"nil":null,"number":0.123456789012345678901,"exponent":1e999}}],"steps":[]}""");
        var projection = ProgramSourceEditorProjection.Create(raw);
        var edited = Read(projection.EditorJson);
        edited["variables"]![0]!["key"] = "after";
        edited["variables"]![0]!["desc"] = "current draft";
        // Formatting differences are valid JSON but remain part of the text binding.
        var baselineJson = "\n" + projection.EditorJson + "\n";
        var editorJson = Json(edited) + "\n\n";
        var descriptor = projection.DescribeVariableIdentities(editorJson, baselineJson);
        var row = Row(descriptor, "main", "source-real");

        AssertHashes(descriptor, editorJson, baselineJson);
        Assert.AreNotEqual(Hash(projection.EditorJson), descriptor.Value<string>("baselineEditorHash"));
        AssertLocal(row, true, (JObject)raw["variables"]![0]!, "main", "before");
        AssertStable(row, true);
        AssertRenameDenied(row);
        Assert.AreEqual("before", raw["variables"]![0]!.Value<string>("key"));
        Assert.AreEqual("after", projection.ToCaw(editorJson, baselineJson)["variables"]![0]!.Value<string>("key"));
    }

    [TestMethod]
    public void Source_id_added_only_to_current_source_does_not_prove_mapping_to_an_idless_native_row()
    {
        var native = Read("""{"Steps":[],"Variables":[{"Key":"existing","Type":0,"Future":{"keep":null}}]}""");
        var checkpoint = V1ProgramSourceCodec.FromNative(native);
        var raw = Clone(checkpoint);
        raw["variables"]![0]!["id"] = "source-real";
        var projection = ProgramSourceEditorProjection.Create(raw, checkpoint, native);
        var row = Row(Describe(projection), "main", "source-real");

        Assert.AreEqual("source", row.Value<string>("provenance"));
        Assert.IsTrue(row.Value<bool>("sourceIdProven"));
        AssertStable(row, true);
        AssertNull(row, "nativeCheckpointId");
        Assert.IsFalse(row.Value<bool>("nativeCheckpointIdProven"));
        Assert.AreEqual("unknown", row.Value<string>("nativeIdentity"));
        AssertRenameDenied(row, "native-mapping-unproven");
        AssertLocal(row, true, (JObject)raw["variables"]![0]!, "main", "existing");
        var renamed = Read(projection.EditorJson);
        renamed["variables"]![0]!["key"] = "renamed";
        Unsupported(() => projection.ToCaw(Json(renamed)));
    }

    [TestMethod]
    public void Checkpoint_source_identity_plus_original_native_key_proves_idless_native_rename_mapping()
    {
        var native = Read("""{"Steps":[],"Variables":[{"Key":"existing","Type":0,"Future":{"keep":null,"number":9223372036854775807}}]}""");
        var checkpoint = V1ProgramSourceCodec.FromNative(native);
        checkpoint["variables"]![0]!["id"] = "paired-source-real";
        var raw = Clone(checkpoint);
        var projection = ProgramSourceEditorProjection.Create(raw, checkpoint, native);
        var row = Row(Describe(projection), "main", "paired-source-real");

        Assert.AreEqual("source", row.Value<string>("provenance"));
        Assert.IsTrue(row.Value<bool>("sourceIdProven"));
        AssertNull(row, "nativeCheckpointId");
        Assert.IsFalse(row.Value<bool>("nativeCheckpointIdProven"));
        Assert.AreEqual("unknown", row.Value<string>("nativeIdentity"));
        AssertStable(row, true);
        AssertRenameProven(row, "checkpoint-source-id-and-native-key");
        AssertLocal(row, true, (JObject)raw["variables"]![0]!, "main", "existing");

        var edited = Read(projection.EditorJson);
        edited["variables"]![0]!["key"] = "renamed";
        var caw = projection.ToCaw(Json(edited));
        var saved = V1ProgramSourceCodec.ToNative(caw, native, checkpoint);
        Assert.AreEqual("paired-source-real", saved["Variables"]![0]!.Value<string>("Id"));
        Assert.AreEqual("renamed", saved["Variables"]![0]!.Value<string>("Key"));
        Same(native["Variables"]![0]!["Future"]!, saved["Variables"]![0]!["Future"]!);
    }

    [TestMethod]
    public void Native_real_identity_follows_a_unique_source_id_after_its_key_has_changed()
    {
        var native = Read("""{"Steps":[],"Variables":[{"Id":"native-real","Key":"before","Type":0}]}""");
        var checkpoint = V1ProgramSourceCodec.FromNative(native);
        var raw = Clone(checkpoint);
        raw["variables"]![0]!["key"] = "after";
        var projection = ProgramSourceEditorProjection.Create(raw, checkpoint, native);
        var row = Row(Describe(projection), "main", "native-real");

        Assert.AreEqual("source", row.Value<string>("provenance"));
        Assert.AreEqual("native-real", row.Value<string>("sourceId"));
        Assert.AreEqual("native-real", row.Value<string>("nativeCheckpointId"));
        Assert.IsTrue(row.Value<bool>("sourceIdProven"));
        Assert.IsTrue(row.Value<bool>("nativeCheckpointIdProven"));
        Assert.AreEqual("checkpoint-proven", row.Value<string>("nativeIdentity"));
        AssertStable(row, true);
        AssertRenameProven(row, "native-id");
        AssertLocal(row, true, (JObject)raw["variables"]![0]!, "main", "after");
    }

    [TestMethod]
    public void Same_real_variable_id_in_distinct_unique_owned_surfaces_is_not_a_global_collision()
    {
        var native = Read("""
            {"Variables":[{"Id":"shared","Key":"root","Type":0}],"Steps":[],"SubPrograms":[
              {"Id":"left","Name":"Left","Variables":[{"Id":"shared","Key":"local","Type":0}],"Steps":[]},
              {"Id":"right","Name":"Right","Variables":[{"Id":"shared","Key":"local","Type":0}],"Steps":[]}]}
            """);
        var raw = V1ProgramSourceCodec.FromNative(native);
        var projection = ProgramSourceEditorProjection.Create(raw, raw, native);
        var descriptor = Describe(projection);
        Assert.AreEqual(3, ((JArray)descriptor["variables"]!).Count);

        foreach (var surface in new[] { "main", "sub-left", "sub-right" })
        {
            var row = Row(descriptor, surface, "shared");
            Assert.IsTrue(row.Value<bool>("ownedSurface"));
            Assert.IsFalse(row.Value<bool>("hasSyntheticAncestor"));
            AssertStable(row, true);
            AssertRenameProven(row, "native-id");
            Assert.IsTrue(row.Value<bool>("documentLocalIdentityProven"));
            var ancestors = (JArray)row["ancestors"]!;
            Assert.AreEqual(surface == "main" ? 0 : 1, ancestors.Count);
            foreach (var ancestor in ancestors.OfType<JObject>())
            {
                Assert.AreEqual(surface, ancestor.Value<string>("surface"));
                Assert.AreEqual(surface[4..], ancestor.Value<string>("editorId"));
                Assert.AreEqual(surface[4..], ancestor.Value<string>("sourceId"));
                Assert.IsTrue(ancestor.Value<bool>("sourceIdProven"));
                Assert.IsTrue(ancestor.Value<bool>("owned"));
                Assert.IsFalse(ancestor.Value<bool>("synthetic"));
            }
        }
    }

    [TestMethod]
    public void Synthetic_ancestor_denies_identity_and_rename_even_for_a_real_nested_variable_id()
    {
        var raw = Read("""
            {"steps":[],"subPrograms":[{"name":"Outer","kind":1,"variables":[{"id":"outer-variable","key":"outer"}],
              "subPrograms":[{"id":"inner","name":"Inner","kind":1,"variables":[{"id":"inner-variable","key":"inner"}]}]}]}
            """);
        var projection = ProgramSourceEditorProjection.Create(raw);
        var editor = Read(projection.EditorJson);
        var outerId = editor["subPrograms"]![0]!.Value<string>("id")!;
        var descriptor = Describe(projection);
        foreach (var pair in new[] { ("sub-" + outerId, "outer-variable", 1), ("sub-inner", "inner-variable", 2) })
        {
            var row = Row(descriptor, pair.Item1, pair.Item2);
            Assert.AreEqual("source", row.Value<string>("provenance"));
            Assert.IsTrue(row.Value<bool>("sourceIdProven"));
            Assert.IsTrue(row.Value<bool>("ownedSurface"));
            Assert.IsTrue(row.Value<bool>("hasSyntheticAncestor"));
            AssertStable(row, false, "synthetic-surface-ancestor");
            AssertRenameDenied(row, "synthetic-surface-ancestor");
            AssertLocal(row, false);
            var ancestors = (JArray)row["ancestors"]!;
            Assert.AreEqual(pair.Item3, ancestors.Count);
            var outer = ancestors.OfType<JObject>().Single(a => a.Value<string>("editorId") == outerId);
            Assert.AreEqual("sub-" + outerId, outer.Value<string>("surface"));
            Assert.IsTrue(outer.Value<bool>("synthetic"));
            Assert.IsTrue(outer.Value<bool>("owned"));
            Assert.IsFalse(outer.Value<bool>("sourceIdProven"));
            AssertNull(outer, "sourceId");
        }
        Same(raw, projection.ToCaw(projection.EditorJson));
    }

    [TestMethod]
    public void Alias_duplicate_and_foreign_surfaces_cannot_receive_proven_identity_or_rename_authority()
    {
        foreach (var json in new[]
        {
            """{"variables":[{"key":"value","id":"real","Id":"real"}]}""",
            """{"variables":[{"key":"value","ID":"unrecognized-identity-alias"}]}""",
            """{"variables":[{"key":"first","id":"same"},{"key":"second","id":"same"}]}""",
            """{"subPrograms":[{"id":"foreign","kind":2,"variables":[{"id":"real","key":"value"}]}]}""",
            """{"subPrograms":[{"id":"foreign","kind":3,"variables":[{"id":"real","key":"value"}]}]}"""
        })
        {
            try
            {
                var projection = ProgramSourceEditorProjection.Create(Read(json));
                var rows = (JArray)Describe(projection)["variables"]!;
                Assert.IsTrue(rows.Count > 0, "An accepted variable surface must be described, not silently omitted.");
                foreach (var row in rows.OfType<JObject>())
                {
                    Assert.IsFalse(row.Value<bool>("sourceIdProven"));
                    Assert.IsFalse(row.Value<bool>("nativeCheckpointIdProven"));
                    AssertStable(row, false);
                    AssertRenameDenied(row);
                    AssertLocal(row, false);
                }
            }
            catch (ProgramSourceException ex)
            {
                Assert.AreEqual(ProgramSourceEditorProjection.UnsupportedCode, ex.Code);
            }
        }
    }

    [TestMethod]
    public void Rebased_native_bound_alias_preserves_provenance_but_does_not_prove_continuous_id_promotion()
    {
        var native = Read("""{"Steps":[],"Variables":[{"Id":"native-real","Key":"existing","Type":0,"Future":{"keep":null}}]}""");
        var checkpoint = V1ProgramSourceCodec.FromNative(native);
        var raw = Clone(checkpoint);
        ((JObject)raw["variables"]![0]!).Remove("id");
        var projection = ProgramSourceEditorProjection.Create(raw, checkpoint, native);
        var acknowledged = Read(projection.EditorJson);
        acknowledged["variables"]![0]!["id"] = "editor-session-alias";
        var acknowledgedJson = Json(acknowledged);
        // The complete ACK is a legal GUI-only alias of this exact raw source snapshot.
        Same(raw, projection.ToCaw(acknowledgedJson, acknowledgedJson));
        var descriptor = projection.DescribeVariableIdentities(acknowledgedJson, acknowledgedJson);
        AssertHashes(descriptor, acknowledgedJson, acknowledgedJson);
        var row = Row(descriptor, "main", "editor-session-alias");

        Assert.AreEqual("native-checkpoint", row.Value<string>("provenance"));
        AssertNull(row, "sourceId");
        Assert.IsFalse(row.Value<bool>("sourceIdProven"));
        Assert.AreEqual("native-real", row.Value<string>("nativeCheckpointId"));
        Assert.IsTrue(row.Value<bool>("nativeCheckpointIdProven"));
        Assert.AreEqual("checkpoint-proven", row.Value<string>("nativeIdentity"));
        AssertStable(row, true);
        AssertRenameDenied(row, "editor-id-promotion-continuity-unproven");
        // Full inverse validation proves this ACK alias maps to the original local row.
        // That local mapping does not prove a later native-ID promotion can keep the ACK ID.
        AssertLocal(row, true, (JObject)raw["variables"]![0]!, "main", "existing");

        // A rebased descriptor cannot consume the original request-local mapping.
        AssertRenameProven(Row(Describe(projection), "main", "native-real"), "native-id");
        Same(raw, projection.ToCaw(projection.EditorJson));
    }

    [TestMethod]
    public void Description_and_mutable_returned_trees_do_not_change_inputs_projection_or_future_mapping()
    {
        var native = Read("""
            {"Variables":[{"Id":"root-real","Key":"root","Type":0}],"Steps":[],"SubPrograms":[
              {"Id":"child","Name":"Child","Variables":[{"Id":"nested-real","Key":"local","Type":0}],"Steps":[]}]}
            """);
        var raw = V1ProgramSourceCodec.FromNative(native);
        raw["future"] = Read("""{"nil":null,"number":0.123456789012345678901,"integer":9223372036854775807,"exponent":1e999,"zero":-0}""");
        var checkpoint = Clone(raw);
        var expectedRaw = Json(raw);
        var expectedCheckpoint = Json(checkpoint);
        var expectedNative = Json(native);
        var projection = ProgramSourceEditorProjection.Create(raw, checkpoint, native);
        var expectedEditor = projection.EditorJson;
        var first = Describe(projection);
        var expectedDescriptor = Clone(first);
        var nested = Row(first, "sub-child", "nested-real");
        nested["sourceId"] = "forged";
        nested["nativeCheckpointIdProven"] = false;
        nested["ancestors"]![0]!["sourceId"] = "forged-parent";
        nested["sourceRowAnchor"]!["key"] = "forged-key";
        ((JArray)first["variables"]!).Clear();
        first["editorDocumentHash"] = "sha256:forged";
        first["forged"] = true;

        Same(expectedDescriptor, Describe(projection));
        Assert.AreEqual(expectedRaw, Json(raw));
        Assert.AreEqual(expectedCheckpoint, Json(checkpoint));
        Assert.AreEqual(expectedNative, Json(native));
        Assert.AreEqual(expectedEditor, projection.EditorJson);
        Same(raw, projection.ToCaw(projection.EditorJson));
        Same(raw, projection.ToCaw(projection.EditorJson, projection.EditorJson));
    }

    [TestMethod]
    public void Conflicting_duplicate_or_aliased_native_ids_cannot_fall_back_to_the_idless_checkpoint_bridge()
    {
        foreach (var nativeVariables in new[]
        {
            """[{"Id":"different-native","Key":"old","Type":0}]""",
            """[{"Id":"s","Key":"old","Type":0},{"Id":"s","Key":"other","Type":0}]""",
            """[{"Id":"s","ID":"unknown-alias","Key":"old","Type":0}]""",
            """[{"ID":"unknown-alias","Key":"old","Type":0}]""",
        })
        {
            var native = Read("{\"Variables\":" + nativeVariables + "}");
            var checkpoint = Read("""{"variables":[{"id":"s","key":"old"}]}""");
            var raw = Read("""{"variables":[{"id":"s","key":"new"}]}""");
            var projection = ProgramSourceEditorProjection.Create(raw, checkpoint, native);
            var row = Row(Describe(projection), "main", "s");
            Assert.IsTrue(row.Value<bool>("sourceIdProven"));
            Assert.IsFalse(row.Value<bool>("nativeCheckpointIdProven"), nativeVariables);
            Assert.AreEqual("unknown", row.Value<string>("nativeIdentity"));
            AssertRenameDenied(row, "native-mapping-unproven");
        }
    }

    [TestMethod]
    public void Unknown_source_key_alias_cannot_borrow_a_native_id_to_prove_local_edit_or_rename()
    {
        var raw = Read("""{"variables":[{"id":"s","key":"value","Key":"ambiguous"}]}""");
        var native = Read("""{"Variables":[{"Id":"s","Key":"value","Type":0}]}""");
        var projection = ProgramSourceEditorProjection.Create(raw, null, native);
        var row = Row(Describe(projection), "main", "s");
        Assert.IsTrue(row.Value<bool>("nativeCheckpointIdProven"));
        AssertLocal(row, false);
        AssertRenameDenied(row, "unproven-source-row");
        Same(raw, projection.ToCaw(projection.EditorJson));
    }

    private static JObject Describe(ProgramSourceEditorProjection projection)
    {
        var result = projection.DescribeVariableIdentities(projection.EditorJson);
        CollectionAssert.AreEquivalent(new[] { "variables", "editorDocumentHash", "baselineEditorHash" }, result.Properties().Select(p => p.Name).ToArray());
        Assert.IsInstanceOfType<JArray>(result["variables"]);
        AssertHashes(result, projection.EditorJson, projection.EditorJson);
        return result;
    }

    private static JObject Row(JObject descriptor, string surface, string id)
    {
        var row = ((JArray)descriptor["variables"]!).OfType<JObject>().Single(r => r.Value<string>("surface") == surface && r.Value<string>("editorId") == id);
        foreach (var field in new[] { "surface", "editorId", "provenance", "sourceId", "sourceIdProven", "nativeCheckpointId", "nativeCheckpointIdProven", "nativeIdentity", "ownedSurface", "hasSyntheticAncestor", "stableIdentityProven", "identityDenialReason", "ancestors", "renameMappingProven", "renameMappingDenialReason", "renameMappingBasis", "documentLocalIdentityProven", "documentLocalIdentityDenialReason", "sourceRowAnchor" })
            Assert.IsNotNull(row.Property(field), "Missing descriptor field: " + field);
        foreach (var field in new[] { "sourceIdProven", "nativeCheckpointIdProven", "ownedSurface", "hasSyntheticAncestor", "stableIdentityProven", "renameMappingProven", "documentLocalIdentityProven" })
            Assert.AreEqual(JTokenType.Boolean, row[field]!.Type, field);
        Assert.IsInstanceOfType<JArray>(row["ancestors"]);
        foreach (var ancestor in ((JArray)row["ancestors"]!).OfType<JObject>())
            foreach (var field in new[] { "surface", "editorId", "sourceId", "sourceIdProven", "synthetic", "owned" })
                Assert.IsNotNull(ancestor.Property(field), "Missing ancestor field: " + field);
        return row;
    }

    private static void AssertStable(JObject row, bool expected, string? denial = null)
    {
        Assert.AreEqual(expected, row.Value<bool>("stableIdentityProven"));
        if (expected) AssertNull(row, "identityDenialReason");
        else if (denial is not null) Assert.AreEqual(denial, row.Value<string>("identityDenialReason"));
        else Assert.IsFalse(string.IsNullOrWhiteSpace(row.Value<string>("identityDenialReason")));
    }

    private static void AssertRenameProven(JObject row, string basis)
    {
        Assert.IsTrue(row.Value<bool>("renameMappingProven"));
        AssertNull(row, "renameMappingDenialReason");
        Assert.AreEqual(basis, row.Value<string>("renameMappingBasis"));
    }

    private static void AssertRenameDenied(JObject row, string? denial = null)
    {
        Assert.IsFalse(row.Value<bool>("renameMappingProven"));
        Assert.AreEqual("unproven", row.Value<string>("renameMappingBasis"));
        if (denial is not null) Assert.AreEqual(denial, row.Value<string>("renameMappingDenialReason"));
        else Assert.IsFalse(string.IsNullOrWhiteSpace(row.Value<string>("renameMappingDenialReason")));
    }

    private static void AssertLocal(JObject row, bool expected, JObject? original = null, string? surface = null, string? key = null)
    {
        Assert.AreEqual(expected, row.Value<bool>("documentLocalIdentityProven"));
        if (expected) AssertNull(row, "documentLocalIdentityDenialReason");
        else Assert.IsFalse(string.IsNullOrWhiteSpace(row.Value<string>("documentLocalIdentityDenialReason")));
        if (original is null) return;
        var anchor = row["sourceRowAnchor"] as JObject;
        Assert.IsNotNull(anchor);
        CollectionAssert.AreEquivalent(new[] { "surface", "key", "rowHash" }, anchor.Properties().Select(p => p.Name).ToArray());
        Assert.AreEqual(surface, anchor.Value<string>("surface"));
        Assert.AreEqual(key, anchor.Value<string>("key"));
        Assert.AreEqual(Hash(Json(original)), anchor.Value<string>("rowHash"));
    }

    private static void AssertHashes(JObject descriptor, string editorJson, string baselineJson)
    {
        Assert.AreEqual(Hash(editorJson), descriptor.Value<string>("editorDocumentHash"));
        Assert.AreEqual(Hash(baselineJson), descriptor.Value<string>("baselineEditorHash"));
    }

    private static string Hash(string value) => "sha256:" + Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(value))).ToLowerInvariant();

    private static void AssertNull(JObject row, string field) => Assert.AreEqual(JTokenType.Null, row[field]!.Type, field);
    private static JObject Read(string json) => LosslessProgramJson.ParseObject(json);
    private static JObject Clone(JObject value) => (JObject)value.DeepClone();
    private static string Json(JObject value) => value.ToString(Formatting.None);
    private static void Same(JToken expected, JToken actual) => Assert.IsTrue(JToken.DeepEquals(expected, actual), "Expected: " + expected + "\nActual: " + actual);
    private static void Unsupported(Action operation)
    {
        var error = Assert.ThrowsException<ProgramSourceException>(operation);
        Assert.AreEqual(ProgramSourceEditorProjection.UnsupportedCode, error.Code);
    }
}
