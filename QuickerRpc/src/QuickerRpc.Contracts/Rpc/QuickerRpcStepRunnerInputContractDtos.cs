using System.Collections.Generic;
using System.Runtime.Serialization;
using System.Text.Json.Serialization;

namespace QuickerRpc.Contracts.Rpc;

public sealed class QuickerRpcStepRunnerInputContractRequest
{
    public string StepRunnerKey { get; set; } = string.Empty;
    public string? ControlFieldValue { get; set; }
}

public sealed class QuickerRpcStepRunnerInputContractResult
{
    public bool Success { get; set; }
    public string? ErrorCode { get; set; }
    public string? ErrorMessage { get; set; }
    public QuickerRpcStepRunnerInputContract? Contract { get; set; }
}

/// <summary>Versioned runtime facts for a conservative literal-only editor; never UI schema.</summary>
[DataContract]
public sealed class QuickerRpcStepRunnerInputContract
{
    [DataMember(Name = "version")]
    [Newtonsoft.Json.JsonProperty("version", DefaultValueHandling = Newtonsoft.Json.DefaultValueHandling.Include, NullValueHandling = Newtonsoft.Json.NullValueHandling.Include)]
    [JsonPropertyName("version"), JsonIgnore(Condition = JsonIgnoreCondition.Never)]
    public int Version { get; set; } = 1;

    [DataMember(Name = "source")]
    [Newtonsoft.Json.JsonProperty("source", DefaultValueHandling = Newtonsoft.Json.DefaultValueHandling.Include, NullValueHandling = Newtonsoft.Json.NullValueHandling.Include)]
    [JsonPropertyName("source"), JsonIgnore(Condition = JsonIgnoreCondition.Never)]
    public string Source { get; set; } = "runtime-definition";

    [DataMember(Name = "hostKind")]
    [Newtonsoft.Json.JsonProperty("hostKind", DefaultValueHandling = Newtonsoft.Json.DefaultValueHandling.Include, NullValueHandling = Newtonsoft.Json.NullValueHandling.Include)]
    [JsonPropertyName("hostKind"), JsonIgnore(Condition = JsonIgnoreCondition.Never)]
    public string HostKind { get; set; } = "v1";

    [DataMember(Name = "stepRunnerKey")]
    [Newtonsoft.Json.JsonProperty("stepRunnerKey", DefaultValueHandling = Newtonsoft.Json.DefaultValueHandling.Include, NullValueHandling = Newtonsoft.Json.NullValueHandling.Include)]
    [JsonPropertyName("stepRunnerKey"), JsonIgnore(Condition = JsonIgnoreCondition.Never)]
    public string StepRunnerKey { get; set; } = string.Empty;

    [DataMember(Name = "controlFieldKey")]
    [Newtonsoft.Json.JsonProperty("controlFieldKey", DefaultValueHandling = Newtonsoft.Json.DefaultValueHandling.Include, NullValueHandling = Newtonsoft.Json.NullValueHandling.Include)]
    [JsonPropertyName("controlFieldKey"), JsonIgnore(Condition = JsonIgnoreCondition.Never)]
    public string? ControlFieldKey { get; set; }

    [DataMember(Name = "appliedControlFieldValue")]
    [Newtonsoft.Json.JsonProperty("appliedControlFieldValue", DefaultValueHandling = Newtonsoft.Json.DefaultValueHandling.Include, NullValueHandling = Newtonsoft.Json.NullValueHandling.Include)]
    [JsonPropertyName("appliedControlFieldValue"), JsonIgnore(Condition = JsonIgnoreCondition.Never)]
    public string? AppliedControlFieldValue { get; set; }

    [DataMember(Name = "visibilityResolved")]
    [Newtonsoft.Json.JsonProperty("visibilityResolved", DefaultValueHandling = Newtonsoft.Json.DefaultValueHandling.Include, NullValueHandling = Newtonsoft.Json.NullValueHandling.Include)]
    [JsonPropertyName("visibilityResolved"), JsonIgnore(Condition = JsonIgnoreCondition.Never)]
    public bool VisibilityResolved { get; set; }

    [DataMember(Name = "reservedBindings")]
    [Newtonsoft.Json.JsonProperty("reservedBindings", DefaultValueHandling = Newtonsoft.Json.DefaultValueHandling.Include, NullValueHandling = Newtonsoft.Json.NullValueHandling.Include)]
    [JsonPropertyName("reservedBindings"), JsonIgnore(Condition = JsonIgnoreCondition.Never)]
    public IList<string> ReservedBindings { get; set; } = new List<string>();

    [DataMember(Name = "inputs")]
    [Newtonsoft.Json.JsonProperty("inputs", DefaultValueHandling = Newtonsoft.Json.DefaultValueHandling.Include, NullValueHandling = Newtonsoft.Json.NullValueHandling.Include)]
    [JsonPropertyName("inputs"), JsonIgnore(Condition = JsonIgnoreCondition.Never)]
    public IList<QuickerRpcStepRunnerInputContractInput> Inputs { get; set; } = new List<QuickerRpcStepRunnerInputContractInput>();
}

/// <summary>Unknown native facts stay null and blocked; zero/false are confirmed values only.</summary>
[DataContract]
public sealed class QuickerRpcStepRunnerInputContractInput
{
    [DataMember(Name = "key")]
    [Newtonsoft.Json.JsonProperty("key", DefaultValueHandling = Newtonsoft.Json.DefaultValueHandling.Include, NullValueHandling = Newtonsoft.Json.NullValueHandling.Include)]
    [JsonPropertyName("key"), JsonIgnore(Condition = JsonIgnoreCondition.Never)]
    public string Key { get; set; } = string.Empty;

    [DataMember(Name = "policyKnown")]
    [Newtonsoft.Json.JsonProperty("policyKnown", DefaultValueHandling = Newtonsoft.Json.DefaultValueHandling.Include, NullValueHandling = Newtonsoft.Json.NullValueHandling.Include)]
    [JsonPropertyName("policyKnown"), JsonIgnore(Condition = JsonIgnoreCondition.Never)]
    public bool PolicyKnown { get; set; }

    [DataMember(Name = "varType")]
    [Newtonsoft.Json.JsonProperty("varType", DefaultValueHandling = Newtonsoft.Json.DefaultValueHandling.Include, NullValueHandling = Newtonsoft.Json.NullValueHandling.Include)]
    [JsonPropertyName("varType"), JsonIgnore(Condition = JsonIgnoreCondition.Never)]
    public int? VarType { get; set; }

    [DataMember(Name = "variableMode")]
    [Newtonsoft.Json.JsonProperty("variableMode", DefaultValueHandling = Newtonsoft.Json.DefaultValueHandling.Include, NullValueHandling = Newtonsoft.Json.NullValueHandling.Include)]
    [JsonPropertyName("variableMode"), JsonIgnore(Condition = JsonIgnoreCondition.Never)]
    public int? VariableMode { get; set; }

    [DataMember(Name = "allowInput")]
    [Newtonsoft.Json.JsonProperty("allowInput", DefaultValueHandling = Newtonsoft.Json.DefaultValueHandling.Include, NullValueHandling = Newtonsoft.Json.NullValueHandling.Include)]
    [JsonPropertyName("allowInput"), JsonIgnore(Condition = JsonIgnoreCondition.Never)]
    public bool? AllowInput { get; set; }

    [DataMember(Name = "isControlField")]
    [Newtonsoft.Json.JsonProperty("isControlField", DefaultValueHandling = Newtonsoft.Json.DefaultValueHandling.Include, NullValueHandling = Newtonsoft.Json.NullValueHandling.Include)]
    [JsonPropertyName("isControlField"), JsonIgnore(Condition = JsonIgnoreCondition.Never)]
    public bool? IsControlField { get; set; }

    [DataMember(Name = "visibilityResolved")]
    [Newtonsoft.Json.JsonProperty("visibilityResolved", DefaultValueHandling = Newtonsoft.Json.DefaultValueHandling.Include, NullValueHandling = Newtonsoft.Json.NullValueHandling.Include)]
    [JsonPropertyName("visibilityResolved"), JsonIgnore(Condition = JsonIgnoreCondition.Never)]
    public bool VisibilityResolved { get; set; }

    [DataMember(Name = "visible")]
    [Newtonsoft.Json.JsonProperty("visible", DefaultValueHandling = Newtonsoft.Json.DefaultValueHandling.Include, NullValueHandling = Newtonsoft.Json.NullValueHandling.Include)]
    [JsonPropertyName("visible"), JsonIgnore(Condition = JsonIgnoreCondition.Never)]
    public bool Visible { get; set; }

    /// <summary>allowed | existing-literal-only | existing-nonempty-literal-only | never | unknown.</summary>
    [DataMember(Name = "literalPolicy")]
    [Newtonsoft.Json.JsonProperty("literalPolicy", DefaultValueHandling = Newtonsoft.Json.DefaultValueHandling.Include, NullValueHandling = Newtonsoft.Json.NullValueHandling.Include)]
    [JsonPropertyName("literalPolicy"), JsonIgnore(Condition = JsonIgnoreCondition.Never)]
    public string LiteralPolicy { get; set; } = "unknown";

    [DataMember(Name = "blockedReason")]
    [Newtonsoft.Json.JsonProperty("blockedReason", DefaultValueHandling = Newtonsoft.Json.DefaultValueHandling.Include, NullValueHandling = Newtonsoft.Json.NullValueHandling.Include)]
    [JsonPropertyName("blockedReason"), JsonIgnore(Condition = JsonIgnoreCondition.Never)]
    public string? BlockedReason { get; set; }

    [DataMember(Name = "options")]
    [Newtonsoft.Json.JsonProperty("options", DefaultValueHandling = Newtonsoft.Json.DefaultValueHandling.Include, NullValueHandling = Newtonsoft.Json.NullValueHandling.Include)]
    [JsonPropertyName("options"), JsonIgnore(Condition = JsonIgnoreCondition.Never)]
    public IList<string> Options { get; set; } = new List<string>();
}
