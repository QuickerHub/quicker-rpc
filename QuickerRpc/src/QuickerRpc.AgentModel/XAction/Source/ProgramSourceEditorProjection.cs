using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace QuickerRpc.AgentModel.XAction.Source;

/// <summary>
/// A request-local, reversible view of decoded CAW for the existing GUI document controller.
/// Recreate it from the same source snapshot on save; never accept a client-supplied identity map.
/// This boundary neither parses YAML nor materializes file references or compiles native programs.
/// </summary>
public sealed class ProgramSourceEditorProjection
{
    public const string UnsupportedCode = "SOURCE_DOCUMENT_UNSUPPORTED";
    public const string ReadOnlyCode = "SOURCE_DOCUMENT_READ_ONLY";
    private readonly JObject source;
    private readonly JObject editor;
    private readonly JObject? baselineCaw;
    private readonly JObject? baselineNative;
    private readonly Dictionary<string, StepIdentity> stepIdentities = new(StringComparer.Ordinal);
    private readonly Dictionary<string, ProgramIdentity> programs = new(StringComparer.Ordinal);
    private readonly HashSet<string> usedSteps = new(StringComparer.Ordinal);
    private readonly HashSet<string> usedPrograms = new(StringComparer.Ordinal);
    private readonly ProgramIdentity root;
    private int stepSequence = 1, programSequence = 1;

    private ProgramSourceEditorProjection(JObject raw, JObject? baselineCaw, JObject? baselineNative)
    {
        source = CopyJson(raw);
        this.baselineCaw = (JObject?)baselineCaw?.DeepClone();
        this.baselineNative = (JObject?)baselineNative?.DeepClone();
        CollectIds(source);
        editor = (JObject)source.DeepClone();
        root = ProjectProgram(editor, baselineCaw, baselineNative);
        // An unsupported representation must fail on inspect, before an editor can change it.
        if (!JToken.DeepEquals(source, Restore((JObject)editor.DeepClone())))
            throw Unsupported("The CAW body cannot be projected without changing its JSON values.");
        EditorJson = editor.ToString(Formatting.Indented) + "\n";
    }

    public string EditorJson { get; }

    public static ProgramSourceEditorProjection Create(JObject rawDecodedCaw, JObject? baselineCaw = null, JObject? baselineNative = null)
    {
        if (rawDecodedCaw is null) throw new ArgumentNullException(nameof(rawDecodedCaw));
        try { return new ProgramSourceEditorProjection(rawDecodedCaw, baselineCaw, baselineNative); }
        catch (ProgramSourceException ex) when (ex.Code != UnsupportedCode) { throw Unsupported(ex.Message); }
        catch (JsonException ex) { throw Unsupported(ex.Message); }
    }

    public JObject ToCaw(string editorJson, string? baselineDocumentJson = null)
    {
        try
        {
            if (baselineDocumentJson is not null)
            {
                var rebased = new ProgramSourceEditorProjection(source, baselineCaw, baselineNative);
                rebased.Rebase(LosslessProgramJson.ParseObject(baselineDocumentJson));
                return rebased.ToCaw(editorJson);
            }
            var current = LosslessProgramJson.ParseObject(editorJson);
            var bodyFields = new HashSet<string>(new[] { "steps", "variables", "subPrograms" }, StringComparer.Ordinal);
            foreach (var key in editor.Properties().Select(p => p.Name).Concat(current.Properties().Select(p => p.Name)).Distinct(StringComparer.Ordinal))
                if (!bodyFields.Contains(key) && !JToken.DeepEquals(editor[key], current[key]))
                    throw new ProgramSourceException(ReadOnlyCode, "Root identity and metadata are read-only: " + key);
            return Restore(current);
        }
        catch (ProgramSourceException ex) when (ex.Code != UnsupportedCode && ex.Code != ReadOnlyCode) { throw Unsupported(ex.Message); }
        catch (JsonException ex) { throw Unsupported(ex.Message); }
    }

    /// <summary>Describe private projection evidence for this exact document, without granting an edit.</summary>
    public JObject DescribeVariableIdentities(string editorJson, string? baselineDocumentJson = null)
    {
        // Rebase a fresh map: callers cannot consume identities or mutate future save behavior.
        var view = new ProgramSourceEditorProjection(source, baselineCaw, baselineNative);
        if (baselineDocumentJson is not null) view.Rebase(LosslessProgramJson.ParseObject(baselineDocumentJson));
        _ = view.ToCaw(editorJson);
        var rows = new JArray();
        Walk(LosslessProgramJson.ParseObject(editorJson), view.root, "main", new JArray(), true, true);
        return new JObject { ["variables"] = rows, ["editorDocumentHash"] = IdentityHash(editorJson),
            ["baselineEditorHash"] = IdentityHash(baselineDocumentJson ?? view.EditorJson) };

        void Walk(JObject program, ProgramIdentity? identity, string surface, JArray ancestors, bool owned, bool nativeScope)
        {
            var evidence = identity?.Variables.Values.ToDictionary(row => row, row => VariableEvidence(identity, row));
            var claims = evidence?.Values.Where(value => value.NativeId.Length > 0).GroupBy(value => value.NativeId, StringComparer.Ordinal)
                .ToDictionary(group => group.Key, group => group.Count(), StringComparer.Ordinal);
            var syntheticAncestor = ancestors.OfType<JObject>().Any(row => row.Value<bool>("synthetic"));
            var unknownAncestor = ancestors.OfType<JObject>().Any(row => !row.Value<bool>("owned") || !row.Value<bool>("sourceIdProven"));
            foreach (var variable in Items(program, "variables"))
            {
                var editorId = RequiredString(variable, "id");
                VariableIdentity? original = null;
                identity?.Variables.TryGetValue(editorId, out original);
                var sourceId = ProvenId(original?.Original);
                var fact = original is not null ? evidence![original] : new IdentityEvidence();
                var nativeProven = nativeScope && fact.NativeId.Length > 0 && fact.NativeUnique
                    && claims![fact.NativeId] == 1;
                var provenance = sourceId.Length > 0 ? "source" : nativeProven ? "native-checkpoint"
                    : original is null || (original.Generated && IdentityShapeKnown(original.Original)) ? "generated" : "unknown";
                string? denied = !owned ? "unowned-surface" : syntheticAncestor ? "synthetic-surface-ancestor"
                    : unknownAncestor ? "unproven-surface-ancestor" : original is not null && !IdentityShapeKnown(original.Original) ? "unproven-variable-identity"
                    : provenance == "generated" ? "generated-editor-id"
                    : provenance == "unknown" ? "unproven-variable-identity" : null;
                var renameDenied = denied;
                string? localDenied = !owned ? "unowned-surface" : syntheticAncestor ? "synthetic-surface-ancestor"
                    : unknownAncestor ? "unproven-surface-ancestor" : original is null || !IdentityShapeKnown(original.Original) || !SourceKeyKnown(original.Original)
                    ? "unproven-source-row" : null;
                var basis = "unproven";
                if (renameDenied is null)
                {
                    if (localDenied is not null) renameDenied = localDenied;
                    else if (!nativeScope) renameDenied = "native-surface-unproven";
                    else if (nativeProven)
                    {
                        // A promoted native ID must still be expressible by the exact save ACK.
                        if (sourceId.Length == 0 && editorId != fact.NativeId) renameDenied = "editor-id-promotion-continuity-unproven";
                        else basis = "native-id";
                    }
                    else if (fact.CheckpointPaired && sourceId.Length > 0) basis = "checkpoint-source-id-and-native-key";
                    else renameDenied = "native-mapping-unproven";
                }
                rows.Add(new JObject
                {
                    ["surface"] = surface, ["editorId"] = editorId, ["provenance"] = provenance,
                    ["sourceId"] = sourceId.Length == 0 ? JValue.CreateNull() : new JValue(sourceId), ["sourceIdProven"] = sourceId.Length > 0,
                    ["nativeCheckpointId"] = fact.NativeId.Length == 0 ? JValue.CreateNull() : new JValue(fact.NativeId),
                    ["nativeCheckpointIdProven"] = nativeProven, ["nativeIdentity"] = nativeProven ? "checkpoint-proven" : "unknown", ["ownedSurface"] = owned,
                    ["hasSyntheticAncestor"] = syntheticAncestor, ["stableIdentityProven"] = denied is null,
                    ["identityDenialReason"] = denied is null ? JValue.CreateNull() : new JValue(denied),
                    ["ancestors"] = ancestors.DeepClone(), ["renameMappingProven"] = renameDenied is null,
                    ["renameMappingDenialReason"] = renameDenied is null ? JValue.CreateNull() : new JValue(renameDenied),
                    ["renameMappingBasis"] = basis,
                    ["documentLocalIdentityProven"] = localDenied is null,
                    ["documentLocalIdentityDenialReason"] = localDenied is null ? JValue.CreateNull() : new JValue(localDenied),
                    ["sourceRowAnchor"] = original is null ? JValue.CreateNull() : new JObject
                    { ["surface"] = surface, ["key"] = original.Key, ["rowHash"] = IdentityHash(original.Original.ToString(Formatting.None)) },
                });
            }
            foreach (var sub in Items(program, "subPrograms"))
            {
                var id = RequiredString(sub, "id");
                view.programs.TryGetValue(id, out var child);
                var sourceId = ProvenId(child?.Original);
                var childOwned = owned && child is not null && OwnedKind(child.Original)
                    && !child.Original.Properties().Any(p => string.Equals(p.Name, "kind", StringComparison.OrdinalIgnoreCase) && p.Name != "kind");
                var childSurface = "sub-" + id;
                var chain = (JArray)ancestors.DeepClone();
                chain.Add(new JObject { ["surface"] = childSurface, ["editorId"] = id,
                    ["sourceId"] = sourceId.Length == 0 ? JValue.CreateNull() : new JValue(sourceId),
                    ["sourceIdProven"] = sourceId.Length > 0, ["synthetic"] = child is null || child.SyntheticId, ["owned"] = childOwned });
                var nativeChild = child?.BaselineNative;
                Walk(sub, child, childSurface, chain, childOwned, nativeScope && childOwned && sourceId.Length > 0
                    && sourceId == ProvenId(nativeChild) && OwnedKind(nativeChild));
            }
        }
    }

    private static IdentityEvidence VariableEvidence(ProgramIdentity identity, VariableIdentity variable)
    {
        var native = EvidenceRows(identity.BaselineNative, "Variables", "variables");
        var checkpoint = EvidenceRows(identity.BaselineCaw, "variables", "Variables");
        var sourceId = ProvenId(variable.Original);
        var wantedId = sourceId.Length > 0 ? sourceId : variable.BoundId;
        var checkpointRow = wantedId.Length == 0 ? null : Unique(checkpoint.Where(row => ProvenId(row) == wantedId));
        var nativeRow = wantedId.Length == 0 ? null : Unique(native.Where(row => ProvenId(row) == wantedId));
        nativeRow ??= Unique(native.Where(row => EvidenceKey(row) == variable.Key));
        if (nativeRow is null && sourceId.Length > 0 && checkpointRow is not null)
            nativeRow = Unique(native.Where(row => EvidenceKey(row) == EvidenceKey(checkpointRow)));
        var id = ProvenId(nativeRow);
        var consistent = (sourceId.Length == 0 || id.Length == 0 || sourceId == id)
            && (checkpointRow is null || nativeRow is null || EvidenceKey(checkpointRow) == EvidenceKey(nativeRow));
        return new IdentityEvidence
        {
            NativeId = id,
            NativeUnique = consistent && id.Length > 0 && native.Count(row => ProvenId(row) == id) == 1 && nativeRow is not null
                && EvidenceKey(nativeRow).Length > 0 && native.Count(row => EvidenceKey(row) == EvidenceKey(nativeRow)) == 1,
            // A failed real native-ID proof must never downgrade into the idless key bridge.
            CheckpointPaired = consistent && id.Length == 0 && sourceId.Length > 0 && checkpointRow is not null && nativeRow is not null
                && IdentityShapeKnown(nativeRow)
                && ProvenId(checkpointRow) == sourceId && EvidenceKey(checkpointRow).Length > 0
                && EvidenceKey(checkpointRow) == EvidenceKey(nativeRow)
                && checkpoint.Count(row => ProvenId(row) == sourceId) == 1
                && checkpoint.Count(row => EvidenceKey(row) == EvidenceKey(checkpointRow)) == 1
                && native.Count(row => EvidenceKey(row) == EvidenceKey(nativeRow)) == 1,
        };
    }

    private static JObject[] EvidenceRows(JObject? program, string first, string second)
    {
        if (program is null || program.Properties().Count(p => string.Equals(p.Name, first, StringComparison.OrdinalIgnoreCase)) != 1)
            return Array.Empty<JObject>();
        var array = program[first] as JArray ?? program[second] as JArray;
        return array is null || array.Any(row => row is not JObject) ? Array.Empty<JObject>() : array.Cast<JObject>().ToArray();
    }

    private static JObject? Unique(IEnumerable<JObject> rows)
    {
        var matches = rows.Take(2).ToArray();
        return matches.Length == 1 ? matches[0] : null;
    }

    private static bool IdentityShapeKnown(JObject value)
    {
        var fields = value.Properties().Where(p => string.Equals(p.Name, "id", StringComparison.OrdinalIgnoreCase)).ToArray();
        return fields.Length == 0 || (fields.Length == 1 && fields[0].Name is ("id" or "Id")
            && (fields[0].Value.Type == JTokenType.Null || (fields[0].Value.Type == JTokenType.String
                && (string.IsNullOrWhiteSpace(fields[0].Value.Value<string>()) || ProvenId(value).Length > 0))));
    }
    private static bool SourceKeyKnown(JObject value)
    {
        var fields = value.Properties().Where(p => string.Equals(p.Name, "key", StringComparison.OrdinalIgnoreCase)).ToArray();
        return fields.Length == 1 && fields[0].Name == "key" && fields[0].Value.Type == JTokenType.String
            && !string.IsNullOrWhiteSpace(fields[0].Value.Value<string>()) && fields[0].Value.Value<string>() == fields[0].Value.Value<string>()!.Trim();
    }
    private static string IdentityHash(string value)
    {
        using var sha = SHA256.Create();
        return "sha256:" + BitConverter.ToString(sha.ComputeHash(Encoding.UTF8.GetBytes(value))).Replace("-", "").ToLowerInvariant();
    }
    private static string ProvenId(JObject? value)
    {
        var fields = value?.Properties().Where(p => string.Equals(p.Name, "id", StringComparison.OrdinalIgnoreCase)).ToArray();
        if (fields is not { Length: 1 } || fields[0].Name is not ("id" or "Id") || fields[0].Value.Type != JTokenType.String) return "";
        var id = fields[0].Value.Value<string>()!;
        return id.Length > 0 && id == id.Trim() ? id : "";
    }

    private static string EvidenceKey(JObject value)
    {
        var fields = value.Properties().Where(p => string.Equals(p.Name, "key", StringComparison.OrdinalIgnoreCase)).ToArray();
        return fields.Length == 1 && fields[0].Name is ("key" or "Key") && fields[0].Value.Type == JTokenType.String ? fields[0].Value.Value<string>()! : "";
    }

    private static bool OwnedKind(JObject? value)
    {
        if (value is null) return false;
        var fields = value.Properties().Where(p => string.Equals(p.Name, "kind", StringComparison.OrdinalIgnoreCase)).ToArray();
        return fields.Length == 0 || (fields.Length == 1 && fields[0].Name is ("kind" or "Kind")
            && fields[0].Value.Type == JTokenType.Integer && fields[0].Value.Value<int>() == 1);
    }

    private void Rebase(JObject baseline)
    {
        var rebasedSteps = new Dictionary<string, StepIdentity>(StringComparer.Ordinal);
        var rebasedPrograms = new Dictionary<string, ProgramIdentity>(StringComparer.Ordinal);
        WalkProgram(editor, baseline, root);
        stepIdentities.Clear();
        foreach (var pair in rebasedSteps) stepIdentities.Add(pair.Key, pair.Value);
        programs.Clear();
        foreach (var pair in rebasedPrograms) programs.Add(pair.Key, pair.Value);
        // A baseline can supply editor-only identities, never omit source data or change its revision.
        if (!JToken.DeepEquals(source, Restore((JObject)baseline.DeepClone())))
            throw Unsupported("The baseline editor document does not represent the complete current CAW snapshot.");

        void WalkProgram(JObject expected, JObject proposed, ProgramIdentity identity)
        {
            var expectedVariables = Items(expected, "variables");
            var proposedVariables = Items(proposed, "variables");
            if (expectedVariables.Length != proposedVariables.Length) throw Unsupported("Baseline variable collection differs from the current source.");
            var variables = new Dictionary<string, VariableIdentity>(StringComparer.Ordinal);
            for (var i = 0; i < expectedVariables.Length; i++)
            {
                var previous = identity.Variables[RequiredString(expectedVariables[i], "id")];
                var id = RequiredString(proposedVariables[i], "id");
                var realId = SourceVariableId(previous.Original);
                if ((realId.Length > 0 && id != realId) || variables.ContainsKey(id))
                    throw Unsupported("Baseline variable identities are ambiguous or change a real source id.");
                variables.Add(id, previous);
                expectedVariables[i]["id"] = id;
            }
            identity.Variables.Clear();
            foreach (var pair in variables) identity.Variables.Add(pair.Key, pair.Value);
            WalkSteps(Items(expected, "steps"), Items(proposed, "steps"));
            var expectedSubs = Items(expected, "subPrograms");
            var proposedSubs = Items(proposed, "subPrograms");
            if (expectedSubs.Length != proposedSubs.Length) throw Unsupported("Baseline subprogram collection differs from the current source.");
            for (var i = 0; i < expectedSubs.Length; i++)
            {
                var previousId = RequiredString(expectedSubs[i], "id");
                var previous = programs[previousId];
                var id = RequiredString(proposedSubs[i], "id");
                if ((!previous.SyntheticId && id != previousId) || rebasedPrograms.ContainsKey(id))
                    throw Unsupported("Baseline subprogram identities are ambiguous or change a real source id.");
                rebasedPrograms.Add(id, previous);
                expectedSubs[i]["id"] = id;
                WalkProgram(expectedSubs[i], proposedSubs[i], previous);
            }
        }

        void WalkSteps(JObject[] expected, JObject[] proposed)
        {
            if (expected.Length != proposed.Length) throw Unsupported("Baseline step collection differs from the current source.");
            for (var i = 0; i < expected.Length; i++)
            {
                var previousId = RequiredString(expected[i], "stepId");
                var previous = stepIdentities[previousId];
                var id = RequiredString(proposed[i], "stepId");
                if ((!previous.Synthetic && id != previousId) || rebasedSteps.ContainsKey(id))
                    throw Unsupported("Baseline step identities are ambiguous or change a real source id.");
                rebasedSteps.Add(id, previous);
                expected[i]["stepId"] = id;
                WalkSteps(Items(expected[i], "ifSteps"), Items(proposed[i], "ifSteps"));
                WalkSteps(Items(expected[i], "elseSteps"), Items(proposed[i], "elseSteps"));
            }
        }
    }

    private ProgramIdentity ProjectProgram(JObject program, JObject? baselineCaw, JObject? baselineNative)
    {
        var identity = new ProgramIdentity(program, baselineCaw, baselineNative);
        int variableSequence = 1;
        var keys = new HashSet<string>(StringComparer.Ordinal);
        var variableIds = new HashSet<string>(StringComparer.Ordinal);
        foreach (var variable in Items(program, "variables"))
        {
            var id = SourceVariableId(variable);
            if (id.Length > 0 && !variableIds.Add(id)) throw Unsupported("Duplicate source variable id: " + id);
        }
        foreach (var variable in Items(program, "variables"))
        {
            RequireEditableVariableDefault(variable);
            var key = RequiredString(variable, "key");
            if (!keys.Add(key)) throw Unsupported("Duplicate variable key: " + key);
            var nativeId = FindNativeVariableId(baselineNative, key);
            var id = SourceVariableId(variable);
            var boundId = nativeId.Length > 0 ? nativeId : FindCheckpointVariableId(baselineCaw, key, id);
            if (id.Length > 0 && boundId.Length > 0 && id != boundId) throw Unsupported("Source variable identity conflicts with the matching baseline: " + key);
            if (id.Length == 0 && boundId.Length > 0 && variableIds.Add(boundId)) id = boundId;
            var generated = id.Length == 0;
            if (generated)
                do { id = "v-" + variableSequence++; } while (!variableIds.Add(id));
            var row = new VariableIdentity(key, variable, boundId, generated);
            identity.Variables.Add(id, row);
            variable.Remove("Id");
            variable["id"] = id;
            // The GUI reads varType, while the source codec also accepts legacy numeric type.
            if (variable.Property("varType") is null && variable["type"] is { } legacyType)
                variable["varType"] = legacyType.DeepClone();
        }
        foreach (var step in Items(program, "steps")) ProjectStep(step);
        foreach (var sub in Items(program, "subPrograms"))
        {
            if (sub["kind"] is { } kind && (kind.Type != JTokenType.Integer || kind.Value<int>() != 1))
                throw Unsupported("Only embedded subprogram bodies can be projected as owned editor documents.");
            var originalId = sub.Property("id")?.Value.DeepClone();
            var oldCaw = FindSubProgram(baselineCaw, sub);
            var oldNative = FindSubProgram(baselineNative, oldCaw ?? sub);
            var id = OptionalId(sub, "id");
            if (id.Length == 0)
            {
                do { id = "qkrpc-editor-sub-" + programSequence++; } while (!usedPrograms.Add(id));
                sub["id"] = id;
            }
            var child = ProjectProgram(sub, oldCaw, oldNative);
            RestoreProperty(child.Original, "id", originalId);
            child.OriginalId = originalId;
            child.SyntheticId = originalId is null || originalId.Type == JTokenType.Null
                || (originalId.Type == JTokenType.String && string.IsNullOrWhiteSpace(originalId.Value<string>()));
            programs.Add(id, child);
        }
        return identity;
    }

    private void ProjectStep(JObject step)
    {
        RequireSourceAliases(step);
        RequiredString(step, "key");
        var oldId = step.Property("stepId")?.Value.DeepClone();
        var id = OptionalId(step, "stepId");
        bool synthetic = id.Length == 0;
        if (synthetic)
        {
            do { id = "s-" + stepSequence++; } while (!usedSteps.Add(id));
            step["stepId"] = id;
        }
        stepIdentities.Add(id, new StepIdentity(oldId, synthetic, step));
        if (ProgramSourceSubProgramStepSugar.HasElevatedTarget(step) && !ProgramSourceSubProgramIoFold.IsSubProgramStep(step))
            throw Unsupported("A subprogram target on a different runner cannot be projected.");
        if (step.Property("subProgram") is not null && step.Property("subProgram.var") is not null)
            throw Unsupported("A subprogram call cannot have both literal and variable targets.");
        if (ProgramSourceSubProgramIoFold.IsSubProgramStep(step))
        {
            ProgramSourceSubProgramIoFold.ExpandBareKeysToVarPrefixInPlace(step);
            ProgramSourceSubProgramStepSugar.InjectModuleTargetIntoInputParams(step);
            step.Remove("subProgram");
            step.Remove("subProgram.var");
        }
        if (OptionalMap(step, "inputs") is { } inputs) ConvertInputStrings(inputs, toEditor: true);
        RequireStringOutputs(OptionalMap(step, "outputs"));
        Move(step, "key", "stepRunnerKey");
        Move(step, "inputs", "inputParams");
        Move(step, "outputs", "outputParams");
        foreach (var child in Items(step, "ifSteps")) ProjectStep(child);
        foreach (var child in Items(step, "elseSteps")) ProjectStep(child);
    }

    private JObject Restore(JObject current)
    {
        var seenSteps = new HashSet<string>(StringComparer.Ordinal);
        var seenPrograms = new HashSet<string>(StringComparer.Ordinal);
        var restoredSteps = new List<KeyValuePair<JObject, StepIdentity>>();
        RestoreProgram(current, root, seenSteps, seenPrograms, restoredSteps);
        ProgramSourceSubProgramIoFold.MigrateToBareKeysInPlace(current);
        foreach (var row in restoredSteps)
        {
            foreach (var name in new[] { "inputs", "outputs" }) RemoveAbsentDefault(row.Key, row.Value.Original, name, IsEmptyMap);
            foreach (var name in new[] { "ifSteps", "elseSteps" }) RemoveAbsentDefault(row.Key, row.Value.Original, name, token => token is JArray { Count: 0 });
            foreach (var name in new[] { "disabled", "collapsed" }) RemoveAbsentDefault(row.Key, row.Value.Original, name, IsFalse);
            RemoveAbsentDefault(row.Key, row.Value.Original, "note", IsEmptyString);
            RemoveAbsentDefault(row.Key, row.Value.Original, "delayMs", IsZero);
        }
        return current;
    }

    private void RestoreProgram(JObject program, ProgramIdentity? identity, HashSet<string> seenSteps, HashSet<string> seenPrograms,
        List<KeyValuePair<JObject, StepIdentity>> restoredSteps)
    {
        var variables = Items(program, "variables");
        var ids = new HashSet<string>(StringComparer.Ordinal);
        var keys = new HashSet<string>(StringComparer.Ordinal);
        bool added = false;
        foreach (var variable in variables)
        {
            RequireEditableVariableDefault(variable);
            var id = RequiredString(variable, "id");
            var key = RequiredString(variable, "key");
            if (!ids.Add(id) || !keys.Add(key)) throw Unsupported("Duplicate editor variable identity or key.");
            if (variable.Property("Id") is not null) throw Unsupported("Editor variables use id, not a native Id alias.");
            VariableIdentity? previous = null;
            identity?.Variables.TryGetValue(id, out previous);
            if (previous is not null)
            {
                if (key != previous.Key && identity!.ProtectedKeys.Contains(previous.Key)
                    && previous.BoundId.Length == 0)
                    throw Unsupported("Renaming a baseline variable cannot preserve its native identity and unknown metadata: " + previous.Key);
                if (previous.Original.Property("varType") is null && previous.Original["type"] is { } oldType)
                {
                    if (JToken.DeepEquals(variable["varType"], oldType)) variable.Remove("varType");
                    else variable.Remove("type");
                }
            }
            else
            {
                added = true;
                if (identity is not null && identity.Variables.Values.Any(row => row.Key == key))
                    throw Unsupported("Changing an existing variable's editor identity is ambiguous: " + key);
            }
            variable.Remove("id");
            if (previous is not null)
            {
                var sourceId = previous.Original.Property("id") ?? previous.Original.Property("Id");
                if (sourceId is not null) variable[sourceId.Name] = sourceId.Value.DeepClone();
                // Promote only an identity already paired by native/checkpoint data, never a GUI id.
                if (key != previous.Key && SourceVariableId(previous.Original).Length == 0 && previous.BoundId.Length > 0)
                    variable["id"] = previous.BoundId;
                foreach (var name in new[] { "isLocked", "saveState", "isInput", "isOutput" }) RemoveAbsentDefault(variable, previous.Original, name, IsFalse);
                foreach (var name in new[] { "desc", "paramName", "group", "customType" }) RemoveAbsentDefault(variable, previous.Original, name, IsEmptyString);
                foreach (var name in new[] { "inputParamInfo", "outputParamInfo", "tableDef" }) RemoveAbsentDefault(variable, previous.Original, name, IsEmptyMap);
                // The GUI wire omits text type; canonical decoded CAW makes it explicit.
                if (IsTextType(previous.Original["varType"]) && (variable.Property("varType") is null || IsTextType(variable["varType"])))
                    variable["varType"] = previous.Original["varType"]!.DeepClone();
            }
        }
        if (added && identity is not null && identity.Variables.Any(pair => !ids.Contains(pair.Key) && identity.ProtectedKeys.Contains(pair.Value.Key)))
            throw Unsupported("Replacing baseline variable identities while adding variables is ambiguous; preserve their editor ids.");
        foreach (var step in Items(program, "steps")) RestoreStep(step, seenSteps, restoredSteps);
        foreach (var sub in Items(program, "subPrograms"))
        {
            var id = RequiredString(sub, "id");
            if (!seenPrograms.Add(id)) throw Unsupported("Duplicate editor subprogram id: " + id);
            programs.TryGetValue(id, out var child);
            RestoreProgram(sub, child, seenSteps, seenPrograms, restoredSteps);
            if (child?.SyntheticId == true) RestoreProperty(sub, "id", child.OriginalId);
        }
        if (identity is not null)
            foreach (var name in new[] { "steps", "variables", "subPrograms" })
                if (identity.Original.Property(name) is null && program[name] is JArray { Count: 0 }) program.Remove(name);
    }

    private void RestoreStep(JObject step, HashSet<string> seen, List<KeyValuePair<JObject, StepIdentity>> restoredSteps)
    {
        var id = RequiredString(step, "stepId");
        if (!seen.Add(id)) throw Unsupported("Duplicate editor stepId: " + id);
        if (step.Property("key") is not null || step.Property("inputs") is not null || step.Property("outputs") is not null)
            throw Unsupported("Editor steps must use unambiguous stepRunnerKey/inputParams/outputParams fields.");
        RequiredString(step, "stepRunnerKey");
        if (step.Property("subProgram") is not null || step.Property("subProgram.var") is not null)
            throw Unsupported("Editor subprogram targets belong in inputParams.");
        if (OptionalMap(step, "inputParams") is { } inputs) ConvertInputStrings(inputs, toEditor: false);
        RequireStringOutputs(OptionalMap(step, "outputParams"));
        Move(step, "stepRunnerKey", "key");
        Move(step, "inputParams", "inputs");
        Move(step, "outputParams", "outputs");
        foreach (var child in Items(step, "ifSteps")) RestoreStep(child, seen, restoredSteps);
        foreach (var child in Items(step, "elseSteps")) RestoreStep(child, seen, restoredSteps);
        if (stepIdentities.TryGetValue(id, out var previous))
        {
            restoredSteps.Add(new KeyValuePair<JObject, StepIdentity>(step, previous));
            if (previous.Synthetic) RestoreProperty(step, "stepId", previous.OriginalId);
        }
    }

    private void CollectIds(JObject program)
    {
        foreach (var step in AllStepsInBody(program))
        {
            var id = OptionalId(step, "stepId");
            if (id.Length > 0 && !usedSteps.Add(id)) throw Unsupported("Duplicate source stepId: " + id);
        }
        foreach (var sub in Items(program, "subPrograms"))
        {
            var id = OptionalId(sub, "id");
            if (id.Length > 0 && !usedPrograms.Add(id)) throw Unsupported("Duplicate source subprogram id: " + id);
            CollectIds(sub);
        }
    }

    private static void ConvertInputStrings(JObject map, bool toEditor)
    {
        var result = new JObject();
        var bases = new HashSet<string>(StringComparer.Ordinal);
        foreach (var property in map.Properties())
        {
            string name = property.Name;
            if (property.Value.Type != JTokenType.String)
                throw Unsupported("The GUI cannot losslessly display a non-string input literal or binding: " + name);
            var basis = InputBase(name);
            if (!bases.Add(basis)) throw Unsupported("Mixed input bindings: " + basis);
            if (name != basis && !name.EndsWith(".var", StringComparison.Ordinal) && !name.EndsWith(".file", StringComparison.Ordinal))
                throw Unsupported("Case-variant binding suffixes cannot be mapped losslessly: " + name);
            var value = property.Value.DeepClone();
            if (name == basis && value.Type == JTokenType.String)
            {
                var text = value.Value<string>()!;
                if (toEditor)
                {
                    if (IsTyped(text, "@value:") || IsTypedNonempty(text, "@var:") || IsTypedNonempty(text, "@file:")) value = new JValue("@value:" + text);
                }
                else if (IsTyped(text, "@value:")) value = new JValue(text.Substring(7));
                else if (IsTypedNonempty(text, "@var:")) { name += ".var"; value = new JValue(text.Substring(5).Trim()); }
                else if (IsTypedNonempty(text, "@file:")) { name += ".file"; value = new JValue(text.Substring(6).Trim().Replace('\\', '/')); }
            }
            if (result.Property(name) is not null) throw Unsupported("Input binding relocation collides: " + name);
            result.Add(name, value);
        }
        map.RemoveAll();
        foreach (var property in result.Properties().ToArray()) map.Add(property.Name, property.Value);
    }

    private static bool IsTyped(string text, string prefix) => text.StartsWith(prefix, StringComparison.OrdinalIgnoreCase);
    private static bool IsTypedNonempty(string text, string prefix) => IsTyped(text, prefix) && text.Substring(prefix.Length).Trim().Length > 0;
    private static string InputBase(string name) => name.EndsWith(".var", StringComparison.OrdinalIgnoreCase) ? name.Substring(0, name.Length - 4)
        : name.EndsWith(".file", StringComparison.OrdinalIgnoreCase) ? name.Substring(0, name.Length - 5) : name;

    private static IEnumerable<JObject> AllStepsInBody(JObject program)
    {
        return Walk(Items(program, "steps"));
        static IEnumerable<JObject> Walk(IEnumerable<JObject> rows)
        {
            foreach (var step in rows)
            {
                yield return step;
                foreach (var child in Walk(Items(step, "ifSteps").Concat(Items(step, "elseSteps")))) yield return child;
            }
        }
    }

    private static JObject[] Items(JObject parent, string name)
    {
        if (parent.Property(name) is null) return Array.Empty<JObject>();
        if (parent[name] is not JArray array || array.Any(row => row is not JObject)) throw Unsupported(name + " must contain only objects.");
        return array.Cast<JObject>().ToArray();
    }

    private static JObject? OptionalMap(JObject parent, string name)
    {
        if (parent.Property(name) is null) return null;
        return parent[name] as JObject ?? throw Unsupported(name + " must be an object.");
    }

    private static string RequiredString(JObject parent, string name) => parent[name]?.Type == JTokenType.String
        && !string.IsNullOrWhiteSpace(parent.Value<string>(name)) ? parent.Value<string>(name)! : throw Unsupported(name + " must be a nonempty string.");
    private static string OptionalId(JObject parent, string name)
    {
        var value = parent[name];
        if (value is null || value.Type == JTokenType.Null) return "";
        if (value.Type != JTokenType.String) throw Unsupported(name + " must be a string.");
        return string.IsNullOrWhiteSpace(value.Value<string>()) ? "" : value.Value<string>()!;
    }

    private static void Move(JObject value, string from, string to)
    {
        if (value.Property(to) is not null) throw Unsupported("Conflicting field aliases: " + from + "/" + to);
        if (value.Property(from) is not { } property) return;
        value[to] = property.Value.DeepClone();
        property.Remove();
    }

    private static void RequireSourceAliases(JObject step)
    {
        foreach (var name in new[] { "stepRunnerKey", "StepRunnerKey", "Key", "inputParams", "InputParams", "Inputs", "outputParams", "OutputParams", "Outputs", "IfSteps", "ElseSteps" })
            if (step.Property(name) is not null) throw Unsupported("Expected decoded CAW rather than ambiguous native aliases: " + name);
    }

    private static JObject? FindSubProgram(JObject? program, JObject wanted)
    {
        var rows = program?["subPrograms"] as JArray ?? program?["SubPrograms"] as JArray;
        if (rows is null) return null;
        var id = wanted.Value<string>("id");
        var name = wanted.Value<string>("name");
        var matches = rows.OfType<JObject>().Where(row => !string.IsNullOrWhiteSpace(id)
            ? string.Equals(row.Value<string>("id") ?? row.Value<string>("Id"), id, StringComparison.OrdinalIgnoreCase)
            : name is not null && string.Equals(row.Value<string>("name") ?? row.Value<string>("Name"), name, StringComparison.Ordinal)).Take(2).ToArray();
        return matches.Length == 1 ? matches[0] : null;
    }

    private static string SourceVariableId(JObject variable)
    {
        if (variable.Property("id") is not null && variable.Property("Id") is not null)
            throw Unsupported("A source variable cannot have both id and Id.");
        return OptionalId(variable, variable.Property("Id") is null ? "id" : "Id");
    }

    private static string FindNativeVariableId(JObject? program, string key)
    {
        var matches = (program?["Variables"] as JArray ?? program?["variables"] as JArray ?? new JArray())
            .OfType<JObject>().Where(row => (row.Value<string>("Key") ?? row.Value<string>("key")) == key).Take(2).ToArray();
        if (matches.Length > 1) throw Unsupported("Ambiguous baseline native variable key: " + key);
        return matches.Length == 0 ? "" : SourceVariableId(matches[0]);
    }

    private static string FindCheckpointVariableId(JObject? program, string key, string sourceId)
    {
        var rows = (program?["variables"] as JArray ?? new JArray()).OfType<JObject>().ToArray();
        var byId = sourceId.Length == 0 ? Array.Empty<JObject>() : rows.Where(row => SourceVariableId(row) == sourceId).Take(2).ToArray();
        if (byId.Length > 1) throw Unsupported("Ambiguous checkpoint variable identity: " + sourceId);
        if (byId.Length == 1) return sourceId;
        var byKey = rows.Where(row => row.Value<string>("key") == key).Take(2).ToArray();
        if (byKey.Length > 1) throw Unsupported("Ambiguous checkpoint variable key: " + key);
        return byKey.Length == 0 ? "" : SourceVariableId(byKey[0]);
    }

    private static void RequireEditableVariableDefault(JObject variable)
    {
        foreach (var name in new[] { "default", "default.file" })
            if (variable[name] is { } value && value.Type != JTokenType.String)
                throw Unsupported("The GUI cannot losslessly display a non-string variable " + name + ".");
        if (variable.Property("default") is not null && variable.Property("default.file") is not null)
            throw Unsupported("A variable cannot combine inline and file defaults.");
        // These are GUI legacy aliases, not canonical decoded CAW default fields.
        foreach (var name in new[] { "defaultValue", "defaultValue.file", "defaultValueFile", "default_value", "DefaultValue" })
            if (variable.Property(name) is not null) throw Unsupported("Ambiguous GUI variable default alias: " + name);
    }

    private static void RequireStringOutputs(JObject? outputs)
    {
        if (outputs is not null && outputs.Properties().Any(property => property.Value.Type != JTokenType.String))
            throw Unsupported("GUI output bindings must be variable-key strings.");
    }

    private static void RestoreProperty(JObject parent, string name, JToken? value)
    {
        if (value is null) parent.Remove(name); else parent[name] = value.DeepClone();
    }

    // Only known GUI defaults at their structural owner may stand for source absence.
    // Do not canonicalize the whole baseline: unknown nulls/empty maps/numbers are evidence.
    private static void RemoveAbsentDefault(JObject current, JObject original, string name, Func<JToken, bool> isDefault)
    {
        if (original.Property(name) is null && current[name] is { } value && isDefault(value)) current.Remove(name);
    }
    private static bool IsEmptyMap(JToken value) => value is JObject { Count: 0 };
    private static bool IsEmptyString(JToken value) => value.Type == JTokenType.String && value.Value<string>() == "";
    private static bool IsZero(JToken value) => (value.Type == JTokenType.Integer || value.Type == JTokenType.Float) && value.Value<double>() == 0;
    private static bool IsFalse(JToken value) => (value.Type == JTokenType.Boolean && !value.Value<bool>()) || (value.Type == JTokenType.Integer && IsZero(value));
    private static bool IsTextType(JToken? value) => value is not null && ((value.Type == JTokenType.String
        && string.Equals(value.Value<string>()?.Trim(), "text", StringComparison.OrdinalIgnoreCase))
        || (value.Type == JTokenType.Integer && IsZero(value)));

    private static JObject CopyJson(JObject value) => LosslessProgramJson.ParseObject(value.ToString(Formatting.None));
    private static ProgramSourceException Unsupported(string message) => new(UnsupportedCode, message);
    private sealed class VariableIdentity
    {
        public VariableIdentity(string key, JObject original, string boundId, bool generated) { Key = key; Original = (JObject)original.DeepClone(); BoundId = boundId; Generated = generated; }
        public string Key { get; }
        public JObject Original { get; }
        public string BoundId { get; }
        public bool Generated { get; }
    }
    private sealed class ProgramIdentity
    {
        public ProgramIdentity(JObject original, JObject? baselineCaw, JObject? baselineNative)
        {
            Original = (JObject)original.DeepClone();
            BaselineCaw = (JObject?)baselineCaw?.DeepClone();
            BaselineNative = (JObject?)baselineNative?.DeepClone();
            foreach (var baseline in new[] { baselineCaw, baselineNative })
                foreach (var variable in (baseline?["variables"] as JArray ?? baseline?["Variables"] as JArray ?? new JArray()).OfType<JObject>())
                    if ((variable.Value<string>("key") ?? variable.Value<string>("Key")) is { } key) ProtectedKeys.Add(key);
        }
        public JObject Original { get; }
        public JObject? BaselineCaw { get; }
        public JObject? BaselineNative { get; }
        public Dictionary<string, VariableIdentity> Variables { get; } = new(StringComparer.Ordinal);
        public HashSet<string> ProtectedKeys { get; } = new(StringComparer.Ordinal);
        public JToken? OriginalId { get; set; }
        public bool SyntheticId { get; set; }
    }
    private sealed class StepIdentity
    {
        public StepIdentity(JToken? id, bool synthetic, JObject original) { OriginalId = id; Synthetic = synthetic; Original = (JObject)original.DeepClone(); }
        public JToken? OriginalId { get; }
        public bool Synthetic { get; }
        public JObject Original { get; }
    }
    private sealed class IdentityEvidence
    {
        public string NativeId { get; set; } = "";
        public bool NativeUnique { get; set; }
        public bool CheckpointPaired { get; set; }
    }
}
