using Microsoft.VisualStudio.TestTools.UnitTesting;
using QuickerRpc.AgentModel.Catalog;
using QuickerRpc.Contracts.Rpc;
using QuickerRpc.Runtime;

namespace QuickerRpc.Runtime.Test;

[TestClass]
public sealed class StepRunnerInputContractBuilderTests
{
    [TestMethod]
    public void Confirmed_zero_false_and_raw_mode_one_survive_without_web_normalization()
    {
        var zero = Read(Input("text", new NativeInput()));
        Assert.IsTrue(zero.PolicyKnown); Assert.AreEqual(0, zero.VarType); Assert.AreEqual(0, zero.VariableMode);
        Assert.AreEqual(false, zero.AllowInput); Assert.AreEqual(false, zero.IsControlField);
        Assert.AreEqual("allowed", zero.LiteralPolicy); Assert.AreEqual("none", zero.LiteralValueRestriction);
        var one = Read(Input("text", new NativeInput { VariableMode = Mode.Input }));
        Assert.AreEqual(1, one.VariableMode, "The old web UI maps Text Input=1 to mode0; this port preserves native mode1.");
        Assert.AreEqual("allowed", one.LiteralPolicy);
    }

    [TestMethod]
    public void Native_existing_value_modes_are_conditions_not_a_name_based_blanket_ban()
    {
        foreach (var pair in new[] { (Mode.UseVar, "existing-literal-only"), (Mode.UseVarOnly, "existing-nonempty-literal-only") })
        {
            var row = Read(Input("text", new NativeInput { VariableMode = pair.Item1 }));
            Assert.AreEqual(pair.Item2, row.LiteralPolicy);
            Assert.AreEqual("none", row.LiteralValueRestriction);
            Assert.IsNull(row.BlockedReason);
        }
    }

    [TestMethod]
    public void AllowInput_only_limits_enum_selection_and_known_sources_are_orthogonal()
    {
        var fixedEnum = new NativeInput { Type = NativeType.Enum, VariableMode = Mode.Input, SelectionItems = new[] { new Option("one"), new Option("two") } };
        var row = Read(Input("choice", fixedEnum));
        Assert.AreEqual("allowed", row.LiteralPolicy); Assert.AreEqual("options", row.LiteralValueRestriction);
        CollectionAssert.AreEqual(new[] { "one", "two" }, row.Options.ToArray());
        fixedEnum.AllowInput = true;
        Assert.AreEqual("none", Read(Input("choice", fixedEnum)).LiteralValueRestriction);
        var declared = new ModernInput { VariableMode = Mode.UseVarOnly, InputSources = Sources.FixedOption, SelectionItems = new[] { new Option("old"), new Option("next") } };
        row = Read(Input("text", declared));
        Assert.AreEqual("existing-nonempty-literal-only", row.LiteralPolicy);
        Assert.AreEqual("options", row.LiteralValueRestriction);
        declared.InputSources = Sources.Literal | Sources.Variable;
        Assert.AreEqual("none", Read(Input("text", declared)).LiteralValueRestriction);
        declared.InputSources = Sources.Variable;
        Assert.AreEqual("never", Read(Input("text", declared)).LiteralPolicy);
        declared.InputSources = (Sources)128;
        row = Read(Input("text", declared));
        Assert.IsFalse(row.PolicyKnown); Assert.AreEqual("unknown", row.LiteralPolicy);
    }

    [TestMethod]
    public void Real_default_control_is_applied_while_omitted_unknown_default_is_never_first_option()
    {
        var control = new NativeInput { Type = NativeType.Enum, IsControlField = true, DefaultValue = "popup",
            SelectionItems = new[] { new Option("first"), new Option("popup") } };
        var body = new NativeInput { ValidForList = new[] { "popup" } };
        var catalog = Catalog(Input("operation", control), Input("text", body));
        var contract = Build(catalog).Contract!;
        Assert.IsTrue(contract.VisibilityResolved); Assert.AreEqual("operation", contract.ControlFieldKey);
        Assert.AreEqual("popup", contract.AppliedControlFieldValue); Assert.AreEqual("allowed", contract.Inputs[1].LiteralPolicy);
        Assert.AreEqual("never", contract.Inputs[0].LiteralPolicy);
        control.DefaultValue = null;
        catalog = Catalog(Input("operation", control), Input("text", body));
        contract = Build(catalog).Contract!;
        Assert.AreEqual("operation", contract.ControlFieldKey); Assert.IsNull(contract.AppliedControlFieldValue);
        Assert.IsFalse(contract.VisibilityResolved); Assert.AreEqual("unknown", contract.Inputs[1].LiteralPolicy);
        contract = Build(catalog, "popup").Contract!;
        Assert.IsTrue(contract.VisibilityResolved); Assert.IsTrue(contract.Inputs[1].Visible);
        Assert.AreEqual("INVALID_CONTROL_FIELD_VALUE", Build(catalog, "not-a-native-option").ErrorCode);
    }

    [TestMethod]
    public void Proven_empty_default_is_distinct_from_unknown_and_values_are_not_casefolded_or_trimmed()
    {
        var control = new NativeInput { Type = NativeType.Enum, IsControlField = true, DefaultValue = "", SelectionItems = new[] { new Option(""), new Option("KeepCase ") } };
        var catalog = Catalog(Input("operation", control), Input("text", new NativeInput()));
        Assert.AreEqual("", Build(catalog).Contract!.AppliedControlFieldValue);
        Assert.AreEqual("KeepCase ", Build(catalog, "KeepCase ").Contract!.AppliedControlFieldValue);
        Assert.AreEqual("keepcase ", Build(catalog, "keepcase ").Contract!.AppliedControlFieldValue, "Native option matching ignores case, while the response preserves the actual control literal.");
        Assert.AreEqual("INVALID_CONTROL_FIELD_VALUE", Build(catalog, "keepcase").ErrorCode);
    }

    [TestMethod]
    public void Unknown_visibility_and_structured_rules_never_inherit_ui_fail_open()
    {
        foreach (var native in new NativeInput[] {
            new() { VisibleExpression = "arbitrary > 0" },
            new ModernInput { VisibleWhen = new object() },
            new() { ValidForList = new[] { "popup" }, InvalidForList = new[] { "hide" } },
        })
        {
            var row = Read(Input("text", native));
            Assert.IsFalse(row.VisibilityResolved); Assert.AreEqual("unknown", row.LiteralPolicy);
            Assert.IsNotNull(row.BlockedReason);
        }
    }

    [TestMethod]
    public void A_visibility_list_owned_by_another_fixed_option_input_cannot_borrow_the_control_value()
    {
        var other = new NativeInput { Type = NativeType.Enum, SelectionItems = new[] { new Option("popup") } };
        var control = new NativeInput { Type = NativeType.Enum, IsControlField = true, DefaultValue = "popup",
            SelectionItems = new[] { new Option("popup"), new Option("other") } };
        var target = new NativeInput { ValidForList = new[] { "popup" } };
        var contract = Build(Catalog(Input("otherChoice", other), Input("operation", control), Input("text", target))).Contract!;
        Assert.IsFalse(contract.Inputs[2].VisibilityResolved);
        Assert.AreEqual("unknown", contract.Inputs[2].LiteralPolicy);
        StringAssert.Contains(contract.Inputs[2].BlockedReason!, "otherChoice");
        Assert.IsFalse(contract.VisibilityResolved);
    }

    [TestMethod]
    public void Explicit_empty_valid_list_is_hidden_and_is_not_the_same_as_no_rule()
    {
        var hidden = Read(Input("text", new NativeInput { ValidForList = Array.Empty<string>() }));
        Assert.IsTrue(hidden.VisibilityResolved);
        Assert.IsFalse(hidden.Visible);
        Assert.AreEqual("never", hidden.LiteralPolicy);
        var normal = Read(Input("text", new NativeInput { ValidForList = null }));
        Assert.IsTrue(normal.Visible);
        Assert.AreEqual("allowed", normal.LiteralPolicy);
    }

    [TestMethod]
    public void Even_simple_visibility_expressions_require_native_typed_context_not_a_string_regex()
    {
        var control = new NativeInput { Type = NativeType.Enum, IsControlField = true, DefaultValue = "popup", SelectionItems = new[] { new Option("popup") } };
        var dependent = new NativeInput { VisibleExpression = "operation=='popup'" };
        var contract = Build(Catalog(Input("operation", control), Input("text", dependent))).Contract!;
        Assert.IsFalse(contract.Inputs[1].VisibilityResolved);
        Assert.AreEqual("unknown", contract.Inputs[1].LiteralPolicy);
    }

    [TestMethod]
    public void Multioperation_membership_does_not_become_unconditional_visibility_from_empty_legacy_rules()
    {
        var catalog = Catalog(Input("xpath", new NativeInput()));
        catalog.Items[0].InputContractVisibilityUnknownReason =
            StepRunnerNativeInputPolicy.CaptureRunnerVisibilityUnknownReason(new NativeMultiOperation());
        var row = Build(catalog).Contract!.Inputs[0];
        Assert.IsTrue(row.PolicyKnown);
        Assert.IsFalse(row.VisibilityResolved);
        Assert.AreEqual("unknown", row.LiteralPolicy);
        Assert.AreEqual("NATIVE_OPERATION_MEMBERSHIP_REQUIRES_CONTEXT", row.BlockedReason);
    }

    [TestMethod]
    public void Default_control_primitives_use_the_proven_native_invariant_literal_conversion()
    {
        foreach (var pair in new (object Value, string Literal)[] { (0, "0"), (false, "false"), (Mode.Input, "Input") })
        {
            var control = new NativeInput { Type = NativeType.Enum, IsControlField = true, DefaultValue = pair.Value,
                SelectionItems = new[] { new Option(pair.Literal) } };
            Assert.AreEqual(pair.Literal, Build(Catalog(Input("operation", control))).Contract!.AppliedControlFieldValue);
        }
    }

    [TestMethod]
    public void Unknown_missing_or_throwing_native_facts_keep_keys_nulls_and_blocked_reasons()
    {
        foreach (var input in new[] {
            Input("missing", new { Type = NativeType.Text, VariableMode = Mode.UseVarOrInput, IsControlField = false }),
            Input("throwing", new ThrowingInput()),
            new StepRunnerInputParamDef { Key = "supplemental" },
        })
        {
            var row = Read(input);
            Assert.AreEqual(input.Key, row.Key); Assert.IsFalse(row.PolicyKnown);
            Assert.AreEqual("unknown", row.LiteralPolicy); Assert.AreEqual("unknown", row.LiteralValueRestriction);
            Assert.IsNotNull(row.BlockedReason);
            Assert.IsNull(row.AllowInput);
        }
    }

    [TestMethod]
    public void Unrecognized_special_editor_and_empty_fixed_options_are_explicitly_unavailable()
    {
        var row = Read(Input("text", new ModernInput { EditorHint = Hint.CaptureToolbar }));
        Assert.AreEqual("unknown", row.LiteralPolicy);
        row = Read(Input("texttools", new NativeInput()));
        Assert.AreEqual("unknown", row.LiteralPolicy);
        row = Read(Input("choice", new NativeInput { Type = NativeType.Enum, VariableMode = Mode.Input }));
        Assert.AreEqual("never", row.LiteralPolicy); Assert.AreEqual("NATIVE_FIXED_OPTIONS_EMPTY", row.BlockedReason);
    }

    [TestMethod]
    public void Duplicate_input_or_runner_keys_fail_instead_of_selecting_an_ambiguous_definition()
    {
        var catalog = Catalog(Input("same", new NativeInput()), Input("SAME", new NativeInput()));
        Assert.AreEqual("INPUT_CONTRACT_AMBIGUOUS", Build(catalog).ErrorCode);
        catalog = Catalog(Input("text", new NativeInput())); catalog.Items.Add(catalog.Items[0]);
        Assert.AreEqual("INPUT_CONTRACT_AMBIGUOUS", Build(catalog).ErrorCode);
    }

    [TestMethod]
    public void Legacy_compressed_schema_is_byte_identical_with_native_facts_present()
    {
        var item = Input("text", new NativeInput());
        var catalog = Catalog(item);
        var before = StepRunnerAgentSchemaJson.Serialize(StepRunnerCatalogMapper.GetDetail(catalog, "sys:fixture").Schema!);
        item.NativeInputPolicy = null;
        var after = StepRunnerAgentSchemaJson.Serialize(StepRunnerCatalogMapper.GetDetail(catalog, "sys:fixture").Schema!);
        Assert.AreEqual(before, after);
        Assert.IsFalse(after.Contains("nativeInputPolicy")); Assert.IsFalse(after.Contains("literalPolicy"));
    }

    private static StepRunnerInputParamDef Input(string key, object native) => new() { Key = key, NativeInputPolicy = StepRunnerNativeInputPolicy.Capture(native) };
    private static StepRunnerCatalog Catalog(params StepRunnerInputParamDef[] inputs) => new() { Items = new List<StepRunnerDefinition> { new() { Key = "sys:fixture", InputParamDefs = inputs.ToList() } } };
    private static QuickerRpcStepRunnerInputContractResult Build(StepRunnerCatalog catalog, string? control = null) =>
        StepRunnerInputContractBuilder.Build(catalog, new() { StepRunnerKey = "sys:fixture", ControlFieldValue = control });
    private static QuickerRpcStepRunnerInputContractInput Read(StepRunnerInputParamDef input) => Build(Catalog(input)).Contract!.Inputs[0];

    public enum NativeType { Text = 0, Number = 1, Boolean = 2, Enum = 9 }
    public enum Mode { UseVarOrInput = 0, Input = 1, UseVar = 2, UseVarOnly = 3 }
    [Flags] public enum Sources { Unspecified = 0, FixedOption = 1, Literal = 2, Variable = 16 }
    public enum Hint { Default = 0, CaptureToolbar = 2 }
    public sealed record Option(string Value);
    public class NativeInput
    {
        public NativeType Type { get; set; }
        public Mode VariableMode { get; set; }
        public bool AllowInput { get; set; }
        public bool IsControlField { get; set; }
        public IEnumerable<Option>? SelectionItems { get; set; }
        public object? DefaultValue { get; set; }
        public IEnumerable<string>? ValidForList { get; set; }
        public IEnumerable<string>? InvalidForList { get; set; }
        public string? VisibleExpression { get; set; }
    }
    public sealed class ModernInput : NativeInput
    {
        public Sources InputSources { get; set; }
        public Hint EditorHint { get; set; }
        public object? VisibleWhen { get; set; }
    }
    public sealed class ThrowingInput { public bool AllowInput => throw new InvalidOperationException("fixture property"); }
    public interface IMultiOperationStep { }
    public sealed class NativeMultiOperation : IMultiOperationStep { }
}
